import { useEffect, useState, type CSSProperties } from 'react';
import type { PublicMatchState, PublicProfile } from '@battle/shared';
import { Hero } from '../avatar/Hero.jsx';
import { sound } from '../../media/sound.js';
import { tr, useUiPreferences } from '../../i18n/index.js';

/**
 * The hit.
 *
 * Two placements, because two moments deserve different volume. A point is a
 * jab: it plays in a band along the bottom of the camera area, where you can
 * see it without losing sight of the round. Winning the match is the finisher:
 * it takes the whole screen, holds long enough to be watched, and names who
 * just lost. Same rig, same timings scaled up — so the small one teaches you to
 * read the big one.
 *
 * It is decoration over an outcome the server already decided. Nothing here
 * changes a score, and both players see the same blow land the same way.
 */
export function DuelActors({
  match,
  youId,
  standings,
  placement,
}: {
  match: PublicMatchState;
  youId: string;
  standings: Record<string, PublicProfile>;
  /** 'round' rides under the cameras; 'match' takes the screen. */
  placement: 'round' | 'match';
}) {
  useUiPreferences();
  const finisher = placement === 'match';
  const winner = finisher
    ? match.phase === 'matchResult'
      ? match.winnerId
      : null
    : match.phase === 'roundResult'
      ? (match.round?.outcome?.winnerId ?? null)
      : null;
  const event = winner ? `${match.round?.id ?? 'end'}:${match.phase}` : '';
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!event) {
      setActive(false);
      return;
    }
    setActive(true);
    const impact = setTimeout(() => sound.play(finisher ? 'finisher' : 'hit'), finisher ? 620 : 430);
    const end = setTimeout(() => setActive(false), finisher ? 3_000 : 1_900);
    return () => {
      clearTimeout(impact);
      clearTimeout(end);
    };
  }, [event, finisher]);

  if (!active || !winner) return null;

  const ids = [youId, ...match.seats.filter((id): id is string => Boolean(id && id !== youId))]
    .slice(0, 2);
  const winningLeft = winner === youId;
  const kit = standings[winner]?.loadout;
  const loser = ids.find((id) => id !== winner);
  const youWon = winner === youId;

  return (
    <div
      key={event}
      className={[
        'duel-actors',
        `duel-actors--${placement}`,
        winningLeft ? 'duel-actors--left' : 'duel-actors--right',
        finisher ? 'duel-actors--finish' : '',
        `duel-actors--${kit?.weapon ?? 'mitten'}`,
        kit?.finisher === 'supernova' && finisher ? 'duel-actors--nova' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={finisher ? 'status' : undefined}
      aria-hidden={finisher ? undefined : true}
    >
      <div className="duel-actors__stage">
        {ids.map((id) => (
          <div key={id} className={`duel-actors__hero ${id === winner ? 'is-attacker' : 'is-hit'}`}>
            <Hero
              loadout={standings[id]?.loadout}
              pose={id === winner ? 'attack' : 'hit'}
              size={finisher ? 250 : 132}
            />
            {id === winner && (
              <b className="point-pop">{finisher ? tr('K.O.') : '+1'}</b>
            )}
          </div>
        ))}
        <div className="duel-projectile" aria-hidden="true">
          <svg viewBox="0 0 120 50">
            <path d="M4 38Q65 34 112 5L91 35 106 37Q45 51 4 38Z" fill="currentColor" />
            <path d="M24 38 97 18" stroke="white" strokeWidth="4" />
          </svg>
        </div>
        <div className="duel-impact" aria-hidden="true">
          <i />
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
        <div className="duel-speedlines" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <i key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      </div>

      {finisher && (
        <p className="duel-actors__caption">
          <strong>{tr(youWon ? 'You win the duel' : 'Duel lost')}</strong>
          <span>
            {youWon
              ? `${match.players[loser ?? '']?.name ?? tr('Your opponent')} ${tr('is down')}`
              : `${match.players[winner]?.name ?? tr('Your opponent')} ${tr('takes it')}`}
          </span>
        </p>
      )}
    </div>
  );
}
