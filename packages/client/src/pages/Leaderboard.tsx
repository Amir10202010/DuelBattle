import { useEffect, useState } from 'react';
import { PLACEMENT_MATCHES, isPlaced, rankFor, type PublicProfile } from '@battle/shared';
import type { BoardState, MatchStore } from '../net/store.js';
import { Avatar } from '../components/Identity.jsx';

/**
 * Who is actually good at this.
 *
 * Built from the rows the game writes after every match, so there is nothing to
 * seed and nothing to go stale. Placement keeps a single lucky evening off the
 * top of it: until five matches are in, a rating moves 40 points a game and is
 * a guess wearing a number.
 *
 * There is no weekly or monthly board, and adding one would mean inventing
 * data. What the server keeps is a record per player, not a log of every match
 * ever played — so "best this week" could only be computed from the twenty-five
 * rows a profile remembers, which is a different question with the same name.
 * One honest board beats three with a footnote.
 */
const BOARDS = [
  { kind: 'rating', label: 'Rating', note: 'Everybody past placement, best first.' },
  { kind: 'streak', label: 'Streaks', note: 'The longest unbeaten runs on record.' },
  { kind: 'wins', label: 'Wins', note: 'Matches taken, however long it took.' },
] as const;

interface LeaderboardProps {
  store: MatchStore;
  board: BoardState | null;
  loading: boolean;
  profile: PublicProfile | null;
}

export function Leaderboard({ store, board, loading, profile }: LeaderboardProps) {
  const [kind, setKind] = useState<string>(board?.kind ?? 'rating');
  const [query, setQuery] = useState('');

  useEffect(() => {
    store.requestBoard(kind);
  }, [store, kind]);

  const current = board?.kind === kind ? board : null;
  const needle = query.trim().toLowerCase();
  const rows = current?.entries.filter((e) => !needle || e.name.toLowerCase().includes(needle)) ?? [];
  const note = BOARDS.find((b) => b.kind === kind)?.note ?? '';
  const placed = profile ? isPlaced(profile.matchesPlayed) : false;

  return (
    <main className="page page--board">
      <header className="page__head">
        <p className="eyebrow">Leaderboard</p>
        <h1 className="page__title display">The people to beat.</h1>
        <p className="page__lede">{note}</p>
      </header>

      <div className="board__controls">
        <div className="tabs" role="tablist" aria-label="Leaderboard">
          {BOARDS.map((option) => (
            <button
              key={option.kind}
              role="tab"
              type="button"
              aria-selected={kind === option.kind}
              className={`tabs__tab ${kind === option.kind ? 'is-active' : ''}`}
              onClick={() => setKind(option.kind)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          className="input board__search"
          type="search"
          value={query}
          placeholder="Find a player"
          aria-label="Find a player"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && !current ? (
        <p className="page__loading" role="status">
          Reading the board…
        </p>
      ) : !current || current.total === 0 ? (
        <div className="empty">
          <h2 className="empty__title">Nobody is on it yet.</h2>
          <p className="empty__body dim">
            A record joins the board after {PLACEMENT_MATCHES} matches. Yours could be the first.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <h2 className="empty__title">No player by that name.</h2>
          <p className="empty__body dim">
            Only the top {current.entries.length} of {current.total} are listed here.
          </p>
        </div>
      ) : (
        <ol className="board" aria-label="Ranked players">
          {rows.map((entry) => (
            <li
              key={`${entry.position}-${entry.name}`}
              className={`board__row ${entry.position <= 3 ? `is-top is-top${entry.position}` : ''} ${
                current.you?.position === entry.position ? 'is-you' : ''
              }`}
            >
              <span className="board__pos mono">{entry.position}</span>
              <Avatar avatar={entry.avatar} size={30} name={entry.name} />
              <span className="board__name">{entry.name}</span>
              <span className="board__rank">{rankFor(entry.rating).label}</span>
              <span className="board__level mono">Lv {entry.level}</span>
              <span className="board__record mono">
                {entry.wins}W&thinsp;&middot;&thinsp;{entry.losses}L
              </span>
              <span className="board__streak mono">{entry.bestStreak > 0 ? `${entry.bestStreak}W` : '—'}</span>
              <span className="board__rating mono">{entry.rating}</span>
            </li>
          ))}
        </ol>
      )}

      {/* Your own row, pinned, so a page of twenty-five is still about you. */}
      {current?.you && current.you.position > current.entries.length && (
        <div className="board__self">
          <span className="eyebrow">You</span>
          <ol className="board">
            <li className="board__row is-you">
              <span className="board__pos mono">{current.you.position}</span>
              <Avatar avatar={current.you.avatar} size={30} name={current.you.name} />
              <span className="board__name">{current.you.name}</span>
              <span className="board__rank">{rankFor(current.you.rating).label}</span>
              <span className="board__level mono">Lv {current.you.level}</span>
              <span className="board__record mono">
                {current.you.wins}W&thinsp;&middot;&thinsp;{current.you.losses}L
              </span>
              <span className="board__streak mono">
                {current.you.bestStreak > 0 ? `${current.you.bestStreak}W` : '—'}
              </span>
              <span className="board__rating mono">{current.you.rating}</span>
            </li>
          </ol>
        </div>
      )}

      {profile && !placed && (
        <p className="board__foot dim">
          You are {Math.max(0, PLACEMENT_MATCHES - profile.matchesPlayed)} matches from joining the
          board.
        </p>
      )}
    </main>
  );
}
