import type { CSSProperties } from 'react';
import { Flame, Trophy } from 'lucide-react';
import type { RoundOutcome } from '@battle/shared';
import { tr, useUiPreferences } from '../i18n/index.js';

/** A draw or a lost round ends the streak. This never changes the score. */
export function roundStreak(history: readonly RoundOutcome[], playerId: string | null): number {
  if (!playerId) return 0;
  let wins = 0;
  for (let i = history.length - 1; i >= 0 && history[i]?.winnerId === playerId; i--) wins++;
  return wins;
}

/** Small, finite CSS effects over the winning camera; no canvas or animation loop. */
export function Celebration({ streak = 1, finale = false }: { streak?: number; finale?: boolean }) {
  useUiPreferences();
  return (
    <div className={`celebration ${finale ? 'celebration--finale' : ''}`} aria-hidden="true">
      <div className="celebration__fire">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ '--i': i, '--lean': `${((i % 3) - 1) * 13}deg` } as CSSProperties} />
        ))}
      </div>
      <div className="celebration__sparks">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ '--i': i, '--angle': `${i * 30}deg` } as CSSProperties} />
        ))}
      </div>
      <div className="celebration__badge">
        {finale ? <Trophy size={48} strokeWidth={2.2} /> : <Flame size={34} fill="currentColor" />}
        {!finale && <strong>+1</strong>}
        {!finale && streak > 1 && <span>{tr(`${streak} in a row!`)}</span>}
      </div>
    </div>
  );
}
