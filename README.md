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

- **`auto`** — a detector runs on the submitted frame. Instant, objective, no
  waiting. A detector kind only exists if a pure function over two frames can
  settle it, which is what lets the server re-run it:

  | kind | decides |
  | --- | --- |
  | `color` | show something red |
  | `colorPair` | show something red *and* white |
  | `coverage` | fill the whole frame with one thing |
  | `luminance` | show something darker / brighter than your room |
  | `darkness` | black out your camera |

- **`peer`** — the opponent judges the snapshot. This is how "find something
  your mum gave you" is scored, because no camera can decide it. It is a
  product choice, not a placeholder for a model that is missing.

#### Why saying "no" cannot win you the round

Your opponent is the only judge available for a prompt no camera can settle,
and they are also the person who gains if you are marked invalid. Scored
naively, "No" is the dominant move in every peer round: it turns a race you
might lose into a win you cannot. So a rejection **voids the round for both
players** — nobody scores. An honest rejection still stops a bogus answer from
counting; it just costs the judge the round too, which is the thing that makes
the verdict worth believing. The arena says so above the buttons before you
press one.

Two rules follow from the same idea. Judging only opens when **both** of you
answered, so sitting a round out is never a way to deny a point you did not
contest. And no verdict by the deadline counts as approval, so abstaining is
never cheaper than judging.

#### When a camera-judged round falls back

An auto round downgrades to peer judging when the server cannot read *a* frame
— usually a baseline that never arrived. The frames it *could* read are already
settled: their verdict stands, nobody is asked to vote on them, and a vote on
one is refused rather than recorded. Peer judging fills the gap the camera
left, which is all it is for. Without that, a rejected answer came back to life
on an abstention, and a verified one could be voted away by whoever was about
to lose to it.

### Giving up on a round

Sometimes there is genuinely nothing purple in the room. A pass ends your part
of the round immediately; if both of you pass, the round ends there rather than
running another fifteen seconds of nobody doing anything. Your opponent can
still win it after you have passed — and on a peer round they win it outright,
because passing forfeits your say as well as your answer.

### How long a match is

The lobby offers first to 2, 3 or 5, and either player can change it — it is a
shared decision about how long you are both going to be doing this, not a host
privilege. It can only change between matches, because moving the finish line
mid-match is not a setting, it is a dispute.

### Rounds you write yourself

Each player can add up to four prompts of their own — per player rather than per
room, so whoever opened the lobby first cannot fill the deck before the other
has finished reading the box. They are always peer-judged — no detector can decide an arbitrary sentence, and inventing one
that pretends to would be worse than asking the opponent — and they can only be
added between matches, so nobody adds a round they have already set themselves
up to win.

Prompts are normalised and checked on the server, live only in that room's
memory, and are never shown to anyone but the two players. A prompt leaves with
whoever wrote it.

`runDetector` is the single place a spec becomes a verdict. The client calls it
several times a second to drive the on-screen meter and the server calls it once
on the submitted frame, so the preview cannot drift from the ruling.

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
merits.

Both the change threshold and the colour reading are taken relative to how the
room is actually lit, because fixed values break in the dark: a green mug held
against a grey wall produces a per-pixel change of about 38 in a well-lit room
and about 20 in an evening one, so a threshold that clears sensor noise in the
first sits above the *signal* in the second. `packages/server/test/realistic.test.ts`
plays every camera-judged challenge through simulated webcams — noisy, unevenly
lit, variously exposed — and holds one line above all others: a genuine answer
is never wrongly rejected.

When the camera genuinely cannot settle a round — no usable baseline, or a room
too dark to say whether anything is darker than it — the server says so and
hands that round to the opponent, rather than inventing a verdict or failing a
player for their lighting.

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
`MAX_CONNECTIONS_PER_IP`, `ROOM_CREATE_BURST`, `ROOM_CREATE_PER_MIN`,
`IDLE_SOCKET_TTL_MS`, `EMPTY_ROOM_TTL_MS` and `MAX_ROOM_AGE_MS` are the capacity
and abuse limits; see `packages/server/src/config.ts`.

A busy room holds two evidence snapshots, two live frames and two decoded
baselines — roughly 700 KB at the size ceilings. `MAX_ROOMS` therefore sets a
memory ceiling as much as a capacity one: the default of 500 is about 350 MB of
room state.

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
snapshots are kept for the round being judged or shown, then dropped.
Everything a room holds disappears when the room does.

Room codes come from the CSPRNG, not `Math.random`: they are the only thing
standing between a match and a stranger. The room lookup is rate limited per IP
for the same reason — it exists so the join screen can fail fast, not so the
code space can be swept for rooms with a free seat. Opening rooms is metered per
IP too, because a room holds its slot for minutes after everyone leaves and one
client could otherwise fill the table in seconds.
