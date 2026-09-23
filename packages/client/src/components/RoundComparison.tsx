import type { PublicMatchState, PlayerRoundResult } from '@battle/shared';
import { tr, useUiPreferences } from '../i18n/index.js';

/** Display only server-persisted measurements. Preview landmarks never become a score. */
export function RoundComparison({ match, youId }: { match: PublicMatchState; youId: string }) {
  const { locale } = useUiPreferences();
  const outcome = match.round?.outcome;
  if (!outcome) return null;
  if (outcome.reason === 'verification-unavailable') return <p className="round-comparison__explanation">
    {tr('Could not check this round. Switching tasks.')}</p>;
  const entries = match.seats.filter((id): id is string => Boolean(id)).map((id) => ({
    id, result: outcome.perPlayer[id], name: match.players[id]?.name ?? tr('Opponent'),
  }));
  entries.sort((a, b) => a.id === youId ? -1 : b.id === youId ? 1 : 0);
  const label = (r?: PlayerRoundResult) => r?.evaluation
    ? locale === 'ru' ? r.evaluation.labelRu ?? tr('Shown object') : r.evaluation.label
    : tr(r?.elapsedMs == null ? 'No photo' : 'Answer');
  const color = entries[0]?.result?.evaluation?.color;
  const criterion = color ? tr(`${color} colour fit`) : tr('Task fit');
  return <div className="round-comparison">
    <div className="round-comparison__scores">
      {entries.map(({ id, result, name }, i) => <div key={id} className={`round-comparison__side ${outcome.winnerId === id ? 'is-winner' : ''}`}>
        {i === 1 && <span className="round-comparison__versus" aria-hidden="true">VS</span>}
        <span className="round-comparison__player">{id === youId ? tr('You') : name}</span>
        <strong>{label(result)}</strong>
        <span className={result?.valid ? 'round-comparison__value is-valid' : 'round-comparison__value'}>
          {result?.evaluation ? `${result.valid ? result.evaluation.score : 0}/100` : '—'}
        </span>
        {result?.elapsedMs != null && <span className="round-comparison__time">{(result.elapsedMs / 1000).toFixed(1)} {tr('sec')}</span>}
      </div>)}
    </div>
    <p className="round-comparison__explanation">{outcome.reason === 'faster' ? tr('Close answers. Speed won.') :
      outcome.reason === 'both-perfect-tie' ? tr('Even match!') :
      outcome.reason === 'no-submissions' ? tr('No photos this round.') : criterion}</p>
    {entries.some(({ result }) => result?.note) && <details className="round-comparison__details">
      <summary>{tr('Why this result?')}</summary>
      {entries.map(({ id, name, result }) => <p key={id}><b>{id === youId ? tr('You') : name}:</b>{' '}
        {locale === 'ru' && result?.evaluation?.reasonRu ? result.evaluation.reasonRu : tr(result?.note ?? 'No photo')}</p>)}
    </details>}
  </div>;
}
