import { tr, useUiPreferences } from '../i18n/index.js';
import { memo } from 'react';
import { opponentIdOf, opponentOf, type PublicMatchState } from '@battle/shared';

/**
 * How the night stands, across rematches.
 *
 * Without it the rematch button restarts a game; with it, the rematch button
 * settles something. The line is deliberately written from the reader's point
 * of view — "you lead" rather than a bare pair of numbers.
 */
export function seriesLine(match: PublicMatchState, youId: string): string | null {
  const opponentId = opponentIdOf(match, youId);
  const opponent = opponentOf(match, youId);
  const mine = match.series[youId] ?? 0;
  const theirs = opponentId ? (match.series[opponentId] ?? 0) : 0;
  const played = mine + theirs;

  if (played === 0) return null;
  if (played === 1) {
    return mine === 1 ? 'First match yours.' : `First match to ${opponent?.name ?? 'them'}.`;
  }
  if (mine === theirs) return `All square on the night, ${mine} each.`;
  return mine > theirs
    ? `You lead the night ${mine}–${theirs}.`
    : `${opponent?.name ?? 'They'} lead${opponent ? 's' : ''} the night ${theirs}–${mine}.`;
}

export const SeriesLine = memo(function SeriesLine({
  match,
  youId,
  className = '',
}: {
  match: PublicMatchState;
  youId: string;
  className?: string;
}) {
  useUiPreferences();
  const line = seriesLine(match, youId);
  if (!line) return null;
  return <p className={`series ${className}`}>{tr(line)}</p>;
});
