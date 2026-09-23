import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_IMAGE_BYTES, type PublicMatchState } from '@battle/shared';
import type { CameraState } from '../media/useCamera.js';
import { createEvidenceCapture, EVIDENCE_QUALITY } from '../media/capture.js';
import { sound } from '../media/sound.js';
import type { MatchStore } from '../net/store.js';

type Pending = 'snap' | 'pass' | null;

/** One outstanding intent per round; success is always acknowledged by the server. */
export function useRoundAction({ match, youId, camera, store, connected }: {
  match: PublicMatchState; youId: string; camera: CameraState;
  store: MatchStore; connected: boolean;
}) {
  const capture = useRef<ReturnType<typeof createEvidenceCapture> | null>(null);
  const inFlight = useRef(false);
  const [pending, setPending] = useState<Pending>(null);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const roundId = match.round?.id;
  const you = match.players[youId];
  const done = Boolean(you?.submitted || you?.passed);
  const expired = match.phaseEndsAt !== null && store.serverNow() >= match.phaseEndsAt;
  const active = match.phase === 'challenge' && !match.paused && connected && !done && !expired;

  useEffect(() => {
    inFlight.current = false;
    setPending(null); setImage(null); setError(null);
  }, [roundId]);

  useEffect(() => {
    if (done || match.phase !== 'challenge') {
      inFlight.current = false;
      setPending(null); setError(null);
    }
  }, [done, match.phase]);

  useEffect(() => {
    if (!pending || done) return;
    const timer = window.setTimeout(() => {
      inFlight.current = false;
      setPending(null); setImage(null);
      setError('No confirmation yet. Try again while there is time.');
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [pending, done]);

  const commit = useCallback((kind: Exclude<Pending, null>) => {
    if (!active || !roundId || inFlight.current) return;
    if (match.phaseEndsAt !== null && store.serverNow() >= match.phaseEndsAt) return;
    if (kind === 'snap' && camera.status !== 'ready') return;
    // A ref closes the gap between two taps and React's next render.
    inFlight.current = true;
    setError(null);
    try {
      if (kind === 'snap') {
        capture.current ??= createEvidenceCapture();
        const photo = capture.current.toBoundedDataUrl(camera.videoRef.current, EVIDENCE_QUALITY, .55, MAX_IMAGE_BYTES);
        if (!photo) throw new Error('No camera frame');
        setImage(photo);
        setPending(kind);
        sound.play('lockIn');
        store.submit(roundId, photo);
      } else {
        setPending(kind);
        store.pass(roundId);
      }
    } catch {
      inFlight.current = false;
      setPending(null); setImage(null);
      setError('Could not capture that frame. Keep the camera on and try again.');
    }
  }, [active, roundId, match.phaseEndsAt, store, camera.status, camera.videoRef]);

  const snap = useCallback(() => commit('snap'), [commit]);
  const pass = useCallback(() => commit('pass'), [commit]);
  useEffect(() => {
    if (!active || camera.status !== 'ready') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== ' ' && event.key !== 'Enter') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, button, a, summary, [contenteditable="true"], [role="button"], dialog')) return;
      if (document.querySelector('dialog[open], [aria-modal="true"]')) return;
      event.preventDefault();
      snap();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, camera.status, snap]);

  return { snap, pass, pending, image, error, expired, canSnap: active && camera.status === 'ready' && !pending, canPass: active && !pending };
}
