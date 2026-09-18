import { useEffect, useState } from 'react';
import type { TelegramLeaderboardView } from '@battle/shared';
import { tr } from '../../i18n/index.js';
import { api, ApiError } from '../api.js';
import { Empty, Failed, Loading, PlayerRow } from '../ui.jsx';
import { haptics } from '../sdk.js';
import type { View } from '../router.js';

type Board = 'rating' | 'wins' | 'streak';
type Scope = 'global' | 'friends';

const BOARDS: { id: Board; label: string }[] = [
  { id: 'rating', label: 'Rating' },
  { id: 'wins', label: 'Wins' },
  { id: 'streak', label: 'Streak' },
];

/**
 * The ladder.
 *
 * Your own position is pinned at the bottom whenever you are not on the page
 * being read, because a board that shows the top ten and nothing else is a
 * board about other people.
 */
export function RankScreen({ onGo }: { onGo: (view: View) => void }) {
  const [board, setBoard] = useState<Board>('rating');
  const [scope, setScope] = useState<Scope>('global');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<TelegramLeaderboardView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .leaderboard(board, scope, offset)
      .then(setData)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load the board.')),
      )
      .finally(() => setLoading(false));
  };
  useEffect(load, [board, scope, offset]);

  const pick = (next: Partial<{ board: Board; scope: Scope }>) => {
    haptics.select();
    setOffset(0);
    if (next.board) setBoard(next.board);
    if (next.scope) setScope(next.scope);
  };

  return (
    <>
      <div className="tabs tabs--block" role="tablist" aria-label={tr('Leaderboard')}>
        {BOARDS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={board === option.id}
            className={board === option.id ? 'is-active' : ''}
            onClick={() => pick({ board: option.id })}
          >
            {tr(option.label)}
          </button>
        ))}
      </div>

      <div className="tabs tabs--block" role="tablist" aria-label={tr('Who to compare with')}>
        {(['global', 'friends'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={scope === option}
            className={scope === option ? 'is-active' : ''}
            onClick={() => pick({ scope: option })}
          >
            {tr(option === 'global' ? 'Everyone' : 'Friends')}
          </button>
        ))}
      </div>

      {error ? (
        <Failed message={error} onRetry={load} />
      ) : loading && !data ? (
        <Loading label="Reading the ladder…" />
      ) : !data || data.rows.length === 0 ? (
        <Empty
          title={scope === 'friends' ? 'No friends on the board' : 'The board is empty'}
          body={
            scope === 'friends'
              ? 'Add somebody after a duel and they show up here.'
              : 'Five ranked matches puts a player on the board.'
          }
          action={scope === 'friends' ? 'Find people' : undefined}
          onAction={scope === 'friends' ? () => onGo({ k: 'social' }) : undefined}
        />
      ) : (
        <>
          <div className="tg-section">
            {data.rows.map((row) => (
              <PlayerRow
                key={row.ref}
                player={row}
                position={row.position}
                you={row.you}
                onOpen={row.you ? undefined : () => onGo({ k: 'player', ref: row.ref })}
              />
            ))}
          </div>

          {data.you && !data.rows.some((row) => row.you) && (
            <div className="tg-section">
              <p className="dim" style={{ fontSize: 'var(--t-sm)', textAlign: 'center' }}>
                {tr('Your place')}
              </p>
              <PlayerRow player={data.you} position={data.you.position} you />
            </div>
          )}

          {data.scope === 'global' && data.total > data.rows.length && (
            <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <button
                type="button"
                className="btn btn--block"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - 25))}
              >
                {tr('Back')}
              </button>
              <button
                type="button"
                className="btn btn--block"
                disabled={offset + data.rows.length >= data.total || loading}
                onClick={() => setOffset(offset + 25)}
              >
                {tr('More')}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
