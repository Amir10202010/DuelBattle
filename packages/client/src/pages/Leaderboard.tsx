import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Crown,
  Flame,
  Minus,
  RefreshCw,
  Trophy,
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
  { kind: 'rating', label: 'Rating', unit: 'MMR' },
  { kind: 'wins', label: 'Wins', unit: 'WINS' },
  { kind: 'streak', label: 'Streaks', unit: 'STREAK' },
];
const PAGE = 25;
/** Which player a podium place is standing in, in the order they read best. */
const PODIUM_ORDER = [1, 0, 2];

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
  const rest = pageOffset === 0 ? (current?.entries.slice(3) ?? []) : (current?.entries ?? []);
  const outside =
    current?.you && !current.entries.some((e) => e.position === current.you!.position);
  const unit = BOARDS.find((b) => b.kind === kind)?.unit ?? 'MMR';
  const value = (entry: LeaderboardEntry) =>
    kind === 'rating' ? entry.rating : kind === 'wins' ? entry.wins : entry.bestStreak;

  return (
    <main className="page ladder">
      <header className="page__head page__head--row">
        <div>
          <h1 className="page__title display">{tr('Meet the people to beat.')}</h1>
        </div>
        {Boolean(current?.total) && (
          <span className="headcount">
            <b className="num">{current?.total}</b>
            <span className="eyebrow">{tr('ranked players')}</span>
          </span>
        )}
      </header>

      <div className="ladder__controls">
        <div className="tabs" role="group" aria-label={tr('Leaderboard order')}>
          {BOARDS.map((b) => (
            <button
              key={b.kind}
              className={kind === b.kind ? 'is-active' : ''}
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
          aria-label={tr('Refresh the ladder')}
          title={tr('Refresh')}
        >
          <RefreshCw size={17} className={loading ? 'is-spinning' : ''} />
        </button>
      </div>

      {error ? (
        <div className="blank" role="alert">
          <Trophy size={30} />
          <h2>{tr('The ladder is taking a breather.')}</h2>
          <p>{tr(error)}</p>
          <button className="btn btn--primary" onClick={() => store.requestBoard(kind, offset)}>
            <RefreshCw size={16} />
            {tr('Try again')}
          </button>
        </div>
      ) : loading && !current ? (
        <div className="ladder__skeleton" role="status" aria-label={tr('Loading the ladder')}>
          {Array.from({ length: 8 }, (_, i) => (
            <span className="skel" key={i} />
          ))}
        </div>
      ) : current && current.total === 0 ? (
        <div className="blank ladder__empty">
          <div className="ladder__empty-art" aria-hidden="true">
            <RankEmblem rating={1300} size={78} />
            <RankEmblem rating={1900} size={104} />
            <RankEmblem rating={1100} size={78} />
          </div>
          <h2>{tr('The first chapter is unwritten.')}</h2>
          <p>
            {tr('Finish ')}
            {PLACEMENT_MATCHES}
            {tr(' ranked battles to claim your spot. The podium is waiting for its champions.')}
          </p>
          <a className="btn btn--primary" href="/play">
            {tr('Start your placement')}
            <ChevronRight size={16} />
          </a>
        </div>
      ) : (
        current && (
          <>
            {top.length > 0 && (
              <section className="podium" aria-label={tr('Top players')}>
                {PODIUM_ORDER.filter((i) => top[i]).map((i) => {
                  const player = top[i]!;
                  const you = current.you?.position === player.position;
                  return (
                    <article
                      key={player.position}
                      className={`podium__place podium__place--${i + 1} plate ${you ? 'is-you' : ''}`}
                    >
                      <span className="podium__rank num">
                        {i === 0 ? <Crown size={19} /> : `0${i + 1}`}
                      </span>
                      <Avatar avatar={player.avatar} name={player.name} size={i === 0 ? 62 : 50} />
                      <h2>
                        {player.name}
                        {you && <small>{tr('YOU')}</small>}
                      </h2>
                      <span className="podium__tier">{tr(rankFor(player.rating).label)}</span>
                      <strong className="num">
                        {value(player)}
                        <small>{tr(unit)}</small>
                      </strong>
                      <span className="podium__base">
                        {tr(
                          i === 0
                            ? 'The one to beat'
                            : i === 1
                              ? 'Close on their heels'
                              : 'In good company',
                        )}
                      </span>
                    </article>
                  );
                })}
              </section>
            )}

            <section className="board" aria-label={tr('Ranked players')}>
              <div className="board__head">
                <span>{tr('Rank')}</span>
                <span>{tr('Player')}</span>
                <span>{tr('Form')}</span>
                <span>{tr('Wins')}</span>
                <span>{tr('Streak')}</span>
                <span>{tr(unit)}</span>
              </div>
              <ol className="board__list">
                {rest.map((entry) => (
                  <BoardRow
                    key={entry.position}
                    entry={entry}
                    value={value(entry)}
                    you={current.you?.position === entry.position}
                  />
                ))}
              </ol>
              {rest.length === 0 && top.length > 0 && (
                <p className="board__note">
                  {tr('Everybody ranked so far is on the podium. Play to push them off it.')}
                </p>
              )}
            </section>

            {outside && current.you && (
              <section className="board board--you" aria-label={tr('Your place on the ladder')}>
                <div className="board__youhead">
                  <span className="eyebrow">{tr('Your place on the ladder')}</span>
                  <button
                    className="text-link"
                    onClick={() => setOffset(Math.floor((current.you!.position - 1) / PAGE) * PAGE)}
                  >
                    {tr('Jump to it')}
                    <ChevronRight size={15} />
                  </button>
                </div>
                <ol className="board__list">
                  <BoardRow entry={current.you} value={value(current.you)} you />
                </ol>
              </section>
            )}

            {current.total > PAGE && (
              <div className="board__pager">
                <span className="num">
                  {pageOffset + 1}
                  {'–'}
                  {Math.min(pageOffset + PAGE, current.total)}
                  {tr(' of ')}
                  {current.total}
                </span>
                <div>
                  <button
                    className="icon-button"
                    aria-label={tr('Previous page')}
                    disabled={pageOffset === 0 || loading}
                    onClick={() => setOffset(Math.max(0, pageOffset - PAGE))}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={tr('Next page')}
                    disabled={pageOffset + PAGE >= current.total || loading}
                    onClick={() => setOffset(pageOffset + PAGE)}
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </>
        )
      )}

      {profile && profile.matchesPlayed < PLACEMENT_MATCHES && (
        <aside className="placement">
          <RankEmblem size={46} placing />
          <p>
            <strong>
              {PLACEMENT_MATCHES - profile.matchesPlayed}
              {tr(' battles to make your mark.')}
            </strong>
            <span>{tr('Finish placement to appear on the ladder.')}</span>
          </p>
          <a className="btn btn--primary btn--sm" href="/play">
            {tr('Play')}
            <ChevronRight size={15} />
          </a>
        </aside>
      )}

    </main>
  );
}

function BoardRow({
  entry,
  value,
  you = false,
}: {
  entry: LeaderboardEntry;
  value: number;
  you?: boolean;
}) {
  useUiPreferences();
  const movement = entry.movement ?? 0;
  return (
    <li className={`board__row ${you ? 'is-you' : ''}`}>
      <div className="board__pos">
        <b className="num">{entry.position}</b>
        <span
          className={`board__move ${movement > 0 ? 'is-up' : movement < 0 ? 'is-down' : ''}`}
          title={tr(`${movement > 0 ? 'Up' : 'Down'} ${Math.abs(movement)} places`)}
        >
          {movement > 0 ? (
            <ArrowUpRight size={12} />
          ) : movement < 0 ? (
            <ArrowDownRight size={12} />
          ) : (
            <Minus size={11} />
          )}
          {movement !== 0 && Math.abs(movement)}
        </span>
      </div>
      <div className="board__player">
        <Avatar avatar={entry.avatar} name={entry.name} size={36} />
        <div>
          <strong>
            {entry.name}
            {you && <small>{tr('YOU')}</small>}
          </strong>
          <span>
            {tr(rankFor(entry.rating).label)}
            <i>{'·'}</i>
            {tr('Lv ')}
            {entry.level}
          </span>
        </div>
      </div>
      <div
        className="board__form"
        aria-label={tr(`Recent results: ${entry.recent?.join(', ') || 'No recent results'}`)}
      >
        {entry.recent?.map((r, i) => (
          <i key={i} className={`is-${r}`}>
            {tr(r[0]!.toUpperCase())}
          </i>
        ))}
      </div>
      <span className="board__wins num">{entry.wins}</span>
      <span className={`board__streak num ${entry.streak >= 3 ? 'is-hot' : ''}`}>
        {entry.streak >= 3 && <Flame size={14} />}
        {entry.streak}
      </span>
      <strong className="board__value num">{value.toLocaleString()}</strong>
    </li>
  );
}
