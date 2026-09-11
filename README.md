# Battle

A one-on-one webcam game. Two players, two rooms, one prompt at a time —
**show something red**, **find something older than you**, **put something blue
on your head** — answered with whatever is within arm's reach. Fastest valid
answer takes the round.

Your room is the game.

## Running it

```bash
npm install
npm run dev
```

That starts the game server on `:8787` and the client on `:5173`, with the
client proxying `/ws` and `/api` to the server so the browser stays on one
origin. Open <http://localhost:5173>, start a battle, and send the room link to
the other tab, machine or person.

Cameras need a secure context. `localhost` counts; a bare LAN IP does not, so
use a tunnel (or a dev certificate) to play across devices.

## How a round is decided

Challenges declare how they can be judged, and the catalogue refuses a
combination that cannot actually be decided:

- **`auto`** — a detector runs on the submitted frame. Colour rounds work this
  way: instant, objective, no waiting.
- **`peer`** — the opponent judges the snapshot. This is how "find something
  your mum gave you" is scored, because no camera can decide it. It is a
  product choice, not a placeholder for a model that is missing.

### The client never sends a verdict

`submit` carries a round id and a JPEG, and nothing else. The server decodes the
frame and runs the challenge's detector itself, using the same function the
client runs for on-screen feedback. A modified client can change what it shows
you; it cannot change what it wins.

### Baselines, and why the sofa doesn't count

Every player streams small camera frames while a match is running. They are
relayed to the opponent as the live view, and the last frame to arrive before a
prompt is revealed becomes that round's **baseline**.

Detection is then scored over what *changed* against that baseline, weighted
towards the middle of the frame. A red rug that was already in shot is part of
the baseline and earns nothing. A red mug lifted into view is scored on its own
merits. If the server has no usable baseline it says so and hands the round to
the opponent to judge, rather than inventing a verdict or failing the player for
a dropped frame.

## Layout

```
packages/
  shared/   pure game logic: challenge catalogue, match engine, detectors, protocol
  server/   authoritative rooms over WebSocket, plus static hosting in production
  client/   React app: camera pipeline, realtime store, the match UI
```

`shared` has no runtime dependencies beyond zod, no DOM and no Node APIs, so the
match engine and the detectors run identically in a browser, on the server and
in a test. `@battle/shared/validation` is a separate entry point holding the
wire schemas: only the server parses untrusted input, and keeping zod out of the
main entry keeps it out of the client bundle.

The match engine is a pure reducer plus a `tick` that fires deadline-driven
transitions. Every rule — scoring, round transitions, peer judging, disconnect
pauses, rematches — is a function of state and a timestamp, which is why the
whole lifecycle is testable without a network.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Server and client with reload |
| `npm test` | Every test: engine, detectors, rooms, protocol, a full match over real WebSockets |
| `npm run typecheck` | Type-checks all three packages |
| `npm run lint` | ESLint |
| `npm run build` | Builds all three packages |
| `npm start` | Runs the built server, serving the built client |

## Configuration

Copy `.env.example` and adjust. Everything has a working default; the ones that
matter in production:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `8787` | |
| `CLIENT_DIR` | *(empty)* | Path to the built client. Set it to serve the app and the socket from one origin. |
| `ALLOWED_ORIGINS` | *(empty)* | Comma-separated. Empty means same-origin only, which is what a single-service deployment wants. |
| `TRUST_PROXY` | `0` | Set to `1` only behind a proxy you control, so `X-Forwarded-For` can be trusted for per-IP limits. |
| `LOG_LEVEL` | `info` | |

`MAX_ROOMS`, `MESSAGE_RATE_PER_SEC`, `IMAGE_RATE_PER_SEC`,
`MAX_CONNECTIONS_PER_IP`, `EMPTY_ROOM_TTL_MS` and `MAX_ROOM_AGE_MS` are the
capacity and abuse limits; see `packages/server/src/config.ts`.

## Deploying

One process serves everything:

```bash
npm ci
npm run build
CLIENT_DIR=packages/client/dist npm start
```

Or use the `Dockerfile`. The server needs sticky routing only in the sense that
a room lives in the memory of the process that created it — one instance, or a
load balancer that hashes on room code. Rooms are collected once they have been
empty for five minutes.

Serve it over HTTPS. Browsers will not hand out a camera otherwise.

## Privacy

There is no database. Live frames are relayed to the opponent and the most
recent one per player is held in memory as the round's baseline. Evidence
snapshots are kept for the two most recent rounds so they can be judged and
shown, then dropped. Everything a room holds disappears when the room does.
