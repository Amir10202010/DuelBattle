// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from './render.jsx';
import { describeLookup, useRoomLookup } from '../src/hooks/useRoomLookup.js';

function respond(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Lets the debounce fire and the response settle. */
async function settle(hook: {
  runAsync(fn: () => Promise<unknown>): Promise<void>;
  flush(): Promise<void>;
}) {
  await hook.runAsync(() => vi.advanceTimersByTimeAsync(400));
  await hook.flush();
}

describe('useRoomLookup', () => {
  it('asks nothing about a code that could not exist', async () => {
    const hook = renderHook(() => useRoomLookup('ABC'));
    await settle(hook);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(hook.current.state).toBe('idle');
    hook.unmount();
  });

  it('reports a room with a seat free', async () => {
    fetchMock.mockResolvedValue(respond({ exists: true, hasFreeSeat: true, players: 1 }));
    const hook = renderHook(() => useRoomLookup('AB12C'));
    await settle(hook);

    expect(fetchMock).toHaveBeenCalledWith('/api/rooms/AB12C', expect.anything());
    expect(hook.current).toEqual({ state: 'open', players: 1 });
    hook.unmount();
  });

  it('reports a full room', async () => {
    fetchMock.mockResolvedValue(respond({ exists: true, hasFreeSeat: false, players: 2 }));
    const hook = renderHook(() => useRoomLookup('AB12C'));
    await settle(hook);
    expect(hook.current.state).toBe('full');
    hook.unmount();
  });

  it('reports a room that is not there', async () => {
    fetchMock.mockResolvedValue(respond({ exists: false }, 404));
    const hook = renderHook(() => useRoomLookup('AB12C'));
    await settle(hook);
    expect(hook.current.state).toBe('missing');
    hook.unmount();
  });

  /**
   * The join attempt is the authority. A flaky network must not talk someone
   * out of a room that is really there.
   */
  it('says nothing rather than "missing" when the check itself fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const hook = renderHook(() => useRoomLookup('AB12C'));
    await settle(hook);
    expect(hook.current.state).toBe('unknown');
    expect(describeLookup(hook.current)).toBeNull();
    hook.unmount();
  });

  it('treats a rate-limited check the same way', async () => {
    fetchMock.mockResolvedValue(respond({ error: 'rate-limited' }, 429));
    const hook = renderHook(() => useRoomLookup('AB12C'));
    await settle(hook);
    expect(hook.current.state).toBe('unknown');
    hook.unmount();
  });

  it('makes one request for a code, not one per keystroke', async () => {
    fetchMock.mockResolvedValue(respond({ exists: true, hasFreeSeat: true, players: 1 }));
    const hook = renderHook(() => useRoomLookup('AB12C'));
    await hook.runAsync(() => vi.advanceTimersByTimeAsync(100));
    await hook.runAsync(() => vi.advanceTimersByTimeAsync(100));
    await settle(hook);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    hook.unmount();
  });
});

describe('describeLookup', () => {
  it('mentions a waiting opponent, because that is the reason to hurry', () => {
    expect(describeLookup({ state: 'open', players: 1 })).toMatch(/someone is waiting/i);
    expect(describeLookup({ state: 'open', players: 0 })).toBe('Room found.');
  });

  it('stays quiet while it does not know', () => {
    expect(describeLookup({ state: 'idle' })).toBeNull();
    expect(describeLookup({ state: 'checking' })).toBeNull();
    expect(describeLookup({ state: 'unknown' })).toBeNull();
  });
});
