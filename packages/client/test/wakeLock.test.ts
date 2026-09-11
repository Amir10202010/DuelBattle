// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from './render.jsx';
import { useWakeLock } from '../src/hooks/useWakeLock.js';

class FakeSentinel {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
  });
  addEventListener() {}
}

let request: ReturnType<typeof vi.fn>;
let sentinels: FakeSentinel[];

function visibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  sentinels = [];
  request = vi.fn(async () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('takes a screen lock while a match is on', async () => {
    const hook = renderHook(() => useWakeLock(true));
    await hook.flush();
    expect(request).toHaveBeenCalledWith('screen');
    hook.unmount();
  });

  it('asks for nothing when there is no match', async () => {
    const hook = renderHook(() => useWakeLock(false));
    await hook.flush();
    expect(request).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('lets the lock go when the match ends', async () => {
    const hook = renderHook(() => useWakeLock(true));
    await hook.flush();
    hook.unmount();
    await Promise.resolve();
    expect(sentinels[0]!.release).toHaveBeenCalled();
  });

  /** The browser drops the lock on hide; it has to be taken again, not assumed. */
  it('takes the lock again after the tab comes back', async () => {
    const hook = renderHook(() => useWakeLock(true));
    await hook.flush();
    expect(request).toHaveBeenCalledTimes(1);

    sentinels[0]!.released = true;
    await hook.run(() => visibility('hidden'));
    await hook.run(() => visibility('visible'));

    expect(request).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('does not ask while the tab is hidden', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    const hook = renderHook(() => useWakeLock(true));
    await hook.flush();
    expect(request).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('carries on when the browser refuses', async () => {
    request.mockRejectedValue(new Error('battery too low'));
    const hook = renderHook(() => useWakeLock(true));
    await expect(hook.flush()).resolves.toBeUndefined();
    hook.unmount();
  });

  it('carries on when the browser has no wake lock at all', async () => {
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    const hook = renderHook(() => useWakeLock(true));
    await expect(hook.flush()).resolves.toBeUndefined();
    hook.unmount();
  });
});
