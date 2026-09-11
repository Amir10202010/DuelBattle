# DuelBattle architecture

## Scope and deployment decision

The inspected repository contained only an empty Git repository. Development runs on Windows / Node 24.16. The app uses one Node process serving React, HTTP APIs, Socket.IO signaling and the authoritative game engine. This deliberately avoids distributed locks and multi-service failure modes for the MVP. Sites' portable profile was inspected; its hosted Workers runtime is not the target for this long-lived Node/Socket.IO + local SQLite architecture. Deploy the complete app on a persistent Node host (Docker provided), not a static frontend alone.

## Boundaries

- `shared/`: challenge schema, catalog, protocol, public room snapshots and legal transitions.
- `server/game.ts`: single-writer room engine. Deadlines and receipt ordering use server time. A tick advances explicit states; the UI never advances a match.
- `server/store.ts`: SQLite migrations, expiring guest sessions, subscription entitlements, atomic participant usage charges, durable finished-match summaries. Ephemeral rooms and evidence are intentionally memory-only.
- `server/verification.ts`: provider interface; default opponent review. There is no automatic trusted AI verdict.
- `src/vision/`: on-device temporal color guidance in the central presentation zone. It is advisory and never sufficient to award points.
- `src/hooks/`: media lifecycle, WebRTC perfect negotiation, socket state and clock synchronization.
- `src/components/`: landing, lobby, arena, review and results.

## Match rules and fairness

Best of five means first to three points. Ties award no points and are replayed with a new challenge. Twelve total attempts cap a stalled match; the higher score wins, or the match draws. Both participants must consent to ready/rematch and have an enabled camera. Each match consumes one battle from each participant, including a rematch; waiting rooms consume none. Free: three started battles per UTC day. Premium: no daily cap, at most one start per hour. A failed atomic usage check charges neither player.

Both see the same server-issued challenge and deadline. Submissions require a current round ID, unique nonce, bounded JPEG snapshot and active camera status. Opponent confirmation is required and only the other authenticated slot may review. Snapshot receipt is authoritative; an earlier pending attempt blocks a later confirmed attempt for a bounded review window. Rejected/expired attempts cannot win. Clients cannot choose scores or winners. Network latency is not compensated with client timestamps; this is a casual social game, not a tournament adjudication system.

## Reconnection and media

Guest identity is a server-issued opaque HttpOnly SameSite cookie; only a hash is persisted. Socket handshakes check the session, same-origin and a session-bound CSRF token. Each identity has one active player slot and one controlling socket. Disconnect pauses the room for 30 seconds. Rejoining the same slot restores state and starts a fresh countdown if a race was interrupted. Expiry cancels the match without awarding a fraudulent win. Server restart discards rooms but preserves usage and results.

WebRTC sends live video/audio directly between players (or through TURN). Only deliberately submitted snapshots transit the game server; they are removed at round end and never stored in SQLite. Microphone is optional. TURN credentials are short-lived and generated server-side; relay service provisioning is external.

## Security and future extension

All inbound actions use strict Zod schemas, authenticated membership and state guards. APIs and socket events are rate-limited; snapshot/signal/room lifetimes and counts are bounded. Origin validation, CSP and prepared SQL protect the HTTP boundary. Guest quotas can be evaded by clearing cookies; IP throttles reduce abuse, but verified accounts are needed for durable commercial entitlements. There is no payment endpoint and no browser premium toggle. Operators can assign time-bounded entitlements through a local CLI; a billing provider must verify its own webhooks before using the same store boundary.

Generated/custom challenges are schema and rule validated but quarantined pending human approval. No automated denylist is claimed to be comprehensive moderation. Only the reviewed catalog is selectable. Future AI providers must supply verifiable, challenge-specific evidence and cannot directly mutate the game. Replay integration receives metadata only; recording requires a separate explicit consent workflow.

Horizontal scaling requires partitioned authoritative rooms (or a room actor service), a shared session/subscription database, and a Socket.IO adapter. Do not run multiple replicas against the current in-memory engine.
