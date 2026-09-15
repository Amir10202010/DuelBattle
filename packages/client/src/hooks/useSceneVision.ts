import { useEffect, useRef, useState } from 'react';
import type { MatchStore } from '../net/store.js';
import { coverCrop, isVideoReady } from '../media/capture.js';
import type { Scene, Side, VisionRequest, VisionResponse } from '../vision/types.js';

type Status = 'off' | 'loading' | 'ready' | 'unavailable';
const KEY = 'battle.vision.v1';

/** One worker and one in-flight bitmap for both streams. No preview leaves the device. */
export function useSceneVision(
  videoRef: React.RefObject<HTMLVideoElement | null>, store: MatchStore,
  peerId: string | null, cameraReady: boolean, active: boolean,
) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
  });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>('off');
  const [scenes, setScenes] = useState<Partial<Record<Side, Scene>>>({});
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    setScenes({});
    if (!enabled || !cameraReady) { setStatus('off'); return; }
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      setStatus('unavailable'); return;
    }
    setStatus('loading');
    let worker: Worker;
    try { worker = new Worker('/vision-runtime/tracker.js'); }
    catch { setStatus('unavailable'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const context = canvas.getContext('2d', { alpha: false });
    const peer = new Image();
    let peerAt = 0, ready = false, busy = false, stopped = false, lastAt = 0;
    let next: Side = 'self';
    let watchdog: number | undefined;
    const stale: Partial<Record<Side, number>> = {};
    const fail = () => {
      if (stopped) return;
      stopped = true; worker.terminate(); setStatus('unavailable'); setScenes({});
      window.clearTimeout(watchdog);
    };
    watchdog = window.setTimeout(fail, 45_000);
    const post = (message: VisionRequest, transfer: Transferable[] = []) => worker.postMessage(message, transfer);
    worker.onmessage = (event: MessageEvent<VisionResponse>) => {
      if (stopped) return;
      window.clearTimeout(watchdog);
      const response = event.data;
      if (response.type === 'error') { fail(); return; }
      if (response.type === 'ready') { ready = true; setStatus('ready'); return; }
      busy = false;
      lastAt = performance.now();
      window.clearTimeout(stale[response.side]);
      setScenes((old) => ({ ...old, [response.side]: response.scene }));
      stale[response.side] = window.setTimeout(() => {
        setScenes((old) => ({ ...old, [response.side]: undefined }));
      }, 1_200);
    };
    worker.onerror = fail;
    post({ type: 'init', base: new URL('/vision-runtime/', window.location.href).href });
    const unsubscribe = store.onPeerFrame((image, from) => {
      if (from !== peerId || stopped || !activeRef.current || document.hidden) return;
      peer.src = image; peerAt = performance.now();
    });
    const sample = async () => {
      if (stopped || !ready || busy || !context || document.hidden || !activeRef.current ||
        performance.now() - lastAt < 180) return;
      let side = next;
      const hasPeer = peer.complete && peer.naturalWidth > 0 && performance.now() - peerAt < 1_000;
      if (side === 'peer' && !hasPeer) side = 'self';
      const video = videoRef.current;
      if (side === 'self' && !isVideoReady(video)) return;
      busy = true;
      next = side === 'self' ? 'peer' : 'self';
      try {
        if (side === 'self' && video) {
          const crop = coverCrop(video.videoWidth, video.videoHeight, 320, 240);
          context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, 320, 240);
        } else context.drawImage(peer, 0, 0, 320, 240);
        const bitmap = await createImageBitmap(canvas);
        if (stopped) { bitmap.close(); return; }
        watchdog = window.setTimeout(fail, 8_000);
        post({ type: 'frame', side, bitmap }, [bitmap]);
      } catch { fail(); }
    };
    const interval = window.setInterval(() => { void sample(); }, 100);
    return () => {
      stopped = true; worker.terminate(); unsubscribe(); peer.src = '';
      window.clearInterval(interval); window.clearTimeout(watchdog);
      for (const timer of Object.values(stale)) window.clearTimeout(timer);
    };
  }, [enabled, cameraReady, videoRef, store, peerId, attempt]);

  return {
    scenes, status, enabled,
    toggle() {
      setEnabled((old) => {
        try { localStorage.setItem(KEY, old ? 'off' : 'on'); } catch { /* Optional preference. */ }
        return !old;
      });
    },
    retry() { setAttempt((old) => old + 1); },
  };
}
