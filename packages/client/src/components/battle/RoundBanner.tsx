import { memo, useEffect } from 'react';
import type { PublicMatchState } from '@battle/shared';
import { tr, useUiPreferences } from '../../i18n/index.js';

export type RoundVerdict = 'won' | 'lost' | 'draw' | 'void';

/** How the round that just ended went, from one seat. */
export function roundVerdict(match: PublicMatchState, youId: string): RoundVerdict | null {
  const outcome = match.phase === 'roundResult' ? match.round?.outcome : null;
  if (!outcome) return null;
  if (outcome.reason === 'verification-unavailable') return 'void';
  if (!outcome.winnerId) return 'draw';
  return outcome.winnerId === youId ? 'won' : 'lost';
}

const COPY: Record<RoundVerdict, { title: string; line: string }> = {
  won: { title: 'Round won', line: 'Nice find.' },
  lost: { title: 'Round lost', line: 'Shake it off. Next one.' },
  draw: { title: 'No point', line: 'Nobody took this one.' },
  void: { title: 'Round skipped', line: 'The check could not run. Nobody scores.' },
};

/** A short buzz on phones that have one: the hit you feel before you read it. */
export function buzz(pattern: number | number[]): void {
  try {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(pattern);
  } catch {
    /* Not every browser allows it, and nothing depends on it. */
  }
}

/**
 * The verdict, across both cameras, for the second it takes to land.
 *
 * The comparison card underneath says *why*; this says *what*, big enough to
 * read from arm's length with an object still in your hand. It shakes the
 * stage in proportion to what happened — a win lands hard, a loss lands
 * heavy, a draw barely moves — and then gets out of the way.
 */
export const RoundBanner = memo(function RoundBanner({ match, youId }: { match: PublicMatchState; youId: string }) {
  useUiPreferences();
  const verdict = roundVerdict(match, youId);
  const roundId = match.round?.id;
  const mine = match.players[youId]?.score ?? 0;
  const matchPoint = mine === match.settings.winTarget - 1;
  const clinched = mine >= match.settings.winTarget;
  useEffect(() => {
    if (verdict === 'won') buzz([25, 40, 70]);
    else if (verdict === 'lost') buzz(110);
  }, [verdict, roundId]);
  if (!verdict) return null;
  const copy = COPY[verdict];
  return (
    <div key={roundId} className={`round-banner round-banner--${verdict}`} role="status" aria-live="assertive">
      <span className="round-banner__flash" aria-hidden="true" />
      <strong className="round-banner__title">{tr(copy.title)}</strong>
      <span className="round-banner__line">
        {tr(verdict === 'won' && clinched ? 'That wins it!' : verdict === 'won' && matchPoint ? 'Match point!' : copy.line)}
      </span>
    </div>
  );
});
