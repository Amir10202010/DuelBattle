# DuelBattle architecture

## Scope and deployment decision

One Node process serves the React client, HTTP API, Socket.IO signalling, matchmaking queue
and authoritative game engine. An optional local Python process runs YOLOv8; the Node server
calls Gemini for photo comparisons. Only the Node engine owns rooms, deadlines and scores.
Deploy the app on a persistent Node host, never as a static frontend alone.

Development runs on Node 24. The client is built by Vite and served from `dist/client` in
production; in development Vite runs in middleware mode inside the same process, so there is
one origin and one port in both modes.

## Boundaries

There is exactly one implementation of each responsibility.

- `shared/protocol.ts` — the room snapshot, game states (including `JUDGING`) and legal transitions
  between them. Imported by both sides; contains no runtime dependency on Zod, so the schema
  layer stays out of the browser bundle.
- `shared/validation.ts` — the Zod schemas for every inbound action and for the challenge
  record. Server-only at runtime.
- `shared/challenges.ts` — the reviewed catalogue, its structural invariants
  (`validateCatalog`) and the single selection function (`selectChallenge`).
- `shared/identity.ts` — the room-code and player-name rules, shared so the browser's
  feedback and the server's schema cannot drift apart.
- `shared/adjudication.ts` — receipt ordering for peer review. `shared/judging.ts` — validated
  AI assessments and score-based winner/tie rules.
- `shared/vision/` — pure frame, colour and detector code. The same functions run in the
  browser for on-screen feedback and on the server over a decoded JPEG. Both sides normalise
  to one analysis resolution, so a verdict cannot depend on which side computed it.
- `server/game.ts` — the single-writer engine. Every deadline and every ordering decision
  uses server time. `tick()` advances states; the client never advances a match.
- `server/verification.ts` — JPEG decoding with hard bounds, the `VerificationProvider`
  interface and the default opponent-review provider. No provider can award a point.
- `server/challenges.ts` — validation and quarantine for custom or generated prompts.
- `server/ai-judge.ts` — anonymous Gemini photo comparisons with strict JSON validation,
  bounded output and concurrency. `server/gemini-keys.ts` manages operator-supplied keys,
  deduplication, quota cooldowns and at most three key attempts per round.
- `server/object-detector.ts` / `vision/server.py` — local YOLOv8 inference over submitted
  JPEGs. Bounded requests, CPU inference, no image storage. Failure leaves Gemini available
  and is disclosed in the verdict. Detector hints never award a point.
- `server/store.ts` — SQLite migrations, expiring guest sessions, entitlements, atomic
  two-player usage charges and finished-match summaries. Rooms and evidence are deliberately
  memory-only.
- `src/hooks/` — `useConnection` (socket, profile, clock offset), `useBattle` (one place that
  turns a snapshot into what the arena renders), `useMedia` (the only camera lifecycle),
  `usePeer` (WebRTC perfect negotiation), `useEvidence` (the only capture pipeline).
- `src/media/capture.ts` — one crop geometry for every consumer.
- `src/components/` — landing, lobby, arena, review and results.

## Match rules and fairness

Best of five means first to three points. A round nobody wins awards nothing and is replaced
with a new challenge. Twelve rounds cap a stalled match; the higher score wins, or the match
is a draw. Both players must consent to ready and to a rematch, and both must have a camera
enabled. Each match consumes one battle from each participant, a rematch included; a waiting
room consumes none. Free: three started battles per UTC day. Premium: no daily cap, at most
one start per hour. A failed atomic usage check charges neither player.

Both players receive the same challenge, and neither receives it early. During the countdown
the server withholds the prompt **and** the round length — a 20-second round and a 40-second
round would otherwise narrow the catalogue down for anyone reading the socket. Both are
issued at the moment of reveal, and the race clock is rebased then, so a late server tick
cannot shorten anyone's round.

A submission carries the current round id, a fresh nonce, a bounded JPEG and up to two
preceding frames. The opponent confirms it; only the other authenticated seat may review.
Receipt order is authoritative: an earlier unresolved attempt blocks a later confirmed one
until it is reviewed or expires. Rejected and expired attempts cannot win. Clients cannot
choose scores or winners, and client timestamps are never used for adjudication. Lower
latency is a real advantage here; this is a casual social game, not tournament timing.

## Verification

When Gemini keys are configured, rooms use AI judging. One JPEG plus up to two earlier frames
is locked per player. Photos stay hidden in active-round snapshots. Both submissions, or the
race deadline, move the room to `JUDGING`. The detector gets the submitted photos; Gemini gets
the images, brief context and detector hints. Anonymous A/B slots are randomly ordered and
mapped back to server-owned identities. The server validates complete, unique participant
coverage and derives the winner from scores. Validity and confidence >= 0.7 are required;
scores within three points draw. Judging has a 20-second abortable deadline. A provider
failure produces a no-points result; it never silently falls back to voting.

Cancellation, camera interruption and disconnect abort the request. A round/controller
identity guard discards late results. Images are discarded after the verdict. Object labels,
confidence, scores and reasons persist as match metadata. There is one successful Gemini
comparison per round; explicit quota/access errors may try up to three configured keys.
Quota-limited keys cool down, invalid-access keys are disabled until process restart.
Gemini quotas belong to projects, not individual keys; multiple keys in one project share
the same quota. The app does not enable billing or change models to get around a limit.

When no keys are configured, the UI explicitly labels rooms as opponent review. The
following baseline assistance and verification provider apply to that mode.

Every round captures a **baseline**: the last camera frame each player sends before the
prompt is revealed. Colour detection runs over what changed since that baseline, weighted
towards the centre of the frame, so a red rug that was already in shot earns nothing while a
red mug lifted into view is measured on its own merits. The result is reported to the
reviewer as an observation, and only when the same verdict holds across three consecutive
frames — a single still cannot evidence an action. With no usable baseline the round is
simply judged without assistance.

`VerificationProvider` is the replaceable seam. A provider returns either `human-review`
(with an optional observation) or `rejected`; there is no third case, and there is no code
path by which a provider awards a point. Providers are run under a timeout and an abort
signal, their output is re-validated and clamped, and an outage falls back to unassisted
opponent review. Evidence is decoded and bounded before any provider sees it, so a provider
outage cannot admit malformed input.

## Challenges

One schema, one catalogue, one selection function. Forty-two reviewed prompts across eleven
categories; `validateCatalog` asserts unique ids and prompts, prompt lengths that render at
display size, agreement between `subjective` and the verification type, that nothing claims
automatic verification, and that colour assistance is only attached where it means something.

Selection never repeats a recent prompt, opens every match with a colour-assisted round (the
fastest way to teach the loop, and nobody should have to judge a round before they have seen
one resolve), refuses a third consecutive opponent-judged round, and ramps difficulty with
the round number as a weighting rather than a filter, so a long match never runs out.

Custom and generated prompts pass a schema and a rule check and are then **quarantined** as
`PENDING_REVIEW`. Only the reviewed catalogue enters a match.

AI matches use `AI_CHALLENGES`, a photo-observable subset of that catalogue. It includes
objects, colors, visible poses, stacking and creative presentation. Prices, personal history,
ownership and spoken stories are excluded. The selected subset marks `aiVerifiable: true`;
the original peer catalogue retains its previous invariants.

## Matchmaking

`find` is a strict authenticated Socket.IO action. A waiting random room is the queue entry.
Selection and seat assignment happen synchronously in the engine, so two requests cannot
claim the same seat. Searches match only different identities with a live controlling socket,
available usage and an unexpired random lobby. A repeated request returns the same room.
Private rooms never enter the queue; manual joins cannot claim a random room's empty seat.
The two clients subscribe to the same room and receive its authoritative snapshot. Search
cancellation, disconnect and the two-minute deadline remove eligibility. Once matched,
normal ready/camera checks, quotas, reconnection and rematches apply. This remains a
single-process queue; horizontal scaling requires shared room ownership.

## Reconnection and media

Guest identity is a server-issued opaque HttpOnly SameSite cookie; only a hash is stored.
Socket handshakes check the session, the protocol version, the origin and a session-bound
CSRF token compared in constant time. Each identity holds one seat and one controlling
socket, and every action and disconnect is bound to that socket, so a replacement socket
cannot be detached by the old one closing.

A disconnect, or a camera being switched off mid-match, pauses the room for 30 seconds.
Rejoining restores the seat; an interrupted race is reissued with a fresh round id and a
fresh countdown rather than resumed, because a partially elapsed round is not comparable
between players. The window expiring cancels the match rather than awarding a win.

WebRTC carries live video and optional audio directly between players, or through TURN. Only
deliberately submitted snapshots pass through the game server; they are dropped at the end of
the round and never written to SQLite. The camera lifecycle cancels obsolete acquisitions on
stop _and_ on unmount, and a camera switch keeps the microphone track.

## Security

Every inbound action is validated by a strict schema, then by membership, then by a state
guard. APIs and socket events are rate-limited; snapshot sizes, signalling payloads, room
counts and room lifetimes are all bounded. Origin validation, CSP, Helmet and prepared SQL
protect the HTTP boundary.

Guest quotas can be evaded by clearing cookies; IP throttles reduce casual abuse, but durable
commercial entitlements need verified accounts. There is no payment endpoint and no
client-settable premium flag. Operators grant time-bounded entitlements through a local CLI;
a billing provider must verify its own webhooks before writing through the same boundary.

## Scaling

Horizontal scaling requires partitioned room ownership (or a room-actor service), a shared
session and entitlement database, and a Socket.IO adapter. Do not run multiple replicas
against the current in-memory engine.
