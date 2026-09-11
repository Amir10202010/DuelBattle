// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useMedia } from '../src/hooks/useMedia';

type Api = ReturnType<typeof useMedia>;

class FakeTrack {
  readyState: 'live' | 'ended' = 'live';
  enabled = true;
  muted = false;
  stopped = false;
  onended: (() => void) | null = null;
  onmute: (() => void) | null = null;
  onunmute: (() => void) | null = null;
  constructor(
    readonly kind: 'video' | 'audio',
    readonly deviceId = 'cam-1',
  ) {}
  stop() {
    this.stopped = true;
    this.readyState = 'ended';
  }
  getSettings() {
    return { deviceId: this.deviceId };
  }
}

class FakeStream {
  private tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = [...tracks];
  }
  getTracks() {
    return [...this.tracks];
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video');
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio');
  }
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }
  removeTrack(track: FakeTrack) {
    this.tracks = this.tracks.filter((t) => t !== track);
  }
}

interface Pending {
  resolve: (stream: FakeStream) => void;
  reject: (error: unknown) => void;
  audio: boolean;
  deviceId?: string;
}

let pending: Pending[] = [];
let root: Root;
let container: HTMLDivElement;
let api: Api;

function Probe() {
  api = useMedia();
  return null as unknown as ReactNode;
}

function render() {
  act(() => {
    root.render(createElement(Probe));
  });
}

beforeEach(() => {
  pending = [];
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as Record<string, unknown>).MediaStream = FakeStream;
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  (window as unknown as Record<string, unknown>).RTCPeerConnection = class {};
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: (constraints: { audio?: unknown; video?: { deviceId?: { exact: string } } }) =>
        new Promise<FakeStream>((resolve, reject) =>
          pending.push({
            resolve,
            reject,
            audio: !!constraints.audio,
            deviceId: constraints.video?.deviceId?.exact,
          }),
        ),
      enumerateDevices: async () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  render();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Settle the promise chain inside the hook without asserting on timers. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('camera lifecycle', () => {
  it('publishes a live camera and reports the device it got', async () => {
    const track = new FakeTrack('video');
    act(() => void api.start());
    pending[0].resolve(new FakeStream([track]));
    await settle();
    expect(api.status).toBe('ready');
    expect(api.camera).toBe(true);
    expect(api.deviceId).toBe('cam-1');
    expect(track.stopped).toBe(false);
  });

  it('stops a camera that arrives after the player already stopped it', async () => {
    const track = new FakeTrack('video');
    act(() => void api.start());
    act(() => api.stop());
    pending[0].resolve(new FakeStream([track]));
    await settle();
    expect(track.stopped).toBe(true);
    expect(api.stream).toBeNull();
    expect(api.camera).toBe(false);
    expect(api.status).toBe('idle');
  });

  it('stops a camera that arrives after the component unmounted', async () => {
    const track = new FakeTrack('video');
    act(() => void api.start());
    act(() => root.unmount());
    pending[0].resolve(new FakeStream([track]));
    await settle();
    expect(track.stopped).toBe(true);
    // Re-create for the shared afterEach teardown.
    root = createRoot(container);
    render();
  });

  it('releases every track when the component unmounts', async () => {
    const video = new FakeTrack('video');
    act(() => void api.start());
    pending[0].resolve(new FakeStream([video]));
    await settle();
    act(() => root.unmount());
    expect(video.stopped).toBe(true);
    root = createRoot(container);
    render();
  });

  it('keeps the microphone when the player switches camera', async () => {
    const first = new FakeTrack('video', 'cam-1');
    act(() => void api.start());
    pending[0].resolve(new FakeStream([first]));
    await settle();

    const mic = new FakeTrack('audio');
    act(() => void api.toggleMic());
    pending[1].resolve(new FakeStream([mic]));
    await settle();
    expect(api.microphone).toBe(true);

    const second = new FakeTrack('video', 'cam-2');
    act(() => void api.selectDevice('cam-2'));
    expect(first.stopped).toBe(true);
    expect(pending[2].deviceId).toBe('cam-2');
    pending[2].resolve(new FakeStream([second]));
    await settle();

    expect(api.deviceId).toBe('cam-2');
    expect(mic.stopped).toBe(false);
    expect(api.stream?.getAudioTracks()).toHaveLength(1);
    expect(api.microphone).toBe(true);
  });

  it('explains a refused camera without leaving a half-open state', async () => {
    act(() => void api.start());
    pending[0].reject(new DOMException('denied', 'NotAllowedError'));
    await settle();
    expect(api.status).toBe('error');
    expect(api.error).toContain('Camera access is required');
    expect(api.stream).toBeNull();
  });

  it('refuses to open a camera outside a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    await act(async () => {
      await api.start();
    });
    expect(pending).toHaveLength(0);
    expect(api.status).toBe('error');
    expect(api.error).toContain('secure connection');
  });
});
