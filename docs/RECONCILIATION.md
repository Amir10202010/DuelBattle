# Battle reconciliation

## Compared revisions (11 September 2026)

- Codex: `main`, `fc78ec19e176373df3c28f47123938373e7c35f1`.
- Claude: open [PR #1](https://github.com/Amir10202010/DuelBattle/pull/1), `rebuild/monorepo`, `2fa51a2191321f9cca35c7c15549104a83b7d835`.
- Actual merge base: `fc78ec1`. The PR description's claim of unrelated history is incorrect. Main has no changes after that ancestor; Claude replaces the application over eight commits. Thus “Codex-only since ancestor” is empty, while the original implementation's unique features still need explicit preservation.
- Initial working tree was clean. Work is on `codex/reconcile-battle`; no blind merge, force push, or published-history rewrite. The separate detached audit checkout is outside this application.
- [Complete file inventory](branch-file-inventory.txt): deleted paths are main's replaced implementation, added paths Claude's monorepo, modified paths the shared configuration/build/docs surface.

## Decision matrix, recorded before implementation

| Subsystem           | Main                                                                                    | Claude PR                                                                                          | Final decision and reason                                                                                                                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structure           | One TS application, explicit client/server/shared directories                           | Three npm workspaces with shared reducer                                                           | Keep one application and domain boundaries. Workspaces do not improve this single-process deployment enough to justify their build coupling. Extract pure round adjudication, not a second engine.                                                                     |
| Match authority     | Server-only engine, legal transitions, nonces, three attempts, receipt ordering         | Pure reducer, deadline tick, single submission, per-player recap                                   | Combine main's guards and retry semantics with pure adjudication, elapsed-time recap, delayed-tick correctness and hidden countdown prompts.                                                                                                                           |
| Realtime            | Socket.IO ack/reconnect, membership and CSRF, WebRTC signaling                          | Custom ws protocol, queues/backoff, frame relay                                                    | Keep Socket.IO. Avoid rebuilding its reliability machinery. Never queue stale gameplay actions. Add protocol version enforcement, warmup clock samples and bounded signaling.                                                                                          |
| Media               | WebRTC video and optional audio, TURN, mute controls                                    | 4fps JPEG relay, no microphone; consistent capture crop, device picker                             | Keep WebRTC and TURN. Bring over the common capture geometry and device selector; rewrite lifecycle to cancel obsolete async acquisitions and preserve audio during camera switches.                                                                                   |
| Identity/rooms      | Hashed expiring HttpOnly cookie, one identity/room/control socket, 40-bit random invite | Per-room token in browser storage, 25-bit Math.random code, two tabs can play                      | Keep server identity and cryptographic codes. Add explicit code/link entry. Same-browser duplicate seats stay forbidden; use separate profiles for testing.                                                                                                            |
| Persistence         | SQLite sessions, entitlements, atomic two-player quotas, match metadata                 | None                                                                                               | Keep all durable behavior and operator CLI; no database migration necessary for added JSON recap fields.                                                                                                                                                               |
| Verification        | JPEG signature check; explicit opponent review; local three-sample color hint           | Server JPEG decode and before/after color detector; automatic color awards; timeout approves       | Combine bounded JPEG decoding and temporal color assistance with explicit peer verdicts. Neither detector recognizes people, hands, possession or actions. No review means no point. Capture temporal evidence for action review.                                      |
| Provider boundary   | Replaceable synchronous verifier with outage fallback                                   | Hardwired detector switch                                                                          | Keep one replaceable verifier; separate evidence validation from provider evaluation so outages cannot admit malformed evidence. Detector results are advisory and cannot directly award a point.                                                                      |
| Challenges          | 20, eleven categories, strict schema, custom/generated quarantine                       | 45, five categories, nine colors, varied durations/difficulty, pacing selector                     | Combine safe unique prompts under the eleven-category schema. Keep custom quarantine. Adapt pacing, prevent immediate repeats, validate catalog uniqueness and semantic consistency. Rewrite/remove heavy lifting, private screen/pockets and running-to-wall prompts. |
| Landing/create/join | Distinctive editorial artwork/type, rules/privacy, creation dialog; invite-only join    | Compact direct form and code entry                                                                 | Keep main's visual language and add prominent code/link joining. Keep accessible dialogs and honest privacy copy.                                                                                                                                                      |
| Camera/lobby        | Two visible seats; setup explanations and mute controls                                 | Separate permission gate; native camera selector, native invite sharing                            | Combine main's visible lobby with device choice and native sharing plus copy fallback.                                                                                                                                                                                 |
| Arena/countdown     | Big prompt, clear controls; prompt revealed early, phone video severely cropped         | Hidden UI prompt, useful camera emphasis, Space shortcut, detection meter                          | Hide challenge at the server boundary; retain main typography and add keyboard capture, coherent framing, camera win feedback, compact phone layout.                                                                                                                   |
| Results/rematch     | Share, microphone audio, both-vote rematch, quota charging                              | Valid-answer counts, elapsed-time recap                                                            | Keep main sharing/audio/charging; add server-derived per-round elapsed times.                                                                                                                                                                                          |
| Security            | Strict Zod, CSP/Helmet, cookies/CSRF, prepared SQL, quotas                              | Size/token buckets, origin check; non-strict schemas, no entitlements                              | Keep main boundaries; add decoder limits and no prompt leak. Fix byte-safe CSRF comparison, subscription cleanup of obsolete rooms, late camera/ready races.                                                                                                           |
| Performance         | No backend live video; 405.63 kB JS, 2.28 MB artwork, duplicated CSS sections           | 268.36 kB JS, 4fps server image relay, repeated capture constructor allocations                    | Remove client Zod and duplicated style rules; keep video outside React, use one capture pipeline and bounded image operations. Preserve art without generating another visual system.                                                                                  |
| Tests/build         | 38 tests, four Playwright journeys, axe, CI, Compose                                    | 186 tests including client store/clock/media and JPEG scenarios; no checked-in browser suite or CI | Preserve main's runtime/usage/security tests. Port detector/crop/clock scenarios and add camera cancellation, server reveal, stale actions, validation and browser checks. Retain one reproducible build and CI.                                                       |

## Baseline evidence

Main: `npm ci`, typecheck, lint, 38 tests, build and all four production-server browser scenarios passed. npm audit reported zero known vulnerabilities. Client JS: 405.63 kB / 125.95 kB gzip; CSS: 43.70 kB / 9.56 kB gzip.

Claude: clean `npm ci` succeeded but its build/typecheck and five test suites could not resolve the shared package. A tracked `packages/shared/tsconfig.tsbuildinfo` claimed missing output was current. After **only** `tsc -b packages/shared/tsconfig.json --force` in the isolated audit tree, build and 186 tests passed. npm audit reported two moderate development dependency findings (Vitest/mocker). Built client JS: 268.36 kB / 84.30 kB gzip; CSS: 19.79 kB / 4.70 kB gzip. These are baseline measurements, not final results.

## Significant findings behind the decisions

- Both branches expose challenge identity during countdown on the wire; only Claude hides it visually. Final projection must omit the challenge itself until reveal.
- Claude's color detector awards “touch green” for changed green pixels, including a generated rectangle with no person. The detector is useful evidence assistance, not interaction verification or liveness.
- Claude's absent peer vote is treated as approval. Main's expiry and receipt ordering are stronger for explicit confirmation.
- Claude accepts submissions and votes by phase without checking the phase deadline between ticks. Main explicitly checks both submission and review deadlines.
- Claude changes `startedAt` on resume while retaining prior submission elapsed times; later submissions are not directly comparable. Main reissues the interrupted round; final keeps this policy and states it clearly.
- Claude's socket takeover sends a fatal message without revoking the old gateway membership; an old close can detach the replacement. Main binds each action and disconnect to the controlling socket.
- Main's camera permission promise can finish after `stop()` and reopen media. Claude has a generation token for explicit stop, but not for unmount. Final cancellation must cover both, plus pending microphone requests.
- Main's repeated media reports trigger avoidable broadcasts; switching off a camera during round results can allow the next countdown to run with a camera off.
- Main's settlement embeds scoring and clears all recap evidence immediately; final keeps image retention short but retains useful timing metadata.
- Claude's store accepts stale snapshots and grows its evidence map; main rejects older room revisions. Keep that and clear obsolete Socket.IO room subscriptions on replacement.
- Main's two stylesheets were recorded during the audit as largely duplicated. Measured afterwards, that was wrong: of 176 and 165 selectors they share three, and the repeated selectors inside each file are legitimate responsive overrides. Only two stranded landing rules in the arena stylesheet were actually misplaced.

## Feature preservation checklist

Preserve main: WebRTC + audio + TURN, server identity and quotas, expiring Premium boundary, three attempts, explicit peer review, privacy/rules, safe eleven-category catalog, custom generator quarantine, share/results/rematch, reconnect grace, SQLite metadata, browser/accessibility tests and deployment configuration.

Adapt Claude: temporal change/HSV detector and test vectors, all useful safe catalog ideas, easy first round and difficulty pacing, crop consistency, camera device selection, code/pasted-link join, keyboard capture, server-rebased delayed tick, efficient clock sampling, player timing recap, camera-centered mobile design.

Do not retain competing transports, package trees, state machines, challenge catalogs, vision guides, automatic timeout awards, unsupported presence-as-action verification, browser bearer-token identity, generated build caches or unsafe challenge wording. Git history retains the originals for reference.

Final verification and remaining limitations are recorded in [QA.md](QA.md). Architecture and operational boundaries are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Outcome

The reconciliation is implemented on `codex/reconcile-battle`. One application, one state
machine, one room model, one challenge catalogue, one realtime authority, one verification
seam, one camera manager and one capture pipeline. No compatibility shims and no second
implementation of anything remain in the tree; the originals stay in Git history.

### Preserved from main

Socket.IO transport with acknowledgements and reconnection, WebRTC video and optional audio
with TURN, server-issued HttpOnly identity with a constant-time CSRF check, SQLite sessions
and entitlements with atomic two-player usage charges, the operator CLI, legal state
transitions, three attempts per round with explicit opponent review and receipt ordering, the
eleven-category schema with custom-prompt quarantine, the Playwright and axe suites, CI and
the deployment path, and the whole editorial visual language.

### Adopted from the pull request

The baseline-differenced, centre-weighted colour detector and its test vectors, the pure
`Frame` abstraction that lets one detector run in both the browser and the server, the
shared capture geometry, the camera device picker, difficulty pacing and a wider catalogue,
hiding the prompt until the countdown ends, rebasing the race clock at reveal so a delayed
tick cannot steal playing time, per-round elapsed times in the recap, joining from a pasted
code, the space-bar capture shortcut, and the camera-centred phone layout.

### Rewritten rather than taken from either

- **Verification.** The provider seam now returns only `human-review` or `rejected`, so no
  provider can award a point; evidence is decoded and bounded before any provider runs, the
  provider is timed out and its output re-validated, and an outage falls back to unassisted
  peer review. Colour evidence is reported only when it holds across three frames.
- **Prompt secrecy.** The server withholds the round length as well as the prompt during the
  countdown; both branches leaked enough to narrow the catalogue down over the wire.
- **Camera lifecycle.** One manager, with generation tokens covering `stop()` _and_ unmount,
  and a camera switch that keeps the microphone track.
- **Challenge selection.** One function: no recent repeats, an opening colour-assisted round,
  never three opponent-judged rounds in a row, and difficulty as a weighting rather than a
  filter, with the catalogue's invariants asserted by `validateCatalog`.

### Removed

The PR's npm workspace tree, its custom WebSocket protocol and frame relay, its browser
bearer-token identity, its parallel state machine and challenge catalogue, its automatic
colour awards and timeout-approves-by-default rule, its checked-in `tsbuildinfo`, main's
client-side Zod and its `useColorGuide`/`src/vision` colour guide, unsafe or privacy-invading
prompts from either catalogue (running to a wall, emptying pockets, showing your screen,
lifting the heaviest thing you can reach), and dead vision exports.

### Defects found and fixed while finishing the work

- The protocol-version handshake added during the audit was never sent by the client, so the
  app could not connect at all. Found by the transport suite.
- The review panel's CSS still targeted the pre-reconciliation markup, so evidence images
  rendered as unproportioned slivers on a phone.
- The play-by-play ran the winner's name into the round time.
- Playwright ran against whatever was last built; it now builds in its own web-server command.

Verification is recorded in [QA.md](QA.md): 78 unit and integration tests, four browser
journeys in two real contexts against the built production server, typecheck, lint, build and
an axe pass, all green.
