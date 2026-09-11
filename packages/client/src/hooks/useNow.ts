import { useEffect, useState } from 'react';

/**
 * A clock that ticks on animation frames while something is counting down, and
 * not at all when nothing is. Timers are the one place a game may repaint every
 * frame; everything else in this app renders on state changes only.
 */
export function useAnimationClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const loop = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return now;
}

/** A coarse clock for anything that only needs to be right to the second. */
export function useSecondsClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
}
