import { tr, useUiPreferences, formatDate } from '../i18n/index.js';
import { ArrowUpRight, ArrowDownRight, Swords } from 'lucide-react';
import type { MatchRecord } from '@battle/shared';

/**
 * What happened last time, in one line each.
 *
 * The result letter is the anchor, the rating change is the part people
 * actually look at, and the XP is there because it is the number that never
 * went down — a losing run still reads as progress.
 */
export function BattleHistory({ history, onPlay }: { history: MatchRecord[]; onPlay: () => void }) {
  useUiPreferences();
  if (!history.length)
    return (
      <div className="blank">
        <Swords size={26} />
        <h3>{tr('Your story starts with a duel.')}</h3>
        <button className="btn btn--primary" onClick={onPlay}>
          {tr('Play your first battle')}
          <ArrowUpRight size={16} />
        </button>
      </div>
    );

  return (
    <ol className="history" aria-label={tr('Recent battles')}>
      {history.map((record, i) => {
        const change = record.ratingAfter - record.ratingBefore;
        return (
          <li key={`${record.at}-${i}`} className={`history__row is-${record.result}`}>
            <span className="history__result" aria-hidden="true">
              {tr(record.result === 'win' ? 'W' : record.result === 'loss' ? 'L' : 'D')}
            </span>
            <span className="history__who">
              <strong>
                {tr('vs ')}
                {record.opponentName}
              </strong>
              <time dateTime={new Date(record.at).toISOString()}>
                {formatDate(record.at)}
                {record.forfeited ? ` · ${tr('forfeit')}` : ''}
              </time>
            </span>
            <span className="history__score num">
              {record.yourScore}
              <i>{'–'}</i>
              {record.theirScore}
            </span>
            {record.mode === 'casual' ? (
              // A casual match never touched the rating, so it says what it was instead of "+0".
              <span className="history__delta history__delta--casual">{tr('Quick play')}</span>
            ) : (
              <span className={`history__delta num ${change >= 0 ? 'is-up' : 'is-down'}`}>
                {change >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {change > 0 ? '+' : ''}
                {change}
              </span>
            )}
            <span className="history__xp num">
              {'+'}
              {record.xp ?? 0}
              {tr(' XP')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
