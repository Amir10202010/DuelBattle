# DuelBattle product audit

## Baseline — 12 September 2026

The product is a two-player webcam scavenger duel, not a text-answer quiz.
The monorepo has React/Vite, a Node HTTP/WebSocket server, and a pure shared
game engine. 664 existing tests pass. A fresh `npm run dev` fails because the
shared package has not been built. There is no account authentication or SQL
database: a signed localStorage identity unlocks progression; JSON holds profiles.

Keep: camera pipeline, server timestamps, bounded JPEG decoding, pure detectors,
reconnection, custom rooms, curated 1,000-topic pool, Elo, XP, achievements,
Web Audio cues, accessibility announcements, and transport integration tests.

Fix first:

- Subjective verdicts can influence a match that updates ratings.
- AI is one model reading with low-confidence rejection and peer fallback.
- `lastRatings` serializes entire rating updates, including private profiles.
- Replaced sockets can detach the new owner of a seat.
- JSON writes are not transactional and a corrupt file can later be overwritten.
- Leaderboard sorting reads all profiles, search only searches the first page.
- Guests receive profiles and progression endpoints without registration.
- Custom prompts are missing from the arena's prompt lookup.
- A rejected snapshot can leave the submit button stuck.
- Sound is enabled by default; settings report success before server confirmation.
- Docker's non-root user cannot create the default data directory.

## Architecture and product decisions

Public landing → register/sign in → short onboarding → game home → battle.
Guest play and private custom rooms remain available. Only authenticated players
enter the ranked queue. Ranked decks contain objective camera challenges and
visually verifiable AI challenges. Subjective/custom rounds stay in casual rooms.
Infrastructure uncertainty never delegates a ranked outcome to an opponent.

SQLite with WAL, migrations, indexed standings, accounts, hashed expiring
sessions, atomic match receipts, and recovery credentials replaces production
JSON writes. Existing JSON data is imported once without destroying the source.
Legacy guest credentials cannot become account credentials.

The server validates AI output, performs an independent verification, checks
participant coverage and agreement, and uses a neutral outcome when uncertain.
It owns all rating, XP, daily challenge and achievement writes.

Visual direction: midnight navy, warm ivory typography, electric citron actions,
coral opponent accents, geometric rank emblems, restrained motion. Desktop uses
an icon rail and game status header; mobile uses a compact bar and bottom tabs.
All statistics must come from the server. Empty states invite the first match.

## Release validation

Run typecheck, lint, full tests, production build, dependency audit, API/auth
integration and two-client match flows. Inspect landing, auth, home, play,
rewards, ladder, profile and settings at desktop and mobile sizes. Document
provider, hardware, deployment and scale limits honestly in the release notes.
