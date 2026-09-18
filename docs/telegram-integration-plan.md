# Telegram integration — architecture plan

Written before any code was changed. It is the record of what the repository
and the live deployment actually are, and of the decisions taken because of
them. `docs/telegram.md` is the operator's manual; this is the reasoning.

## 1. The system as it exists

One npm workspace, three packages, **one process**.

| Package | What it owns |
| --- | --- |
| `@battle/shared` | Pure game engine, challenge decks, Elo + ranks, XP/levels, achievements, cosmetics, the wire protocol, the zod schemas that guard it |
| `@battle/server` | Node HTTP + `ws` gateway, accounts, sessions, matchmaking queue, in-memory rooms, SQLite, photo verification, optional Gemini referee |
| `@battle/client` | React 19 SPA — landing, home, play, leaderboard, profile, ranks, awards, store, settings, and the fullscreen room |

Key facts that constrain everything below:

- **`node:sqlite` is the database.** `Database` (`packages/server/src/database.ts`)
  runs its migrations inline at boot, WAL, `synchronous=FULL`, foreign keys on.
  There is no migration tool and no ORM. New tables are added the same way:
  idempotent `CREATE TABLE IF NOT EXISTS` inside the boot transaction, with a
  row in `migrations`.
- **Identity is one id.** `accounts.id` *is* `profiles.id` — the account row and
  the rating row share a primary key. There is no second user table and there
  must not be one.
- **Sessions are opaque tokens.** `sessions(token_hash, account_id, expires_at)`,
  SHA-256 of a 32-byte random token, handed to the browser as an HttpOnly
  `battle_session` cookie with `SameSite=Strict`.
- **Rooms live in memory, in this process.** `RoomManager` holds a `Map`. The
  README is explicit that a second instance behind a load balancer would need a
  shared room registry first. Any Telegram work must not assume otherwise.
- **The match result is written in exactly one place**: `Room.settleRatings()`
  calls `recordMatch()` from `standings.ts` inside one SQLite transaction, which
  also pays coins through `Database.rewardMatch`. That is the only point where
  "a ranked match finished" is known authoritatively.
- **Achievements, XP, levels, ranks and Elo already exist** and are good. The
  brief asks for an achievement system "if the game does not have one" — it does,
  in `packages/shared/src/achievements.ts`, driven by a pure function of a
  settled profile plus one match summary. Nothing here duplicates it.

### What production actually is

`https://duel-battle.onrender.com` — single Render web service, serving the
built client and the API and the WebSocket from one origin.

```
GET /healthz   -> {"ok":true,"rooms":0,"players":0,"uptimeSec":8591}
GET /readyz    -> {"ready":true}
GET /api/auth/providers -> {"google":false,"email":false}
```

That last line is the finding that shapes the whole project: **no sign-in method
is configured in production.** `GOOGLE_CLIENT_ID`/`SECRET` are unset and so is
`RESEND_API_KEY`, and `AuthProviders.options()` refuses email registration in
production without a mail service. Today nobody can create an account on the
live site, which means nobody can play ranked, hold a rating, appear on the
leaderboard, or buy anything.

Telegram is therefore not a nice-to-have channel. **It is the first sign-in that
will work in production**, and it arrives with a verified identity, a display
name, an avatar and a push channel already attached.

## 2. Two blockers found in the audit

Both are real, both are cheap to fix, and neither is obvious until you try it.

### 2.1 The app forbids being framed

`packages/server/src/http.ts` sends, with the app document:

```
x-frame-options: DENY
content-security-policy: ... frame-ancestors 'none' ...
```

Telegram Desktop and Telegram Web run a Mini App **in an iframe** hosted by
`web.telegram.org`. With those two headers the Mini App shows a blank pane on
every desktop client. (On iOS/Android the Mini App is a native WebView and would
have worked, which is exactly the kind of bug that ships.)

**Decision.** Document headers become per-path. A request whose path is the Mini
App entry gets a Telegram profile: no `X-Frame-Options`, `frame-ancestors`
limited to Telegram's own origins, and `script-src` extended with
`https://telegram.org` so the official SDK can load. Every other path keeps the
existing lockdown byte for byte.

### 2.2 Cookies do not survive the iframe

`battle_session` is `SameSite=Strict`. In a cross-site iframe it is simply not
sent, and `SameSite=None` only trades that for third-party-cookie blocking in
Safari and Chrome's partitioning. A cookie session cannot be the Mini App's
authentication.

**Decision.** The Mini App authenticates with a **bearer token**, not a cookie.
`AuthService` learns to read `Authorization: Bearer <token>` in addition to the
cookie — same `sessions` table, same expiry, same revocation, one session model.
The token is held in memory for the life of the Mini App launch and re-minted
from `initData` on every launch, so no storage is required and none is trusted.

The WebSocket has the same problem: the gateway reads the session cookie during
the HTTP upgrade. **Decision.** `hello` gains an optional `auth` field carrying
the bearer token. It is additive and optional, so an old client still validates;
no protocol version bump is needed, and the token never appears in a URL.

## 3. Where the code goes

```
packages/shared/src/telegram.ts          DTOs shared by both sides
packages/server/src/telegram/
  config.ts        env, admin allow-list, feature flag
  initData.ts      validateTelegramInitData — pure, unit-tested, no I/O
  api.ts           TelegramBotApi — the only place that talks to api.telegram.org
  schema.ts        every new table, one idempotent migration
  identity.ts      Telegram user  <->  existing account
  links.ts         one-time codes that attach Telegram to an existing account
  duels.ts         friend challenges
  referrals.ts     codes, claims, rewards
  quests.ts        daily missions, progress server-side
  social.ts        friends, recent opponents, blocks, reports
  streaks.ts       daily play streak (separate from the win streak)
  entitlements.ts  premium, provider-agnostic
  payments.ts      Telegram Stars, idempotent
  notifications.ts NotificationService + outbox + Telegram provider
  analytics.ts     server-side event log
  admin.ts         allow-listed commands, audit trail
  bot.ts           command + callback router, message design system
  webhook.ts       update intake, idempotent
  http.ts          /api/telegram/* routes
  service.ts       composition root for all of the above
packages/client/src/telegram/            Mini App (own root, shared design system)
```

Nothing above replaces anything. `createApp()` gains one optional service; when
`TELEGRAM_BOT_TOKEN` is absent the whole subsystem is simply not constructed and
the server behaves exactly as it does today.

## 4. Identity model

```sql
telegram_identities (
  telegram_user_id INTEGER PRIMARY KEY,          -- the identity. Never the username.
  account_id       TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  username, first_name, last_name, language_code, photo_url,
  allows_write_to_pm INTEGER, is_premium INTEGER,
  created_at, updated_at, last_seen_at
)
```

Both columns are unique: one Telegram account maps to one Duel Battle account
and back. `username` is cache, refreshed on every authentication, and is never
used to decide who somebody is.

Three ways in, all of them ending at one account:

- **New Telegram user** — an account row and a profile row are created in the
  same transaction, `username` is the existing generated `p_<id>` form, password
  hash is `external` (which can never match a password).
- **Returning Telegram user** — matched on `telegram_user_id`; the cached name
  and photo are refreshed.
- **Existing web player** — `/settings` issues a one-time code, `TG-XXXXXX`,
  hashed in the database, valid for ten minutes, single use, rate-limited per
  account. `t.me/<bot>?start=link_TG-XXXXXX` attaches Telegram to the account
  that generated it. There is no "sign in with your username" path, ever.

## 5. Authentication, precisely

```
Mini App                          Server
--------                          ------
Telegram.WebApp.initData  ──────► POST /api/telegram/auth  { initData, startParam? }
(raw query string, never                │
 initDataUnsafe)                        │ 1. parse as query string
                                        │ 2. lift out `hash`; exclude `hash` and
                                        │    `signature` from the check string
                                        │ 3. sort remaining pairs, join with \n
                                        │ 4. secret = HMAC_SHA256("WebAppData", token)
                                        │ 5. timing-safe compare HMAC(secret, check)
                                        │ 6. reject auth_date older than TTL, or
                                        │    dated in the future
                                        │ 7. find-or-create account, refresh cache
                                        │ 8. mint a session row
   { token, expiresAt, me } ◄───────────┘
```

`validateTelegramInitData` takes the raw string and the bot token and returns a
typed result or a reason. It does no I/O, touches no database and logs nothing,
so it is trivially unit-testable — forged hash, tampered user id, stale
`auth_date`, future `auth_date`, missing `hash`, replayed string with an extra
field, empty token.

Raw `initData` is never stored. The bot token never leaves the server.

## 6. Bot transport

**Webhook**, not polling. Render's free tier sleeps and restarts; long polling
from inside the web process would fight the request timeout, duplicate across
restarts, and give no back-pressure. A webhook is one more route on a server
that is already public over HTTPS, and Render's own health checks keep it warm.

```
POST /api/telegram/webhook
  X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>   (timing-safe compare)
```

Every update is recorded in `telegram_updates(update_id PRIMARY KEY)` before it
is handled; a duplicate delivery is dropped at that row. The handler answers 200
immediately and does the work after, because Telegram retries anything slow —
and a retry that rewards a referral twice is the bug this table exists to
prevent.

## 7. Notifications

```
NotificationService.notify(accountId, kind, payload)
        │
        ├─ preferences?  (per-kind toggle, quiet hours, allows_write_to_pm)
        ├─ dedupe_key already in the outbox?  -> drop
        └─ INSERT INTO notification_outbox(..., not_before)
                                │
                     drained by one interval worker
                                │
                     TelegramNotificationProvider -> sendMessage
```

Nothing in a request path ever waits on `api.telegram.org`. Delivery failures
back off and retry; a `403 bot was blocked` clears the preference row instead of
retrying forever. `dedupe_key` is what makes "you won" a single message even if
the room settles twice.

Kinds shipped: match result, challenge received, challenge accepted, friend
joined via your link, achievement unlocked, rank change, streak milestone,
referral reward, premium activated, weekly recap.

## 8. The Mini App

One more root inside the existing client, not a second project:

`main.tsx` renders `<TelegramApp/>` instead of `<App/>` when the path starts with
`/tg`. It shares the design system (`system.css` tokens, the plate shape, the
acid/coral seat colours), the `MatchStore`, the socket, `useCamera`, the i18n
layer, and — this is the point — **the existing `Room` screen**. A duel inside
Telegram is the same arena, the same prompts, the same knockout, because it is
literally the same component.

Screens: Home, Duel (search/opponent found/countdown → Room), Rank, Social,
Profile, plus Quests, Achievements, Match detail, Challenge accept, Premium and
Settings. Bottom navigation has five destinations and every one of them does
something the others do not.

Telegram-native behaviour: `ready()`/`expand()`, theme variables mapped onto the
existing tokens, `BackButton` wired to the app's own history, safe-area insets,
haptics on the moments that deserve them, `shareMessage`/`openTelegramLink` for
sharing rather than "copy this link".

## 9. Deep links

| Link | Payload | Effect |
| --- | --- | --- |
| `t.me/<bot>?startapp=ref_CODE` | referral | records the inviter on first launch, once, never rewritable |
| `t.me/<bot>?startapp=duel_CODE` | challenge | opens the accept screen for that challenge |
| `t.me/<bot>?startapp=profile` / `rank` / `quests` | section | deep-links a tab |
| `t.me/<bot>?start=link_TG-XXXXXX` | account link | attaches Telegram to an existing web account |
| `t.me/<bot>?start=ref_CODE` | referral | same as above, from the chat side |

Every payload is matched against a strict pattern before anything reads it.
Unknown payloads open the home screen and are not echoed back to the user.

## 10. Premium and payments

`EntitlementService` answers one question — *does this account have `premium`,
and until when* — from an `entitlements` table with a `source` column. Telegram
Stars is one source; a future web subscription is another; the feature checks
never learn which.

Stars flow: `createInvoiceLink` (currency `XTR`, empty provider token) →
`openInvoice` in the Mini App → `pre_checkout_query` answered inside ten seconds
→ **entitlement granted only on `successful_payment`**, keyed by
`telegram_payment_charge_id`, which is the primary key of the `payments` table
and therefore the idempotency guarantee. `/paysupport` is a real command with a
real flow, and `refundStarPayment` is wired for support use.

Price is configuration (`TELEGRAM_PREMIUM_STARS`), in one place.

## 11. Anti-abuse

| Surface | Control |
| --- | --- |
| `initData` | HMAC + `auth_date` TTL, both server-side |
| Webhook | secret token, timing-safe, plus `update_id` idempotency |
| Account linking | hashed one-time code, ten-minute expiry, per-account rate limit |
| Referrals | one inviter per invitee, set once; self-referral rejected; reward only after the invitee finishes a real match |
| Challenges | opaque codes, expiry, single accept, host and guest both authorised |
| Payments | charge id primary key; entitlement written in the same transaction |
| Premium | server-side only; the client is told, never asked |
| Quests | progress written from the settlement hook, never from the client |
| Admin | numeric Telegram id allow-list from the environment, audited |
| Every route | token buckets keyed by account or address, reusing `TokenBuckets` |

## 12. What must not break

Regression bar for the whole change: existing browser sign-in, the existing
game, rooms, matchmaking, WebSocket, WebRTC-era media paths, cosmetics and
coins, the existing database contents, and every existing URL. The suite is 768
tests; it passes before this work and must pass after, with the Telegram tests
added on top.

## 13. Deployment on Render

- Same service, same process. No second dyno, no worker, no cron.
- The outbox worker and the sweeper are `setInterval` with `unref()`, exactly
  like the existing ticker and matchmaker.
- `TELEGRAM_MINI_APP_URL` must be the public HTTPS origin; Telegram will not
  open anything else.
- The webhook is registered once at boot when `TELEGRAM_BOT_ENABLED=1`, and
  re-registration is idempotent.
- Cold starts: the first webhook after a sleep may take several seconds.
  Telegram retries, and `update_id` de-duplication makes the retry harmless.

## 14. Local development

`TELEGRAM_BOT_TOKEN` in `.env`, a tunnel for the webhook, `TELEGRAM_MINI_APP_URL`
pointing at the tunnel. For UI work without Telegram at all, the Mini App runs
in a plain browser at `/tg` in development and says so — it renders with a
mocked launch context and refuses to talk to any endpoint that needs a real
signature. Full steps in `docs/telegram.md`.

## 15. Risks accepted

- **One process.** Rooms are in memory; a restart still interrupts a live match.
  Telegram does not change that and does not pretend to.
- **Camera in a WebView.** `getUserMedia` inside the Telegram WebView needs the
  user's permission twice on some Android builds. The Mini App detects a denied
  camera and offers to open the duel in the system browser rather than dying.
- **Third-party storage.** Nothing in the Mini App depends on `localStorage`
  surviving; every launch re-authenticates from `initData`.
- **Render sleep.** First open after sleep is slow. The bot's reply is sent from
  the webhook, so the user sees a message rather than a dead button.
