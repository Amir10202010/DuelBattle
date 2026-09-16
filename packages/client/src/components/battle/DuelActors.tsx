import { useEffect, useState, type CSSProperties } from 'react';
import type { PublicMatchState, PublicProfile } from '@battle/shared';
import { Hero } from '../avatar/Hero.jsx';
import { sound } from '../../media/sound.js';
import { Trophy } from 'lucide-react';

export function DuelActors({
  match,
  youId,
  standings,
}: {
  match: PublicMatchState;
  youId: string;
  standings: Record<string, PublicProfile>;
}) {
  const winner =
    match.phase === 'roundResult'
      ? match.round?.outcome?.winnerId
      : match.phase === 'matchResult'
        ? match.winnerId
        : null;
  const finisher = match.phase === 'matchResult';
  const event = winner ? `${match.round?.id}:${match.phase}` : '';
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!event) {
      setActive(false);
      return;
    }
    setActive(true);
    const impact = setTimeout(() => sound.play(finisher ? 'finisher' : 'hit'), 430);
    const end = setTimeout(() => setActive(false), finisher ? 1400 : 1050);
    return () => {
      clearTimeout(impact);
      clearTimeout(end);
    };
  }, [event, finisher]);
  if (!active || !winner) return null;
  const ids = [
    youId,
    ...match.seats.filter((id): id is string => Boolean(id && id !== youId)),
  ].slice(0, 2);
  const winningLeft = winner === youId;
  const kit = standings[winner]?.loadout;
  return (
    <div
      key={event}
      className={`duel-actors ${winningLeft ? 'duel-actors--left' : 'duel-actors--right'} ${finisher ? 'duel-actors--finish' : ''} duel-actors--${kit?.weapon ?? 'mitten'} ${kit?.finisher === 'supernova' && finisher ? 'duel-actors--nova' : ''}`}
      aria-hidden="true"
    >
      {ids.map((id) => (
        <div key={id} className={`duel-actors__hero ${id === winner ? 'is-attacker' : 'is-hit'}`}>
          <Hero
            loadout={standings[id]?.loadout}
            pose={id === winner ? 'attack' : 'hit'}
            size={158}
          />
          {id === winner && <b className="point-pop">{finisher ? <Trophy size={40} /> : '+1'}</b>}
        </div>
      ))}
      <div className="duel-projectile">
        <svg viewBox="0 0 120 50">
          <path d="M4 38Q65 34 112 5L91 35 106 37Q45 51 4 38Z" fill="currentColor" />
          <path d="M24 38 97 18" stroke="white" strokeWidth="4" />
        </svg>
      </div>
      <div className="duel-impact">
        <i />
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
