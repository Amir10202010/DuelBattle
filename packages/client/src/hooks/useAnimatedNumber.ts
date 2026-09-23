import { useEffect, useRef, useState } from 'react';

/** Animate from the currently displayed value, including interrupted rewards. */
export function useAnimatedNumber(value: number, duration = 600): number {
  const [shown, setShown] = useState(value);
  const visible = useRef(value);
  useEffect(() => {
    const from = visible.current;
    if (from === value) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (motion?.matches || typeof requestAnimationFrame === 'undefined') {
      visible.current = value; setShown(value); return;
    }
    let frame = 0;
    const start = performance.now();
    const finish = () => { cancelAnimationFrame(frame); visible.current = value; setShown(value); };
    const step = (now: number) => {
      const fraction = Math.min(1, Math.max(0, (now - start) / duration));
      visible.current = Math.round(from + (value - from) * (1 - (1 - fraction) ** 3));
      setShown(visible.current);
      if (fraction < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    motion?.addEventListener?.('change', finish);
    return () => { cancelAnimationFrame(frame); motion?.removeEventListener?.('change', finish); };
  }, [value, duration]);
  return shown;
}
