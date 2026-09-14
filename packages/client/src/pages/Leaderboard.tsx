import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Flame,
  Minus,
  Trophy,
  RefreshCw,
} from 'lucide-react';
import {
  PLACEMENT_MATCHES,
  rankFor,
  type LeaderboardEntry,
  type PublicProfile,
} from '@battle/shared';
import type { BoardState, MatchStore } from '../net/store.js';
import { Avatar } from '../components/Identity.jsx';
import { RankEmblem } from '../components/GameArt.jsx';
const BOARDS = [
  { kind: 'rating', label: 'Rating' },
  { kind: 'wins', label: 'Victories' },
  { kind: 'streak', label: 'Best streaks' },
];
export function Leaderboard({
  store,
  board,
  loading,
  profile,
  error,
}: {
  store: MatchStore;
  board: BoardState | null;
  loading: boolean;
  profile: PublicProfile | null;
  error: string | null;
}) {
  useUiPreferences();
  const [kind, setKind] = useState('rating');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    store.requestBoard(kind, offset);
  }, [store, kind, offset]);
  const current =
    board?.kind === kind &&
    ((board.offset ?? 0) === offset || (offset >= board.total && (board.offset ?? 0) < offset))
      ? board
      : null;
  const pageOffset = current?.offset ?? offset;
  const top = pageOffset === 0 ? (current?.entries.slice(0, 3) ?? []) : [];
  const outside =
    current?.you && !current.entries.some((e) => e.position === current.you!.position);
  return (
    <main className="page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">{tr('The competition')}</span>
          <h1>{tr('Meet the people to beat.')}</h1>
          <p>{tr('Real players. Earned positions. Your next rival might be right here.')}</p>
        </div>
        <span className="status-tag">
          <Trophy size={15} />
          {tr(current?.total ?? '—')}
          {tr(' ranked players')}
        </span>
      </header>
      <div className="board-controls">
        <div className="filter-row" role="group" aria-label={tr('Leaderboard order')}>
          {BOARDS.map((b) => (
            <button
              key={b.kind}
              className={`filter ${kind === b.kind ? 'is-active' : ''}`}
              aria-pressed={kind === b.kind}
              onClick={() => {
                setKind(b.kind);
                setOffset(0);
              }}
            >
              {tr(b.label)}
            </button>
          ))}
        </div>
        <button
          className="icon-button"
          onClick={() => store.requestBoard(kind, offset)}
          disabled={loading}
          aria-label={tr('Refresh leaderboard')}
          title={tr('Refresh')}
        >
          <RefreshCw size={17} />
        </button>
      </div>
      {error ? (
        <div className="empty" role="alert">
          <Trophy size={32} />
          <h2>{tr('The ladder is taking a breather.')}</h2>
          <p>{tr(error)}</p>
          <button className="btn" onClick={() => store.requestBoard(kind, offset)}>
            {tr('Try again')}
          </button>
        </div>
      ) : loading && !current ? (
        <div className="board-skeleton" role="status" aria-label={tr('Loading leaderboard')}>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} />
          ))}
        </div>
      ) : current && current.total === 0 ? (
        <div className="board-empty">
          <div className="empty-podium">
            <RankEmblem rating={1300} size={85} />
            <RankEmblem rating={1900} size={120} />
            <RankEmblem rating={1100} size={85} />
          </div>
          <span className="eyebrow">{tr('Every rivalry starts with someone')}</span>
          <h2>{tr('The first chapter is unwritten.')}</h2>
          <p>
            {tr('Finish ')}
            {tr(PLACEMENT_MATCHES)}
            {tr(' ranked matches to claim your spot.')}
            <br />
            {tr('The podium is waiting for its first champions.')}
          </p>
          <a className="btn btn--primary" href="/play">
            {tr('Start your placement ')}
            <ChevronRight size={16} />
          </a>
        </div>
      ) : (
        current && (
          <>
            {top.length > 0 && (
              <section className="podium" aria-label={tr('Top players')}>
                {top.map((player, i) => (
                  <article
                    key={player.position}
                    className={`podium-player podium-player--${i + 1} ${current.you?.position === player.position ? 'is-you' : ''}`}
                  >
                    <span className="podium-place">
                      {i === 0 ? <Trophy size={20} /> : `0${i + 1}`}
                    </span>
                    <Avatar avatar={player.avatar} name={player.name} size={i === 0 ? 64 : 52} />
                    <h2>
                      {player.name}
                      {current.you?.position === player.position && <small>{tr('YOU')}</small>}
                    </h2>
                    <span>{tr(rankFor(player.rating).label)}</span>
                    <strong>
                      {tr(
                        kind === 'rating'
                          ? player.rating
                          : kind === 'wins'
                            ? player.wins
                            : player.bestStreak,
                      )}
                      <small>
                        {tr(kind === 'rating' ? 'MMR' : kind === 'wins' ? 'WINS' : 'STREAK')}
                      </small>
                    </strong>
                    <div className="podium-base">
                      {tr(
                        i === 0
                          ? 'THE ONE TO BEAT'
                          : i === 1
                            ? 'CLOSE ON THEIR HEELS'
                            : 'IN GOOD COMPANY',
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )}
            <section className="leaderboard-panel" aria-label={tr('Ranked players')}>
              <div className="leaderboard-head">
                <span>{tr('Rank')}</span>
                <span>{tr('Player / division')}</span>
                <span>{tr('Form')}</span>
                <span>{tr('Wins')}</span>
                <span>{tr('Streak')}</span>
                <span>{tr('MMR')}</span>
              </div>
              <ol className="leaderboard-list">
                {current.entries.map((entry) => (
                  <BoardRow
                    key={entry.position}
                    entry={entry}
                    you={current.you?.position === entry.position}
                  />
                ))}
              </ol>
            </section>
            <div className="board-pagination">
              <span>
                {tr(pageOffset + 1)}
                {'–'}
                {tr(Math.min(pageOffset + 25, current.total))}
                {tr(' of ')}
                {tr(current.total)}
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label={tr('Previous page')}
                  disabled={pageOffset === 0 || loading}
                  onClick={() => setOffset(Math.max(0, pageOffset - 25))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label={tr('Next page')}
                  disabled={pageOffset + 25 >= current.total || loading}
                  onClick={() => setOffset(pageOffset + 25)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            {outside && current.you && (
              <section className="your-position">
                <span className="eyebrow">{tr('Your place on the ladder')}</span>
                <ol>
                  <BoardRow entry={current.you} you />
                </ol>
                <button
                  className="text-link"
                  onClick={() => setOffset(Math.floor((current.you!.position - 1) / 25) * 25)}
                >
                  {tr('Jump to my position ')}
                  <ChevronRight size={15} />
                </button>
              </section>
            )}
          </>
        )
      )}
      {profile && profile.matchesPlayed < PLACEMENT_MATCHES && (
        <div className="placement-note">
          <RankEmblem size={46} placing />
          <p>
            <strong>
              {tr(PLACEMENT_MATCHES - profile.matchesPlayed)}
              {tr(' matches to make your mark.')}
            </strong>
            <span>{tr('Finish placement to appear on the leaderboard.')}</span>
          </p>
          <a className="text-link" href="/play">
            {tr('Play ')}
            <ChevronRight size={15} />
          </a>
        </div>
      )}
      <p className="page-note">
        {tr(
          'Movement is since the player’s previous ranked match. Recent form shows up to five results, newest first.',
        )}
      </p>
    </main>
  );
}
function BoardRow({ entry, you = false }: { entry: LeaderboardEntry; you?: boolean }) {
  useUiPreferences();
  const movement = entry.movement ?? 0;
  return (
    <li className={`leaderboard-row ${you ? 'is-you' : ''}`}>
      <div className="position-cell">
        <b>{tr(entry.position)}</b>
        <span
          title={tr(`${movement > 0 ? 'Up' : 'Down'} ${Math.abs(movement)} places`)}
          className={movement > 0 ? 'is-up' : movement < 0 ? 'is-down' : ''}
        >
          {movement > 0 ? (
            <ArrowUpRight size={13} />
          ) : movement < 0 ? (
            <ArrowDownRight size={13} />
          ) : (
            <Minus size={12} />
          )}
          {tr(movement !== 0 && Math.abs(movement))}
        </span>
      </div>
      <div className="player-cell">
        <Avatar avatar={entry.avatar} name={entry.name} size={38} />
        <div>
          <strong>
            {entry.name}
            {you && <small>{tr('YOU')}</small>}
          </strong>
          <span>{tr(rankFor(entry.rating).label)}</span>
        </div>
      </div>
      <div
        className="form-cell"
        aria-label={tr(`Recent results: ${entry.recent?.join(', ') || 'No recent results'}`)}
      >
        {entry.recent?.map((r, i) => (
          <i key={i} className={`is-${r}`}>
            {tr(r[0]!.toUpperCase())}
          </i>
        ))}
      </div>
      <span className="wins-cell">{tr(entry.wins)}</span>
      <span className={`streak-cell ${entry.streak >= 3 ? 'is-hot' : ''}`}>
        {entry.streak >= 3 && <Flame size={15} />}
        {tr(entry.streak)}
      </span>
      <strong className="mmr-cell">{tr(entry.rating.toLocaleString())}</strong>
    </li>
  );
}
