import { useEffect, useState } from 'react';

/** Keeps the clock honest in a background tab, where rAF does not run. */
const FALLBACK_INTERVAL_MS = 250;

/**
 * A clock for anything counting down.
 *
 * Animation frames give a smooth bar while the tab is visible, but they stop
 * entirely when it is not — and a player who tabs away and comes back must not
 * find a frozen timer claiming they have a minute and a half left. The interval
 * and the visibility listener are what make the reading true rather than
 * merely smooth.
 */
export function useAnimationClock(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => setNow(Date.now());
    const loop = () => {
      tick();
      frame = requestAnimationFrame(loop);
    };

    tick();
    frame = requestAnimationFrame(loop);
    const interval = window.setInterval(tick, FALLBACK_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);

  return now;
}
