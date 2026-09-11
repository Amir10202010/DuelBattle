# Verification record

## Gemini, YOLOv8 and matchmaking update — 2026-09-11

- **105 tests passed** in nine Vitest suites, including real HTTP/Socket.IO matchmaking,
  queue cancellation/expiry/identity isolation, AI state transitions, locked photos, score
  arbitration, missing submissions, timeouts, interrupted judging, invalid provider output,
  key rotation, quota cooldowns and refusal/error handling.
- TypeScript, ESLint, Prettier and the production build passed.
- All six browser scenarios passed across the main run and a targeted retry, using installed
  Chrome. The initial full run passed five scenarios; the existing offline-recovery scenario
  timed out, then passed alone in 25.6 seconds. The bundled Playwright Chromium executable
  was absent, so `PLAYWRIGHT_CHANNEL=chrome` was used.
- New browser coverage: random search, cancel/research, two browsers matched into the same
  room, actual camera/WebRTC transport, AI submission locking, judging, identical verdicts
  for both players, score/recognized-object rendering, mobile layout and axe checks.
- The AI browser test uses deterministic server-provider assessments, visibly labeled as
  test fixtures. It does not claim to test model accuracy.
- **Real YOLOv8 + Gemini test passed** using the operator's `.env` keys. Local YOLOv8n
  detected the bus and people in Ultralytics' bundled public sample. Gemini 2.5 Flash
  recognized the bus, rejected a blank control image and chose the bus photo as winner
  with a grounded explanation. Two live diagnostic Gemini calls were made in this update.
  This is a connectivity/recognition smoke test, not a broad model-accuracy benchmark.
- CPU Python environment and YOLO weights were installed locally; neither secrets nor
  model weights are tracked in Git. No user camera photos were used for the diagnostics.

## Earlier reconciliation audit (historical)

Recorded after the reconciliation of `main` and [PR #1](https://github.com/Amir10202010/DuelBattle/pull/1).
Environment: Windows 11, Node.js 24, an installed Google Chrome driven by Playwright
(`PLAYWRIGHT_CHANNEL=chrome`; the bundled Chromium download was unavailable on this network).
Browser checks run against the **built production server** on port 3100 with a separate
in-memory database.

## Automated checks

**78 tests passed** across seven suites.

| Suite                | Tests | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game.test.ts`       | 24    | Room creation and joining, same-socket idempotency, duplicate-tab refusal, foreign membership, full rooms, legal transitions, both-ready gating, the server countdown, the withheld prompt _and_ withheld round length, the pre-reveal baseline window, receipt ordering, simultaneous submissions, accept/reject/expiry, the three-attempt cap, stale round ids, duplicate nonces, malformed evidence, self-review refusal, first-to-three scoring, a close five-round match, timed-out rounds, a bounded draw, rematch consent and score reset, disconnect/reconnect with a fresh round token, camera-off pause and resume, cancellation, stale-room expiry, membership release, provider outage fallback, a provider that cannot award a point, and colour assistance that stays silent for an object already in the room. |
| `vision.test.ts`     | 16    | HSV conversion, colour membership at the wrap-around of the hue wheel, a grey wall matching no chromatic colour, centre weighting that still counts the edges, an object brought into frame, a matching object already in the room, a static wall failing to rescue a wrong answer, the right colour in the wrong round, a colour pressed to the lens, sensor noise, a stray pixel, mismatched frame sizes, and box-filtered resizing.                                                                                                                                                                                                                                                                                                                                                                                        |
| `client.test.ts`     | 10    | Joining from a bare code, a full invite link or a path; refusing to truncate an over-long code into a real room; agreement with the pattern the server validates; the shared name rule; and one crop geometry — the detector, the opponent's view and the stored evidence resolve to the same field of view.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `validation.test.ts` | 9     | Every catalogue entry against the schema, the catalogue's structural invariants, no repeats before exhaustion, an opening colour-assisted round, no three consecutive opponent-judged rounds over 40 seeds, difficulty ramping as a weighting rather than a filter, unsafe/private/impossible proposals, quarantine of plausible generated text, refusal of client-supplied winner/premium/markup, and rate-limit windows.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `media.test.ts`      | 7     | The camera lifecycle in jsdom with a real React render: a camera that arrives after `stop()` is stopped, one that arrives after unmount is stopped, unmount releases every track, switching camera keeps the microphone, a refused permission leaves no half-open state, and a non-secure context is refused before `getUserMedia` is called.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `store.test.ts`      | 7     | Hashed session secrets, expiry, forged tokens, three free starts per UTC day, midnight reset, server-owned Premium, hourly throttling and persistence across a database reopen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `transport.test.ts`  | 5     | Real HTTP and Socket.IO: cache headers, HttpOnly/SameSite/Secure cookies, CSP, protocol-version and CSRF rejection, foreign origins, forged premium and score fields, unauthorised review and signalling, a full room, a duplicate tab, disconnect and reseat over real sockets, ICE endpoint authentication, and the per-identity socket cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

TypeScript typecheck, ESLint, Prettier and the production build pass; `npm run check` and CI
now gate formatting too. Client bundle: **333.91 kB JS (105.80 kB gzip)** and 44.99 kB CSS
(9.87 kB gzip) — down from 405.63 kB / 125.95 kB on `main`, because the validation layer no
longer reaches the browser.

## Browser coverage

**All four end-to-end scenarios passed**, approximately 1 minute 30 seconds, against the
built production server.

Two independent authenticated browser contexts and Chromium's synthetic camera devices are
used. Actual `getUserMedia`, live media tracks, WebRTC negotiation, remote video decoding,
Socket.IO traffic and server state are exercised. The synthetic camera is a test _device_
only: there is no fake-camera mode and no mocked game server in the application.

The full journey covers create, copy invite, join, enable both cameras, enable the
microphone, both ready, a synchronised countdown, an identical prompt on both sides,
deliberate snapshot submission by mouse **and** by the space bar, the evidence frames
rendering at the right aspect ratio, opponent confirmation, three rounds, a synchronised
winner and score, the play-by-play with per-round times, clipboard sharing, rematch, refresh
and rejoin, camera reacquisition, peer video recovery, and leaving. Media tracks are asserted
ended on both sides after leaving. Console errors and uncaught exceptions are collected and
asserted absent.

The other scenarios cover the landing page, joining by a pasted code or link including the
rejection message for a non-code, invalid rooms and routes, permission denial with a friendly
message and a disabled ready button, mobile and tablet layouts, offline/online transport
recovery, the review panel brought fully into the viewport, and 200% zoom-equivalent reflow
(a 640×450 CSS viewport at device scale 2, representing a 1280×900 display). That last one is
viewport emulation, not physical browser zoom.

axe-core runs WCAG 2.0/2.1 A and AA rules on the landing page, the lobby and the match
result: zero violations. Automated rules do not replace a manual screen-reader audit.

Playwright's web server now runs `npm run build && npm run start`. During this work a browser
run against a stale `dist` reported a passing suite while the fix under test was not in the
bundle; building in the harness removes that failure mode.

## Visual review

Screenshots were inspected for the desktop and mobile landing page, the camera lobby, the
countdown, the active arena on desktop and mobile, snapshot review on desktop and mobile,
desktop and mobile match results, the reconnecting tablet, the cancelled state, the denied
camera and the zoom-equivalent dialog. Three defects were found and fixed in this pass:

- The review panel's evidence CSS still targeted the old markup, so on mobile the snapshot
  and the earlier frames rendered as unproportioned slivers. Re-laid out, with an explicit
  "The snapshot" / "A moment before" hierarchy.
- The play-by-play ran the winner's name and time together (`Alex0.3s`).
- Two landing-page rules had been left stranded in the arena stylesheet.

`test-results/` and `playwright-report/` are git-ignored; traces and failure screenshots are
retained automatically on failure. The repository contains no captured webcam footage. The
landing illustration is original artwork, labelled as an illustrative scene.

## Not verified

- Physical cameras and microphones, physical phones, Safari, Firefox, and peers on different
  networks or in different countries.
- A TURN relay, NAT traversal through restrictive corporate networks, a public HTTPS host or
  reverse proxy, the Docker runtime (the daemon was not running here) and GitHub-hosted CI.
- Load, capacity or tournament-fairness benchmarks.
- Automatic object or pose recognition, liveness, and any claim of fraud-resistant judging —
  these are deliberately absent rather than untested.
- Payments, customer accounts, signed billing webhooks, moderation of arbitrary prompts,
  recording and clips.

The game is playable end to end with honest opponent verification. Advanced AI and billing
are provider boundaries, not simulated services. Deploy one Node instance with persistent
SQLite; a restart ends active rooms. Guest quotas are not strong identity and can be evaded
by clearing cookies.
