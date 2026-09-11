# DuelBattle

**Your room is the arena.** A 1v1 webcam challenge game with live random matchmaking, private friend invites, local YOLOv8 object detection and a Gemini photo judge. Submit your answer, compare scores, win three rounds, and rematch.

## Run locally

Requires **Node.js 24.14+** and npm. AI judging requires your Gemini API key; without keys the app clearly labels battles as opponent review. No database service is required.

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

## Gemini and local YOLOv8

Add your keys to `.env` (never to client code or Git):

```dotenv
GEMINI_API_KEYS=first-key,second-key,third-key
GEMINI_MODEL=gemini-2.5-flash
YOLO_URL=http://127.0.0.1:8001
```

`GEMINI_API_KEY` also accepts a single key. The plural setting takes precedence. Keep the associated Google projects on Free Tier if you want free usage: the app does not manage billing. [Gemini 2.5 Flash supports image input](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash) and has a [free tier](https://ai.google.dev/gemini-api/docs/pricing), subject to the project's quota. Keys in one project share limits. The pool deduplicates keys, rotates available keys, respects quota cooldowns, disables unauthorized keys, and tries at most three keys per round. It never switches models or enables billing.

For local YOLOv8, install Python 3.11 and the CPU dependencies (PowerShell with `uv`):

```powershell
uv python install 3.11
uv venv --python 3.11 .venv-yolo
uv pip install --python .venv-yolo/Scripts/python.exe torch torchvision --index-url https://download.pytorch.org/whl/cpu
uv pip install --python .venv-yolo/Scripts/python.exe -r vision/requirements.txt
npm run yolo
```

Keep that process running, then start `npm run dev` in another terminal. On Linux/macOS use `.venv-yolo/bin/python` in the install commands. `YOLO_PYTHON` can override the interpreter. The first start downloads the official `yolov8n.pt` weights; inference runs on the CPU. The weights and virtual environment are Git-ignored. The detector listens on localhost and accepts only server requests, with bounded images. For a non-loopback deployment set `YOLO_SERVICE_TOKEN` on both services.

YOLO returns recognized classes, confidence and boxes; Gemini sees the photos and uses those detections as hints. The pretrained YOLO model has a limited vocabulary and cannot decide creativity or arbitrary challenges. Gemini remains the photo judge. If YOLO is offline, the verdict explicitly says Gemini assessed the images directly.

Real diagnostic (uses Ultralytics' bundled public bus photo, never player images; the second command consumes a Gemini request):

```powershell
.venv-yolo/Scripts/python.exe vision/smoke.py
npm run ai:check
```

Restart the app after editing `.env`. The lobby displays **AI photo judge** when Gemini is configured. A bad key or an exhausted quota produces a visible no-points verdict, never a fabricated winner.

## What works

- Random matchmaking: searches share a live queue, two different players enter one room, private rooms stay separate, and cancellation/disconnect/expiry removes a waiting player. Searching is free; both cameras and ready buttons are required to start.
- Private create/join/invite flow with validated names, joining by a pasted code or link, and secure guest identity.
- Gemini compares both photos, recognizes visible objects, scores fulfillment and presentation, and returns reasons. YOLOv8 provides actual local object detections.
- Real Socket.IO state synchronization and peer-to-peer WebRTC camera/audio transport.
- User-initiated camera permission, optional microphone, muted/off controls and friendly recovery states.
- Server-authoritative ready/countdown/race/review/result/next-round/match-result state machine.
- Forty-two reviewed peer challenges plus a photo-observable subset for AI, paced by round number; first to three wins, with bounded tie rounds.
- Intentional JPEG snapshot submission, locked AI submissions or opponent confirmation, duplicate/replay guards and bounded judging/review deadlines.
- Actual baseline-differenced colour assistance, run on-device for live feedback and re-run server-side as an observation for the reviewer. It never awards a point and never claims to identify a player or a held object.
- Best-of-five scoring, simultaneous-attempt arbitration, per-round times in the play-by-play, a space-bar capture shortcut, rematches, invite copying, native share and clipboard fallback.
- Refresh/reconnect recovery, pause when a player disconnects or disables their camera, 30-second grace period and stale-room cleanup.
- Three free started battles per participant per UTC day, atomic two-player usage charges and server-owned Premium entitlements.
- Responsive landing/lobby/arena/results, keyboard focus, semantic dialogs, accessible labels, reduced motion and clear error states.
- SQLite migrations, hashed expiring session tokens, usage records, expiring subscription records and finished-match metadata.
- Strict Zod boundaries, membership checks, CSRF-bound socket sessions, same-origin handshake validation, CSP, prepared SQL and rate/payload limits.

## Verification: honest limits

With Gemini configured, **AI judging** locks one photo per player. After both submit, or time expires, the server makes one comparison request with both photos and up to two context frames each. Submissions are hidden from the other player until judging starts. Gemini assesses fulfillment (0–70), presentation (0–30), visible objects and confidence. A valid answer with confidence at least 0.7 is eligible; the server chooses the higher score, with a draw within three points. A sole valid submission can win after the timer. No submissions need no API call. The judge has a 20-second deadline, and an outage awards no points. Leaving, disconnecting or disabling a camera aborts judging; a late result cannot affect another round. Verdicts and score breakdowns appear in the result and match recap. Images are discarded after the verdict; assessment metadata is stored with the match.

Without keys, **opponent review** remains available and is labeled throughout the UI. Each review lasts eight seconds, with three attempts per player. The first accepted snapshot by server receipt order wins; an earlier pending snapshot blocks a later accepted one until reviewed or expired. An AI outage never silently switches an ongoing AI battle to voting. A race lasts 20–40 seconds; neither its prompt nor its length is revealed early.

On-device colour guidance still runs at four samples per second against a pre-reveal baseline. This pixel heuristic is only framing assistance; Gemini and YOLO are separate real inference paths. AI challenges exclude invisible personal history, prices and spoken claims. Recognition and subjective photo scoring can be wrong; neither the snapshots nor YOLO prove liveness. Only deliberate submitted photos and their brief context reach Gemini, not continuous video. Google's API data policies apply, including potential product-improvement use on the free tier; the camera privacy dialog explains this.

There is no prize, ranked ladder or fraud-proof adjudication. Peer mode depends on honest reviews. AI mode scores photo quality against the prompt, rather than rewarding whoever submits first. This remains a casual social game.

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

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for state, privacy, security and scaling decisions, and [docs/RECONCILIATION.md](docs/RECONCILIATION.md) for how this single implementation was chosen from two competing ones. This app needs a persistent Node process; it cannot be published as a static site.

## Intentional extension points

- `VerificationProvider` in `server/verification.ts`: isolated evidence evaluation; provider outages fall back to human review.
- `AiJudge` in `server/ai-judge.ts`: bounded Gemini comparison and validated assessments. `ObjectDetector` in `server/object-detector.ts`: optional local YOLOv8 hints. Only the engine awards points.
- `ChallengeGenerator` / `generateProposal` in `server/challenges.ts`: schema and rule validation; all generated/custom proposals are quarantined as `PENDING_REVIEW`. Only the reviewed catalogue in `shared/challenges.ts` enters matches, and `validateCatalog` holds it to its invariants.
- `SubscriptionProvider` and `Store.grantPremium`: server-owned entitlement boundary. No client Premium flag and no checkout/payment simulation. A real billing integration must authenticate customers and verify signed webhooks before writing entitlements.
- `RoundSummary` and persisted match summaries include AI assessments. Recording, clips, spectators and rankings remain future work.

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

`npm run check` runs typecheck, lint, domain/transport tests and the production build. The browser suite builds the app itself before starting a separate **production** server at `http://localhost:3100`, so it can never run against a stale `dist`. It uses an isolated in-memory database and never consumes your normal development quota.

If the Playwright download is unavailable, use an installed Chrome browser. PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run test:e2e
```

POSIX:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

Browser tests use Chromium's synthetic camera/microphone devices. They exercise the real `getUserMedia` → WebRTC → remote video pipeline and real HTTP/Socket.IO servers. They do not verify physical camera hardware or internet TURN routing. Peer gameplay runs without mocked winners. The AI browser scenario injects deterministic assessments at the server provider boundary to test the UI without consuming API quota; `npm run ai:check` separately exercises real Gemini and YOLO recognition and compares the bus photo against a blank control. Screenshots and traces are written to `test-results/` and `playwright-report/`. See [docs/QA.md](docs/QA.md) for the recorded audit.

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

TURN credentials expire in one hour. Refreshing/rejoining creates a new peer connection and fetches new credentials. The shared secret must match your relay server. Gemini keys are server-only; all AI/YOLO settings are listed in `.env.example`.

## Deployment

```sh
docker compose up --build -d
```

To also run local YOLOv8 in Docker: `docker compose --profile vision up --build -d`. The detector shares the app container's loopback network; its port is not exposed. Its weights persist in the `duelbattle-models` volume.

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
