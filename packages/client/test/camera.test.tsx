// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from './render.jsx';
import { useCamera } from '../src/media/useCamera.js';

class FakeTrack {
  stopped = false;
  private readonly listeners = new Map<string, (() => void)[]>();

  constructor(readonly deviceId: string) {}

  getSettings() {
    return { deviceId: this.deviceId };
  }
  stop() {
    this.stopped = true;
  }
  addEventListener(name: string, fn: () => void) {
    const list = this.listeners.get(name) ?? [];
    list.push(fn);
    this.listeners.set(name, list);
  }
  /** Simulates the camera going away: unplugged, or taken by another app. */
  end() {
    for (const fn of this.listeners.get('ended') ?? []) fn();
  }
}

class FakeStream {
  readonly tracks: FakeTrack[];
  constructor(deviceId: string) {
    this.tracks = [new FakeTrack(deviceId)];
  }
  getTracks() {
    return this.tracks;
  }
  getVideoTracks() {
    return this.tracks;
  }
}

function mediaError(name: string): Error {
  const err = new Error(name);
  err.name = name;
  return err;
}

let streams: FakeStream[] = [];
let getUserMedia: ReturnType<typeof vi.fn>;
let devices: MediaDeviceInfo[];

function installMediaDevices() {
  streams = [];
  devices = [
    { kind: 'videoinput', deviceId: 'front', label: 'FaceTime HD', groupId: 'g' } as MediaDeviceInfo,
    { kind: 'videoinput', deviceId: 'back', label: 'USB Cam', groupId: 'g' } as MediaDeviceInfo,
    { kind: 'audioinput', deviceId: 'mic', label: 'Mic', groupId: 'g' } as MediaDeviceInfo,
  ];
  getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    const video = constraints.video as { deviceId?: { exact: string } } | undefined;
    const stream = new FakeStream(video?.deviceId?.exact ?? 'front');
    streams.push(stream);
    return stream as unknown as MediaStream;
  });

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn(async () => devices),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

beforeEach(() => {
  installMediaDevices();
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('opening the camera', () => {
  it('asks for nothing until told to', async () => {
    const hook = renderHook(() => useCamera());
    expect(hook.current.status).toBe('idle');
    expect(getUserMedia).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('becomes ready and remembers which device it got', async () => {
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    expect(hook.current.status).toBe('ready');
    expect(hook.current.message).toBeNull();
    expect(hook.current.deviceId).toBe('front');
    hook.unmount();
  });

  it('lists the cameras it can see, ignoring microphones', async () => {
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());
    await hook.flush();

    expect(hook.current.devices.map((d) => d.deviceId)).toEqual(['front', 'back']);
    hook.unmount();
  });
});

describe('the ways a camera actually fails', () => {
  const cases: [string, string, RegExp][] = [
    ['NotAllowedError', 'denied', /blocking the camera/i],
    ['SecurityError', 'denied', /blocking the camera/i],
    ['NotFoundError', 'not-found', /No camera found/i],
    ['OverconstrainedError', 'not-found', /No camera found/i],
    ['NotReadableError', 'in-use', /Another app/i],
    ['AbortError', 'in-use', /Another app/i],
    ['WeirdUnknownError', 'error', /could not be started/i],
  ];

  for (const [name, status, message] of cases) {
    it(`reports ${name} as "${status}" with something a player can act on`, async () => {
      getUserMedia.mockRejectedValueOnce(mediaError(name));
      const hook = renderHook(() => useCamera());
      await hook.run(() => hook.current.request());

      expect(hook.current.status).toBe(status);
      expect(hook.current.message).toMatch(message);
      hook.unmount();
    });
  }

  it('says so when the page is not on a secure origin', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    expect(hook.current.status).toBe('insecure');
    expect(hook.current.message).toMatch(/HTTPS/);
    // It should not even have asked.
    expect(getUserMedia).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('says so when the browser has no camera API at all', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    expect(hook.current.status).toBe('error');
    expect(hook.current.message).toMatch(/does not support/i);
    hook.unmount();
  });

  it('notices a camera that disappears mid-match', async () => {
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());
    expect(hook.current.status).toBe('ready');

    await hook.run(() => streams[0]!.tracks[0]!.end());

    expect(hook.current.status).toBe('in-use');
    expect(hook.current.message).toMatch(/stopped/i);
    hook.unmount();
  });
});

describe('not leaking the camera', () => {
  it('stops every track when told to stop', async () => {
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    await hook.run(() => hook.current.stop());

    expect(streams[0]!.tracks[0]!.stopped).toBe(true);
    expect(hook.current.status).toBe('idle');
    hook.unmount();
  });

  it('releases the camera on unmount', async () => {
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    hook.unmount();
    expect(streams[0]!.tracks[0]!.stopped).toBe(true);
  });

  it('drops the old stream when switching device', async () => {
    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    await hook.run(() => hook.current.selectDevice('back'));

    expect(streams).toHaveLength(2);
    expect(streams[0]!.tracks[0]!.stopped).toBe(true);
    expect(streams[1]!.tracks[0]!.stopped).toBe(false);
    expect(hook.current.deviceId).toBe('back');
    hook.unmount();
  });

  /**
   * Two requests in flight and the slower one lands last. Without a guard its
   * stream becomes the live one while the newer stream is silently abandoned —
   * a camera left running with nothing showing it.
   */
  it('throws away a stream that arrives after a newer request', async () => {
    let releaseFirst: ((s: MediaStream) => void) | null = null;
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          releaseFirst = (s) => resolve(s);
        }),
    );

    const hook = renderHook(() => useCamera());
    await hook.run(() => hook.current.request());

    await hook.run(() => hook.current.selectDevice('back'));

    // The first request finally resolves, too late.
    const stale = new FakeStream('front');
    streams.push(stale);
    await hook.run(() => releaseFirst!(stale as unknown as MediaStream));

    expect(stale.tracks[0]!.stopped).toBe(true);
    expect(hook.current.deviceId).toBe('back');
    hook.unmount();
  });
});
