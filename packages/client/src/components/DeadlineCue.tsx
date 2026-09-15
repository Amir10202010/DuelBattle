import { useEffect, useRef } from 'react';
import { tr } from '../i18n/index.js';
import { sound } from '../media/sound.js';

export function urgentSecond(endsAt: number | null, now: number, active: boolean): number | null {
  if (!active || endsAt === null) return null;
  const seconds = Math.ceil((endsAt - now) / 1000);
  return seconds >= 1 && seconds <= 5 ? seconds : null;
}

export function DeadlineCue({ endsAt, now, active }: { endsAt: number | null; now: number; active: boolean }) {
  const second = urgentSecond(endsAt, now, active);
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (second !== null && second !== previous.current) sound.play(second <= 2 ? 'hurryFinal' : 'hurry');
    previous.current = second;
  }, [second]);
  if (second === null) return null;
  return <>
    <div className="deadline-edge" aria-hidden="true" />
    <div className="deadline-cue" role="timer" aria-label={`${second} ${tr('sec')}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="deadline-cue__track" cx="50" cy="50" r="44" />
        <circle className="deadline-cue__arc" cx="50" cy="50" r="44" pathLength="100"
          strokeDasharray={`${second * 20} 100`} />
      </svg>
      <b key={second} aria-hidden="true">{second}</b>
      <span>{tr('Snap now!')}</span>
    </div>
  </>;
}
