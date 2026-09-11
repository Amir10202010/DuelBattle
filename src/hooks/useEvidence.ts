import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Challenge } from '../../shared/challenges';
import type { Frame } from '../../shared/vision/frame';
import { detectColorObject } from '../../shared/vision/detect';
import { createAnalysisCapture, createEvidenceCapture, EVIDENCE_QUALITY } from '../media/capture';
import { request, type GameSocket } from '../lib/client';

/** One capture pipeline: fixed framing, a pre-reveal baseline and bounded recent evidence. */
export function useEvidence(
  video: RefObject<HTMLVideoElement | null>,
  options: {
    socket: GameSocket | null;
    code: string;
    roundId?: string;
    phase?: string;
    camera: boolean;
    challenge?: Challenge | null;
  },
) {
  const { socket, code, roundId, phase, camera, challenge } = options;
  const capture = useRef<ReturnType<typeof createEvidenceCapture> | null>(null);
  const analysis = useRef<ReturnType<typeof createAnalysisCapture> | null>(null);
  const baseline = useRef<Frame | null>(null);
  const recent = useRef<{ image: string; at: number }[]>([]);
  const [detected, setDetected] = useState(false);
  const target = challenge?.color;
  useEffect(() => {
    baseline.current = null;
    recent.current = [];
    setDetected(false);
  }, [roundId, camera]);
  useEffect(() => {
    if (
      !camera ||
      !roundId ||
      !socket?.connected ||
      !['COUNTDOWN', 'CHALLENGE_ACTIVE'].includes(phase ?? '')
    )
      return;
    capture.current ??= createEvidenceCapture();
    analysis.current ??= createAnalysisCapture();
    let disposed = false;
    let sentBaseline = false;
    let stable = 0;
    const sample = () => {
      if (document.hidden) {
        recent.current = [];
        stable = 0;
        setDetected(false);
        return;
      }
      try {
        const frame = analysis.current!.toFrame(video.current);
        const image = capture.current!.toDataUrl(video.current, EVIDENCE_QUALITY);
        if (!frame || !image) return;
        if (phase === 'COUNTDOWN') {
          if (!sentBaseline) {
            baseline.current = frame;
            sentBaseline = true;
            void request(socket, 'baseline', { roomCode: code, roundId, image }).catch(() => {
              // A late/missing baseline disables assistance; peer review still works.
              if (!disposed) baseline.current = null;
            });
          }
          return;
        }
        recent.current = [...recent.current, { image, at: performance.now() }].slice(-3);
        if (target && baseline.current) {
          stable = detectColorObject(baseline.current, frame, { target }).matched ? stable + 1 : 0;
          setDetected(stable >= 3);
        }
      } catch {
        recent.current = [];
        stable = 0;
        setDetected(false);
      }
    };
    sample();
    const timer = setInterval(sample, 250);
    return () => {
      disposed = true;
      clearInterval(timer);
      recent.current = [];
    };
  }, [video, socket, code, roundId, phase, camera, target]);
  const snapshot = useCallback(() => {
    capture.current ??= createEvidenceCapture();
    const image = capture.current.toDataUrl(video.current, EVIDENCE_QUALITY);
    if (!image) throw new Error('Wait for your camera to load, then try again.');
    const at = performance.now();
    const contextImages = recent.current
      .filter((f) => at - f.at >= 150 && at - f.at < 1200)
      .slice(-2)
      .map((f) => f.image);
    return { image, contextImages };
  }, [video]);
  return { detected, snapshot };
}
