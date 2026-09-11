import { useEffect, useState } from 'react';
import { isValidRoomCode } from '@battle/shared';

export type RoomLookup =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'open'; players: number }
  | { state: 'full' }
  | { state: 'missing' }
  | { state: 'unknown' };

/** Long enough that typing a five-character code makes one request, not five. */
const DEBOUNCE_MS = 350;

interface RoomInfo {
  exists: boolean;
  hasFreeSeat?: boolean;
  players?: number;
}

/**
 * Checks a room code before the player commits to it.
 *
 * Being told "no room with that code" while still looking at the field is far
 * better than being told after handing over a camera. A failed check reports
 * `unknown` rather than `missing`: the join attempt is the authority, and a
 * flaky network should not talk someone out of a room that is really there.
 */
export function useRoomLookup(code: string): RoomLookup {
  const [lookup, setLookup] = useState<RoomLookup>({ state: 'idle' });

  useEffect(() => {
    if (!isValidRoomCode(code)) {
      setLookup({ state: 'idle' });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setLookup({ state: 'checking' });

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/rooms/${code}`, { signal: controller.signal });
        if (cancelled) return;
        if (res.status === 404) {
          setLookup({ state: 'missing' });
          return;
        }
        if (!res.ok) {
          setLookup({ state: 'unknown' });
          return;
        }
        const info = (await res.json()) as RoomInfo;
        if (cancelled) return;
        setLookup(
          info.hasFreeSeat ? { state: 'open', players: info.players ?? 0 } : { state: 'full' },
        );
      } catch {
        if (!cancelled) setLookup({ state: 'unknown' });
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [code]);

  return lookup;
}

export function describeLookup(lookup: RoomLookup): string | null {
  switch (lookup.state) {
    case 'open':
      return lookup.players === 1 ? 'Room found — someone is waiting.' : 'Room found.';
    case 'full':
      return 'That room already has two players.';
    case 'missing':
      return 'No room with that code. Check the letters?';
    default:
      return null;
  }
}
