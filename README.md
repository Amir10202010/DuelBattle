# DuelBattle

**Your room is the arena.** A complete, local-first-development MVP of a private 1v1 webcam challenge game. Invite a friend, turn on your cameras, race to show an answer, confirm snapshots, win three rounds, and rematch.

## Run locally

Requires **Node.js 24.14+** and npm. No API keys, payment account, database service or AI service are required.

```sh
npm ci
npm run dev
```

Open **http://localhost:3000**. Use two different browser profiles, two browsers, or an incognito window to act as different players. Two tabs in the same browser profile share one identity and are deliberately prevented from occupying both slots.

Production build and local production smoke test:

```sh
npm run build
npm start
```

Stop the development process before starting production on the same port. SQLite is created automatically at `data/duelbattle.sqlite`. An optional `.env` file is loaded automatically; copy `.env.example` to `.env` to customize settings.

**Playing from different computers:** use an HTTPS origin reachable by both players and set `APP_ORIGIN` to that exact origin. A localhost invite only works on the same computer. Browser camera APIs require HTTPS except on localhost. Provision TURN for reliable connectivity across restrictive networks.

## What works

- Private create/join/invite flow with validated names and secure guest identity.
- Real Socket.IO state synchronization and peer-to-peer WebRTC camera/audio transport.
- User-initiated camera permission, optional microphone, muted/off controls and friendly recovery states.
- Server-authoritative ready/countdown/race/review/result/next-round/match-result state machine.
- Twenty reviewed challenges spanning all eleven categories; first to three wins, with bounded tie rounds.
- Intentional JPEG snapshot submission, opponent confirmation, server receipt ordering, duplicate/replay guards and review expiry.
- Actual on-device temporal color guidance in a central presentation zone. It never awards a point or claims to identify a player or held object.
- Best-of-five scoring, simultaneous-attempt arbitration, rematches, invite copying, native share and clipboard fallback.
- Refresh/reconnect recovery, pause when a player disconnects or disables their camera, 30-second grace period and stale-room cleanup.
- Three free started battles per participant per UTC day, atomic two-player usage charges and server-owned Premium entitlements.
- Responsive landing/lobby/arena/results, keyboard focus, semantic dialogs, accessible labels, reduced motion and clear error states.
- SQLite migrations, hashed expiring session tokens, usage records, expiring subscription records and finished-match metadata.
- Strict Zod boundaries, membership checks, CSRF-bound socket sessions, same-origin handshake validation, CSP, prepared SQL and rate/payload limits.

## Verification: honest limits

The shipping verifier is **opponent review**, including for objects, actions and personal/subjective prompts. A client cannot declare a win. It submits a snapshot; the other authenticated player judges it, and the server determines the result. An earlier pending snapshot blocks a later accepted one until reviewed or expired. Each review lasts eight seconds; each player may submit three snapshots per round. A race lasts 30 seconds; a final pending review may extend adjudication by up to eight seconds.

The color guide runs locally at four samples per second, sampling a small central crop and requiring three stable detections. This is a real pixel heuristic, not AI object recognition. It cannot prove possession or reject every background object; opponent review is always required. Arbitrary actions, poses and personal claims are not automatically recognized. There are no fake model responses or continuous uploads.

There is no prize, ranked ladder or fraud-proof adjudication. Friends can intentionally approve incorrect answers; the MVP is an honor-based social game. Server receipt time favors lower-latency connections. It is not tournament timing.

## Architecture and stack

| Boundary                    | Choice                                            | Reason                                                               |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| UI                          | React 19, TypeScript, Vite 7, local fonts, Lucide | Typed, fast client with a focused build pipeline                     |
| Server                      | Node 24, Express 5                                | One maintainable application process                                 |
| Realtime game and signaling | Socket.IO 4                                       | Reconnection, room delivery, acknowledgments                         |
| Cameras                     | Browser WebRTC                                    | Media travels peer-to-peer or via TURN, not through the game backend |
| Durable data                | Node `node:sqlite`, WAL, prepared statements      | No separate service for modest single-process workloads              |
| Validation                  | Zod 4                                             | Strict schemas at every untrusted action boundary                    |
| Tests                       | Vitest, Playwright, axe-core                      | Domain, real transport, actual browser/media pipeline, accessibility |
| Packaging                   | Docker, Compose, GitHub Actions                   | Reproducible installation, CI and a persistent-host deployment path  |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for state, privacy, security and scaling decisions. The Sites runtime was inspected during stack selection; this app needs a persistent Node process and was not published as a static or incomplete Site.

## Intentional extension points

- `VerificationProvider` in `server/verification.ts`: isolated evidence evaluation; provider outages fall back to human review.
- `ChallengeGenerator` / `generateProposal` in `shared/challenges.ts`: schema and rule validation; all generated/custom proposals are quarantined as `PENDING_REVIEW`. Only the reviewed catalog enters matches.
- `SubscriptionProvider` and `Store.grantPremium`: server-owned entitlement boundary. No client Premium flag and no checkout/payment simulation. A real billing integration must authenticate customers and verify signed webhooks before writing entitlements.
- `RoundSummary` and persisted match summaries: metadata groundwork for result/replay composition. Actual recording, clips, spectators, matchmaking, rankings and advanced vision are future work.

An operator can assign a real, time-bounded entitlement in the local database for evaluation:

```sh
npm run subscription -- <user-id> 2026-12-31T23:59:59Z
```

The browser's own `id` is returned by `/api/session`. This CLI requires access to the server database; it does not process money. Premium has no daily cap but permits at most **one started battle per hour**. Custom challenges remain unavailable in the UI until review and billing workflows exist. Starting and rematching both consume usage; failed or cancelled matches after countdown starts are not refunded, to avoid trivial quota bypass.

## Tests and checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs typecheck, lint, domain/transport tests and production build. Run browser tests separately after building. They start a separate **production** server at `http://localhost:3100`, use an isolated in-memory database, and never consume your normal development quota.

If the Playwright download is unavailable, use an installed Chrome browser. PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

POSIX:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser tests use Chromium's synthetic camera/microphone devices. They exercise the real `getUserMedia` → WebRTC → remote video pipeline and real HTTP/Socket.IO servers. They do not verify physical camera hardware or internet TURN routing. Permission failures are deliberately injected in one test; gameplay and winners are not mocked. Screenshots and traces are written to `test-results/` and `playwright-report/`. See [docs/QA.md](docs/QA.md) for the recorded audit.

## Environment

| Variable             | Default                            | Purpose                                                      |
| -------------------- | ---------------------------------- | ------------------------------------------------------------ |
| `PORT`               | `3000`                             | HTTP and WebSocket port                                      |
| `HOST`               | `0.0.0.0`                          | Listen interface                                             |
| `APP_ORIGIN`         | `http://localhost:3000`            | Exact browser origin; use HTTPS in production                |
| `DATABASE_PATH`      | `./data/duelbattle.sqlite`         | Writable SQLite path on a persistent volume                  |
| `TRUST_PROXY`        | `0`                                | Set `1` only behind exactly one trusted reverse proxy        |
| `STUN_URL`           | `stun:stun.cloudflare.com:3478`    | Public STUN endpoint; empty disables STUN                    |
| `TURN_URLS`          | empty                              | Comma-separated `turn:`/`turns:` relay URLs                  |
| `TURN_SECRET`        | empty                              | Server-only coturn REST shared secret; never sent to clients |
| `NODE_ENV`           | inferred by production entry point | `production` when running the built entry point              |
| `PLAYWRIGHT_CHANNEL` | bundled Chromium                   | Optional installed test browser, e.g. `chrome` or `msedge`   |

TURN credentials expire in one hour. Refreshing/rejoining creates a new peer connection and fetches new credentials. The shared secret must match your relay server. No AI or payment keys are used by this version.

## Deployment

```sh
docker compose up --build -d
```

Run a **single replica** behind an HTTPS reverse proxy supporting WebSocket upgrades and an idle timeout longer than 60 seconds. Point `APP_ORIGIN` at the public origin. Mount the SQLite data directory, back it up using SQLite's backup facilities (or stop the process before copying), set a trusted proxy configuration, and provision a TURN relay. Health check: `/api/health`.

Production cookies are Secure/HttpOnly/SameSite Strict; CSP blocks third-party scripts and framing by other origins. No unauthenticated administrative routes are exposed. Unknown application paths receive an intentional 404 screen. Deploy all of `dist/server`, `dist/client`, production dependencies and `package.json` together.

## Remaining limitations

- Active rooms are in memory and intentionally end on server restart. Finished results/usage persist. Horizontal scaling needs partitioned room ownership and shared persistence; a Socket.IO adapter alone is insufficient.
- Guest identity is browser-based. Clearing cookies can evade the daily quota; IP throttles limit obvious abuse but verified accounts are needed before commercial subscriptions.
- Most home networks can connect through STUN; restrictive networks need configured TURN. No external relay or HTTPS domain was provisioned in this workspace.
- WebRTC was browser-tested on Chromium desktop, including mobile/tablet viewport emulation. Physical mobile devices, Safari, Firefox, real webcam hardware and geographically separated peers need deployment testing.
- Text safety rules are a first filter, not comprehensive moderation. Human approval is mandatory before new custom/generated challenges enter the catalog.
- The provided Docker/CI configuration is ready to run but must be validated on the deployment host. This workspace run does not imply a public deployment or load-tested capacity.

The landing image is original generated illustrative artwork, explicitly labeled as an illustrative scene. It is never used as a live player camera. Fonts are self-hosted; there are no external analytics or ad scripts.
