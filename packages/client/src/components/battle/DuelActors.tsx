import { memo, useEffect, useState, type CSSProperties } from 'react';
import { gearById, type PublicMatchState, type PublicProfile } from '@battle/shared';
import { Hero } from '../avatar/Hero.jsx';
import { sound } from '../../media/sound.js';
import { tr, useUiPreferences } from '../../i18n/index.js';

/** The server decides the score. This persistent stage only performs it. */
export const DuelActors = memo(function DuelActors({ match, youId, standings, placement }: {
  match: PublicMatchState; youId: string; standings: Record<string, PublicProfile>;
  placement: 'round' | 'match';
}) {
  useUiPreferences();
  const finisher = placement === 'match';
  const winner = finisher ? match.phase === 'matchResult' ? match.winnerId : null
    : match.phase === 'roundResult' ? match.round?.outcome?.winnerId ?? null : null;
  const event = winner ? `${match.round?.id ?? 'end'}:${match.phase}:${winner}` : '';
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(Boolean(event));
    if (!event) return;
    const impact = setTimeout(() => sound.play(finisher ? 'finisher' : 'hit'), 430);
    const end = setTimeout(() => setActive(false), 1250);
    return () => { clearTimeout(impact); clearTimeout(end); };
  }, [event, finisher]);
  if (finisher && match.phase !== 'matchResult') return null;
  const ids = [youId, ...match.seats.filter((id): id is string => Boolean(id && id !== youId))].slice(0, 2);
  if (ids.length < 2) return null;
  const gear = gearById(winner ? standings[winner]?.loadout?.weapon : undefined);
  const loser = ids.find((id) => id !== winner);
  const winningLeft = winner === youId;
  return <section
    className={`duel-actors duel-actors--${placement} duel-actors--${winningLeft ? 'left' : 'right'} ${active ? 'is-striking' : ''} ${finisher && winner ? 'duel-actors--finish' : ''} strike--${gear.strike}`}
    style={{ '--strike-color': gear.color } as CSSProperties}
    aria-label={tr('Hero arena')}>
    <div className="duel-actors__stage">
      {ids.map((id) => {
        const wins = id === winner;
        const loses = Boolean(winner && !wins);
        return <div key={id} className={`duel-actors__hero ${wins ? 'is-attacker' : loses ? 'is-hit' : ''}`}>
          <div className="duel-actors__figure">
            <Hero key={`${event}:${id}:${active}`} loadout={standings[id]?.loadout}
              pose={active ? wins ? 'attack' : loses ? 'hit' : 'idle' : loses ? 'defeated' : wins && finisher ? 'celebrate' : 'idle'}
              size={finisher ? 185 : 118} />
          </div>
          {wins && active && <b className="point-pop">{finisher ? tr('K.O.') : '+1'}</b>}
          <span className="duel-actors__name">{match.players[id]?.name ?? tr('Player')}{finisher && wins && <b>{tr('Winner')}</b>}</span>
        </div>;
      })}
      <span className="duel-actors__vs" aria-hidden="true">VS</span>
      {active && <div className="duel-strike" key={event} aria-hidden="true">
        <svg viewBox="0 0 120 60">
          {gear.strike === 'orbit' ? <><circle cx="67" cy="30" r="20" fill="currentColor" /><ellipse cx="67" cy="30" rx="43" ry="12" transform="rotate(-25 67 30)" fill="none" stroke="#f4e5ff" strokeWidth="4" /></>
          : gear.strike === 'lightning' ? <path d="m4 40 37-22 5 13 43-27-12 23 40-5-44 33 8-22-40 17-4-11Z" fill="currentColor" />
          : gear.strike === 'crescent' ? <path d="M29 4c69 9 72 44 0 52 29-19 30-35 0-52Z" fill="currentColor" />
          : gear.strike === 'pulse' ? <><circle cx="68" cy="30" r="24" fill="none" stroke="currentColor" strokeWidth="8" /><circle cx="68" cy="30" r="13" fill="#fff1cd" /></>
          : <><path d="M4 48Q63 31 113 6L89 37 109 39Q48 60 4 48Z" fill="currentColor" /><path d="m36 41 60-20" stroke="#fff6df" strokeWidth="3" /></>}
        </svg>
      </div>}
      {active && <span className="duel-contact" aria-hidden="true" key={`impact:${event}`} />}
    </div>
    {finisher && winner && <p className="duel-actors__caption" role="status">
      {winner === youId ? `${match.players[loser ?? '']?.name ?? tr('Your opponent')} ${tr('is down')}` : `${match.players[winner]?.name ?? tr('Your opponent')} ${tr('takes it')}`}
    </p>}
  </section>;
});
