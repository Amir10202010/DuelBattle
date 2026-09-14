import { tr, useUiPreferences, formatDate } from '../i18n/index.js';
import { ArrowUpRight, ArrowDownRight, Swords } from 'lucide-react';
import type { MatchRecord } from '@battle/shared';
export function BattleHistory({ history, onPlay }: { history: MatchRecord[]; onPlay: () => void }) {
  useUiPreferences();
  if (!history.length)
    return (
      <div className="history-empty">
        <Swords size={30} />
        <h3>{tr('Your story starts with a duel.')}</h3>
        <p>{tr('Finished ranked battles appear here, with your score and earned XP.')}</p>
        <button className="text-link" onClick={onPlay}>
          {tr('Play your first battle ')}
          <ArrowUpRight size={16} />
        </button>
      </div>
    );
  return (
    <ol className="battle-history" aria-label={tr('Recent battles')}>
      {history.map((r, i) => {
        const change = r.ratingAfter - r.ratingBefore;
        return (
          <li key={`${r.at}-${i}`}>
            <span className={`result-tile is-${r.result}`}>
              {tr(r.result === 'win' ? 'W' : r.result === 'loss' ? 'L' : 'D')}
            </span>
            <span className="history-opponent">
              <strong>
                {tr('vs ')}
                {r.opponentName}
              </strong>
              <time dateTime={new Date(r.at).toISOString()}>
                {tr(formatDate(r.at))}
                {' · '}
                {tr(r.forfeited ? 'forfeit' : r.result)}
              </time>
            </span>
            <b className="history-score">
              {tr(r.yourScore)}
              <span>{' : '}</span>
              {tr(r.theirScore)}
            </b>
            <span className={`history-delta ${change >= 0 ? 'is-up' : 'is-down'}`}>
              {change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {tr(change > 0 ? '+' : '')}
              {tr(change)} <small>{tr('MMR')}</small>
            </span>
            <span className="history-xp">
              {'+'}
              {tr(r.xp ?? 0)}
              {tr(' XP')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
