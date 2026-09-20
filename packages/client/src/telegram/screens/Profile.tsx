import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import type { TelegramMatchRow } from '@battle/shared';
import { tr, formatDate } from '../../i18n/index.js';
import { api, ApiError } from '../api.js';
import { Empty, Failed, Loading, Section, when } from '../ui.jsx';
import { haptics, shareLink } from '../sdk.js';
import type { View } from '../router.js';

export function MatchesScreen({ onGo }: { onGo: (view: View) => void }) {
  const [rows, setRows] = useState<TelegramMatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api
      .matches(0)
      .then((result) => setRows(result.matches))
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('Could not load your matches.')),
      );
  };
  useEffect(load, []);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!rows) return <Loading />;
  if (rows.length === 0)
    return (
      <Empty
        title="No matches yet"
        body="You have not finished a ranked duel. The first one starts your rating."
      />
    );

  return (
    <Section title="Match history">
      {rows.map((match) => {
        const change = match.ratingAfter - match.ratingBefore;
        return (
          <button
            key={`${match.at}-${match.index}`}
            type="button"
            className="tg-row"
            onClick={() => onGo({ k: 'match', index: match.index })}
          >
            <span
              className={
                match.result === 'win' ? 'tg-win' : match.result === 'loss' ? 'tg-loss' : 'tg-draw'
              }
            >
              {tr(match.result === 'win' ? 'WIN' : match.result === 'loss' ? 'LOSS' : 'DRAW')}
            </span>
            <span className="tg-row__main">
              <strong>
                {match.yourScore}–{match.theirScore} {tr('vs')} {match.opponentName || tr('Player')}
              </strong>
              <span>{when(match.at)}</span>
            </span>
            <span className="tg-row__end">
              <b className={change >= 0 ? 'tg-win' : 'tg-loss'}>
                {change >= 0 ? '+' : ''}
                {change}
              </b>
            </span>
          </button>
        );
      })}
    </Section>
  );
}

/**
 * One match, and the card you can send about it.
 *
 * The share card is built server-side from the same history row, so it cannot
 * claim anything the player was not already shown.
 */
export function MatchScreen({ index }: { index: number }) {
  const [match, setMatch] = useState<TelegramMatchRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);

  const load = () => {
    setError(null);
    api
      .match(index)
      .then(setMatch)
      .catch((failure: unknown) =>
        setError(failure instanceof ApiError ? failure.message : tr('That match is gone.')),
      );
  };
  useEffect(load, [index]);

  if (error) return <Failed message={error} onRetry={load} />;
  if (!match) return <Loading />;

  const change = match.ratingAfter - match.ratingBefore;
  const tone = match.result === 'win' ? 'tg-win' : match.result === 'loss' ? 'tg-loss' : 'tg-draw';

  return (
    <>
      <div className="plate tg-share">
        <p className={`eyebrow ${tone}`}>
          {tr(match.result === 'win' ? 'Victory' : match.result === 'loss' ? 'Defeat' : 'Draw')}
        </p>
        <h2>
          {match.yourScore}–{match.theirScore}
        </h2>
        <div className="tg-share__lines">
          <span>
            {tr('vs')} {match.opponentName || tr('Player')}
          </span>
          <span className={tone}>
            {change >= 0 ? '+' : ''}
            {change} {tr('rating')} · {match.ratingAfter}
          </span>
          {match.xp ? <span>+{match.xp} {tr('XP')}</span> : null}
          <span className="dim">{formatDate(match.at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>

      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={sharing}
        onClick={() => {
          setSharing(true);
          haptics.tap();
          api
            .shareCard(index)
            .then((card) => shareLink(card.link, card.shareText))
            .catch(() => setError(tr('Could not build that card.')))
            .finally(() => setSharing(false));
        }}
      >
        <Share2 size={16} aria-hidden />
        {tr('Share this result')}
      </button>

      {match.forfeited && (
        <p className="dim" style={{ textAlign: 'center' }}>
          {tr('This one ended early, so it paid no XP.')}
        </p>
      )}
    </>
  );
}
