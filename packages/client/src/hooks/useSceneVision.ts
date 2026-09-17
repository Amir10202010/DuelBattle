import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isVideoReady } from '../media/capture.js';
import type { Scene, VisionRequest, VisionResponse } from '../vision/types.js';

type Status = 'off' | 'loading' | 'ready' | 'unavailable';
const KEY = 'battle.vision.v1';

/** Longest side handed to the models. The pose net sees 256px; more is waste. */
const ANALYSIS_LONG_EDGE = 288;
/** The object detector is the expensive one and its subject barely moves. */
const OBJECT_EVERY = 4;
/** No answer for this long and the tracker is considered gone. */
const STALL_MS = 6_000;
const LOAD_MS = 45_000;
/**
 * The first analysed frame gets its own, much longer budget.
 *
 * "Models loaded" is not "models running". The first call through each graph
 * compiles shaders and allocates buffers, and on an ordinary laptop that first
 * frame can take the better part of ten seconds while every frame after it
 * takes tens of milliseconds. Timing it against the steady-state budget
 * declared the tracker dead every single time it started, which is exactly
 * what a player saw as "tracking unavailable" on a machine where tracking
 * worked perfectly.
 */
const WARMUP_MS = 30_000;
/** How often the loop checks back when there is nothing to analyse. */
const IDLE_POLL_MS = 250;

export interface SceneTracking {
  /**
   * The newest analysed frame, outside React's render cycle.
   *
   * The overlay reads this every animation frame. Putting a scene through
   * `useState` twenty times a second would re-render the arena — prompt, timer,
   * both stages — twenty times a second to move a few dots, which is precisely
   * the kind of thing that turns a smooth game into a slideshow.
   */
  readonly scene: React.RefObject<Scene | null>;
  /** Natural size of the camera frame the coordinates are normalised against. */
  readonly source: React.RefObject<{ width: number; height: number }>;
  status: Status;
  backend: 'gpu' | 'cpu' | null;
  /** Measured analysis rate, refreshed about once a second. */
  fps: number;
  enabled: boolean;
  toggle(): void;
  retry(): void;
}

/**
 * Runs body, hand and object tracking on your own camera.
 *
 * Your camera only, deliberately. The opponent's stage used to be analysed too,
 * from the relayed JPEG stream — which halved the rate on your own picture,
 * doubled the CPU cost, and drew a skeleton over a video that was already
 * several frames behind, so it never lined up with the person it belonged to.
 * Nothing about tracking is sent anywhere; it is a viewfinder for you.
 */
export function useSceneVision(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  cameraReady: boolean,
  active: boolean,
): SceneTracking {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
  });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('off');
  const [backend, setBackend] = useState<'gpu' | 'cpu' | null>(null);
  const [fps, setFps] = useState(0);
  const scene = useRef<Scene | null>(null);
  const source = useRef({ width: 0, height: 0 });
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    scene.current = null;
    if (!enabled || !cameraReady) { setStatus('off'); setBackend(null); setFps(0); return; }
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      setStatus('unavailable'); return;
    }
    setStatus('loading');

    let worker: Worker;
    try { worker = new Worker('/vision-runtime/tracker.js'); }
    catch { setStatus('unavailable'); return; }

    let stopped = false;
    let ready = false;
    let busy = false;
    let frames = 0;
    /** Total since this tracker started, which is how the warm-up is spotted. */
    let analysed = 0;
    let counted = performance.now();
    let sampled = 0;
    let watchdog = window.setTimeout(fail, LOAD_MS);
    let pending: number | null = null;
    let videoCallback: number | null = null;
    // Only built when createImageBitmap cannot resize a video for us.
    let canvas: HTMLCanvasElement | null = null;

    function fail() {
      if (stopped) return;
      stopped = true;
      worker.terminate();
      scene.current = null;
      setStatus('unavailable');
      setFps(0);
      window.clearTimeout(watchdog);
    }

    const post = (message: VisionRequest, transfer: Transferable[] = []) =>
      worker.postMessage(message, transfer);

    worker.onmessage = (event: MessageEvent<VisionResponse>) => {
      if (stopped) return;
      const response = event.data;
      if (response.type === 'error') { fail(); return; }
      if (response.type === 'ready') {
        window.clearTimeout(watchdog);
        ready = true;
        setStatus('ready');
        setBackend(response.backend);
        schedule();
        return;
      }
      window.clearTimeout(watchdog);
      busy = false;
      scene.current = response.scene;
      frames++;
      analysed++;
      const now = performance.now();
      const span = now - counted;
      if (span >= 1_000) {
        // A long gap means the tab was away, not that the tracker crawled.
        // Reporting one frame over thirty seconds as "0 fps" would be a lie
        // about a tracker that is about to run perfectly well.
        if (span <= 3_000) setFps(Math.round((frames * 1_000) / span));
        frames = 0;
        counted = now;
      }
      // The next frame goes out as soon as this one lands, so the rate is
      // whatever the machine can actually sustain rather than a guess baked
      // into a timer.
      schedule();
    };
    worker.onerror = fail;
    post({ type: 'init', base: new URL('/vision-runtime/', window.location.href).href });

    async function sample() {
      if (stopped || !ready || busy) return;
      const video = videoRef.current;
      if (document.hidden || !activeRef.current || !isVideoReady(video)) {
        // Nothing to analyse right now, but the loop has to stay alive or it
        // never comes back when the round or the tab does.
        schedule();
        return;
      }
      const { videoWidth: width, videoHeight: height } = video;
      source.current = { width, height };
      const scale = Math.min(1, ANALYSIS_LONG_EDGE / Math.max(width, height));
      const target = { width: Math.round(width * scale), height: Math.round(height * scale) };
      busy = true;
      try {
        // The whole frame, never a crop: the overlay is what decides which part
        // of it is on screen, and it can only do that if the coordinates it is
        // given describe the picture the camera actually produced.
        const bitmap = await createImageBitmap(video, {
          resizeWidth: target.width,
          resizeHeight: target.height,
          resizeQuality: 'low',
        }).catch(() => drawFallback(video, target));
        if (!bitmap) { busy = false; if (!stopped) schedule(); return; }
        if (stopped) { bitmap.close(); return; }
        watchdog = window.setTimeout(fail, analysed === 0 ? WARMUP_MS : STALL_MS);
        post({
          type: 'frame', bitmap, at: performance.now(),
          objects: sampled++ % OBJECT_EVERY === 0,
        }, [bitmap]);
      } catch {
        // A frame that could not be grabbed is not a tracker that has died.
        busy = false;
        schedule();
      }
    }

    function drawFallback(video: HTMLVideoElement, target: { width: number; height: number }) {
      canvas ??= document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return null;
      context.drawImage(video, 0, 0, target.width, target.height);
      return createImageBitmap(canvas);
    }

    /**
     * Wait for the camera's next frame, not the clock's — but never only for it.
     *
     * `requestVideoFrameCallback` fires once per frame the camera actually
     * delivers, so the tracker never analyses the same picture twice and never
     * sits idle holding a fresh one. It is also allowed to never fire at all: a
     * page in a background tab presents no video frames, and a callback
     * registered just before somebody switched away is a callback that never
     * arrives. On its own that is a loop which dies silently and comes back
     * only on a reload. The timer is the floor under it.
     */
    function schedule() {
      if (stopped) return;
      const video = videoRef.current;
      if (pending !== null) window.clearTimeout(pending);
      if (videoCallback !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoCallback);
        videoCallback = null;
      }
      let fired = false;
      const run = () => {
        if (fired || stopped) return;
        fired = true;
        void sample();
      };
      if (video && 'requestVideoFrameCallback' in video) {
        videoCallback = video.requestVideoFrameCallback(run);
      }
      pending = window.setTimeout(run, IDLE_POLL_MS);
    }

    return () => {
      stopped = true;
      worker.terminate();
      window.clearTimeout(watchdog);
      if (pending !== null) window.clearTimeout(pending);
      const video = videoRef.current;
      if (videoCallback !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoCallback);
      }
      scene.current = null;
    };
  }, [enabled, cameraReady, videoRef, attempt]);

  // A paused tracker should not leave a stale skeleton hanging over the camera.
  useEffect(() => {
    if (!active) scene.current = null;
  }, [active]);

  const toggle = useCallback(() => {
    setEnabled((old) => {
      try { localStorage.setItem(KEY, old ? 'off' : 'on'); } catch { /* Optional preference. */ }
      return !old;
    });
  }, []);
  const retry = useCallback(() => setAttempt((old) => old + 1), []);

  // The arena re-renders on every animation frame to move its clocks. A fresh
  // object here would be a fresh prop there, and anything downstream that keys
  // an effect on it would tear itself down sixty times a second — which is
  // exactly what stopped the overlay's draw loop from ever running a frame.
  return useMemo(
    () => ({ scene, source, status, backend, fps, enabled, toggle, retry }),
    [scene, source, status, backend, fps, enabled, toggle, retry],
  );
}
