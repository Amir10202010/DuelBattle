import { useEffect, useState } from 'react';

/** Keeps the clock honest in a background tab, where rAF does not run. */
const FALLBACK_INTERVAL_MS = 250;
const DISPLAY_INTERVAL_MS = 100;

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
    let renderedAt = 0;
    const tick = () => setNow(Date.now());
    const loop = (time: number) => {
      // React only needs tenths of a second. CSS interpolates the timer bar;
      // video and vision have their own independent rendering clocks.
      if (time - renderedAt >= DISPLAY_INTERVAL_MS) {
        tick();
        renderedAt = time;
      }
      frame = requestAnimationFrame(loop);
    };

    tick();
    frame = requestAnimationFrame(loop);
    const interval = window.setInterval(() => { if (document.hidden) tick(); }, FALLBACK_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);

  return now;
}

/**
 * A coarse clock, for anything that counts in whole seconds.
 *
 * Separate from the animation clock on purpose: a queue timer that ticks sixty
 * times a second to move a digit once is sixty renders of the same number.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [intervalMs]);

  return now;
}
