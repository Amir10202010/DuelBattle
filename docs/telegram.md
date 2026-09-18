# Duel Battle in Telegram

A bot and a Mini App on top of the game that already exists. Same server, same
database, same accounts, same arena — Telegram is a way in, not a second
product.

The reasoning behind the design is in
[docs/telegram-integration-plan.md](telegram-integration-plan.md). This file is
what an operator needs.

## 1. Architecture

```
Telegram client
   │  Mini App (a page on your own origin, framed by Telegram on desktop)
   │  Bot chat (webhook)
   ▼
packages/server                     one process, the one you already run
   ├── /api/telegram/auth           validates initData, mints a session
   ├── /api/telegram/…              the Mini App's screens
   ├── /api/telegram/webhook        bot updates, secret-token protected
   └── src/telegram/                identity, duels, referrals, quests,
                                    notifications, payments, admin
packages/client
   └── src/telegram/                the Mini App, served at /tg
```

Nothing is duplicated. A Telegram player is a row in `accounts`, which is the
same row a browser signs into and shares a primary key with `profiles`. A duel
started from Telegram runs in the same `Room` the web app uses.

**With no `TELEGRAM_BOT_TOKEN` the whole subsystem is never constructed**: no
routes, no timers, no behaviour change. That is the supported way to run the
game without a bot.

## 2. Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | to enable anything | From BotFather. Server-side only, never in a `VITE_*` variable. |
| `TELEGRAM_BOT_USERNAME` | for links | Without the `@`. Every `t.me` link the product hands out is built from it. |
| `TELEGRAM_MINI_APP_URL` | for the Mini App | Your public HTTPS origin, no trailing slash, e.g. `https://duel-battle.onrender.com`. Falls back to `APP_ORIGIN`. |
| `TELEGRAM_WEBHOOK_SECRET` | for the bot | A long random string. Without it the webhook is **not registered** and the endpoint answers 404 to everyone. |
| `TELEGRAM_ADMIN_IDS` | optional | Comma-separated numeric Telegram user ids. Usernames are not accepted. |
| `TELEGRAM_SUPPORT_CHAT_ID` | optional | Where support enquiries are directed. |
| `TELEGRAM_BOT_ENABLED` | optional | `0` switches the integration off without removing the token. |
| `TELEGRAM_PREMIUM_STARS` | optional | Price in Telegram Stars. Default 250. |
| `TELEGRAM_PREMIUM_DAYS` | optional | Length of one purchase in days; `0` means it never expires. Default 30. |
| `TELEGRAM_REFERRAL_REWARD` | optional | Battle coins to the inviter. Default 150. |
| `TELEGRAM_REFERRAL_WELCOME` | optional | Battle coins to the invitee. Default 75. |

Generate a webhook secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## 3. BotFather setup

In [@BotFather](https://t.me/BotFather):

1. `/newbot` — pick a name and a username. **Copy the token into
   `TELEGRAM_BOT_TOKEN` and nowhere else.** Never commit it.
2. `/mybots` → your bot → **Bot Settings → Menu Button** → set the URL to
   `https://<your-domain>/tg`.
3. `/mybots` → your bot → **Bot Settings → Configure Mini App** → enable, URL
   `https://<your-domain>/tg`.
4. `/setdomain` — set your domain, so Telegram will open the Mini App at all.
5. If you will sell Premium: `/mybots` → **Payments**; Telegram Stars needs no
   provider token, but the bot must be allowed to accept payments.

You do **not** need to set the command list, the description or the menu button
by hand. The server does all three at boot — `TelegramService.register()` —
and re-applies them on every deploy, in English and Russian.

## 4. Local development

```bash
cp .env.example .env          # then fill in the Telegram block
npm ci
npm run dev
```

Open `http://localhost:5173/tg`. Outside Telegram the Mini App says so and
offers the browser game instead; that screen is the expected result, not a bug.

To exercise the real thing you need Telegram to reach your machine:

```bash
# any HTTPS tunnel will do
npx untun@latest tunnel http://localhost:5173
```

Then set `TELEGRAM_MINI_APP_URL` to the tunnel's HTTPS origin, restart, and
point BotFather's Mini App URL at `<tunnel>/tg`. The server registers the
webhook against `TELEGRAM_MINI_APP_URL` automatically at boot.

Checking a screen without Telegram at all: sign in from the command line and
call the API with the bearer token. This is what the integration tests do.

```bash
node -e "
const {createHmac}=require('node:crypto');
const token=process.env.TELEGRAM_BOT_TOKEN;
const fields={auth_date:String(Math.floor(Date.now()/1000)),
  user:JSON.stringify({id:1,first_name:'Dev',allows_write_to_pm:true})};
const check=Object.keys(fields).sort().map(k=>k+'='+fields[k]).join('\n');
const secret=createHmac('sha256','WebAppData').update(token).digest();
console.log(new URLSearchParams({...fields,
  hash:createHmac('sha256',secret).update(check).digest('hex')}).toString());
"
```

## 5. Production deployment (Render)

The integration adds **no new service, no worker and no cron**. Set the
variables above on the existing web service and redeploy.

- The outbox worker and the sweeper are `setInterval` with `unref()`, exactly
  like the existing match ticker.
- The webhook is registered at boot and re-registered on every deploy, which is
  idempotent.
- Cold starts: the first webhook after a sleep can take several seconds.
  Telegram retries, and `telegram_updates.update_id` makes the retry harmless.
- Health checks are unchanged: `/healthz` and `/readyz`.

Verify after deploying:

```bash
curl -fsS https://<your-domain>/healthz
curl -fsS https://<your-domain>/readyz
# The Mini App document must be framable by Telegram and by nobody else:
curl -sI https://<your-domain>/tg | grep -i 'content-security-policy\|x-frame-options'
curl -sI https://<your-domain>/  | grep -i 'content-security-policy\|x-frame-options'
```

`/tg` must show `frame-ancestors https://web.telegram.org …` and **no**
`x-frame-options`. `/` must still show `frame-ancestors 'none'` and
`x-frame-options: DENY`. If `/tg` sends `DENY`, the Mini App will be blank on
Telegram Desktop and Telegram Web.

## 6. Database

One migration, applied at boot inside the existing transaction, recorded as
version 5. It only creates tables; nothing existing is altered or dropped.

`telegram_identities`, `player_refs`, `telegram_updates`, `telegram_link_codes`,
`telegram_duels`, `referral_codes`, `referral_claims`, `notification_prefs`,
`notification_outbox`, `entitlements`, `telegram_payments`, `player_friends`,
`recent_opponents`, `player_blocks`, `player_reports`, `daily_quests`,
`daily_streaks`, `analytics_events`, `admin_audit`.

Every one hangs off `accounts(id)` with `ON DELETE CASCADE`, so deleting an
account still deletes the person. Back up exactly as before — the same file.

## 7. Authentication

The Mini App sends raw `Telegram.WebApp.initData` to `POST /api/telegram/auth`.
The server checks the HMAC against the bot token, rejects anything older than
24 hours or dated in the future, and only then looks anything up. `initData` is
never stored.

The session is the **same session the web app uses** — one row in `sessions` —
but the Mini App presents it as `Authorization: Bearer <token>` instead of a
cookie, because inside Telegram's desktop iframe a `SameSite=Strict` cookie is
never sent. The WebSocket carries it in the `hello` message for the same reason.

The token lives in memory for one launch and is minted fresh next time.

## 8. Deep links

| Link | Effect |
| --- | --- |
| `t.me/<bot>?startapp=ref_CODE` | records the inviter, once, permanently |
| `t.me/<bot>?startapp=duel_CODE` | opens that challenge |
| `t.me/<bot>?startapp=go_rank` | opens a tab (`home`, `duel`, `rank`, `social`, `profile`) |
| `t.me/<bot>?start=link_TG-XXXXXX` | attaches Telegram to an existing web account |
| `t.me/<bot>?start=ref_CODE` | as above, from the chat side |

Anything else opens the home screen and is not echoed back.

## 9. Linking an existing web account

1. The player, signed in on the web, calls `GET /api/telegram/link` (Settings).
2. They get `TG-XXXXXX`, valid ten minutes, single use, hashed at rest, at most
   three outstanding at a time.
3. They send it to the bot, or open `t.me/<bot>?start=link_TG-XXXXXX`.
4. The bot attaches Telegram to that account.

If the Telegram account already had an empty player — which it will, because the
bot answered them before the code arrived — that shell is deleted and the web
account wins. A Telegram account with matches, XP or purchases behind it is
**never** merged; the bot says so instead.

## 10. Referrals

One inviter per invitee, set once, never rewritten. Self-referral is refused,
and so is anybody with more than three matches already played. **Both sides are
paid only when the invited player finishes a real match**, through the coin
ledger, whose `(account, receipt)` primary key makes a second payment
impossible.

## 11. Notifications

`NotificationService.notify()` writes a row; one worker drains it every five
seconds. Nothing in a request path waits on Telegram.

Each message is checked against the player's own toggles, their quiet hours, and
Telegram's `allows_write_to_pm`, both when queued and again when sent. Results,
achievements, rank changes and streaks are held 45 seconds and dropped if the
player was in the app — telling somebody they won while they are looking at the
victory screen is noise. A `403` (bot blocked) switches every toggle off rather
than retrying forever.

`dedupe_key` is what makes one event one message.

## 12. Premium and payments

Telegram Stars only. `createInvoiceLink` (currency `XTR`, empty provider token)
→ `openInvoice` in the Mini App → `pre_checkout_query` answered within ten
seconds → **the entitlement is granted only on `successful_payment`**, keyed by
`telegram_payment_charge_id`, which is the primary key of `telegram_payments`.

The Mini App's own "paid" callback grants nothing; it refreshes the screen.

Buying again extends from the current expiry rather than restarting it.
`/paysupport` shows the player their own charges. Refunds go through
`refundStarPayment`, and the entitlement is only revoked after Telegram accepts.

## 13. Admin

`/admin` in the bot, for Telegram ids listed in `TELEGRAM_ADMIN_IDS`. It shows
players, DAU/WAU/MAU, duels today, invite conversion, premium holders, the
notification queue and open reports, plus a 24-hour and 7-day funnel.

Reports are reviewed by a person. Nothing in this system bans anybody
automatically, and every admin action is written to `admin_audit` before it
takes effect.

## 14. Troubleshooting

**The Mini App is blank on desktop, fine on a phone.** The document is being
served with `x-frame-options: DENY`. Check section 5; `/tg` must not send it.

**"We could not verify this Telegram session."** The bot token the server holds
is not the one that signed the launch. Usually a stale `TELEGRAM_BOT_TOKEN`
after regenerating it in BotFather.

**"That Telegram session has expired."** The launch is more than 24 hours old,
or the server clock is wrong. Check the server's time first.

**The bot does not answer.** `TELEGRAM_WEBHOOK_SECRET` is unset, so the webhook
was never registered — look for `telegram webhook not registered` in the logs.
Confirm with `https://api.telegram.org/bot<token>/getWebhookInfo`.

**Commands look wrong in the chat menu.** They are set at boot. Check the logs
for `telegram api rejected a call`; a 401 there means the token is wrong.

**Notifications never arrive.** In order: the player must have opened the bot
(`allows_write_to_pm`), the toggle must be on, it must not be their quiet hours,
and they must not have been in the app in the last 45 seconds for a result
message. `SELECT state, last_error FROM notification_outbox ORDER BY id DESC`
tells you which.

**Nobody appears on the leaderboard.** Unchanged behaviour: five ranked matches
are needed before a player is listed.

## 15. What Telegram never gets

The bot token stays on the server. Raw `initData` is never stored. Payloads to
the Mini App carry an opaque `ref` for other players, never an account id and
never anybody else's Telegram id. Logs record event names and error types, never
secrets, never `initData`, never a payment token.
