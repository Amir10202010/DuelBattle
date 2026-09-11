import { useEffect } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

function wakeLock(): WakeLockLike | null {
  const nav = navigator as Navigator & { wakeLock?: WakeLockLike };
  return nav.wakeLock ?? null;
}

/**
 * Keeps the screen on while a match is running.
 *
 * A round can be twenty seconds of holding something up to the camera without
 * touching the screen, which is exactly how long a phone waits before locking
 * itself. Losing the display mid-round loses the round.
 *
 * The lock is dropped by the browser whenever the tab is hidden, so it is taken
 * again on the way back rather than assumed to still be held.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    const api = wakeLock();
    if (!active || !api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      if (sentinel && !sentinel.released) return;
      try {
        sentinel = await api.request('screen');
      } catch {
        // Refused on low battery, or unsupported after all. The game still works.
      }
    };

    const onVisible = () => void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);
}
