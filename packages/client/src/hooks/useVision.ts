import { useEffect, useRef, useState } from 'react';
import {
  runDetector,
  type Challenge,
  type DetectionResult,
  type Frame,
  type Phase,
} from '@battle/shared';
import { createAnalysisCapture } from '../media/capture.js';

/** How often the on-device preview runs. Fast enough to feel live, cheap enough to ignore. */
const SAMPLE_INTERVAL_MS = 180;

export interface LocalDetection {
  /** Null until the detector has something to say. */
  result: DetectionResult | null;
  /** True once a baseline has been taken for this round. */
  armed: boolean;
}

export interface UseLocalDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  challenge: Challenge | null;
  roundId: string | null;
  phase: Phase;
}

/**
 * Runs the round's detector on this device, purely so the player can see
 * whether the camera has found what they are holding.
 *
 * It is the identical function the server runs on the submitted frame, but it
 * is never the verdict: the score comes from the server's run, over the frame
 * that was actually sent. This is a viewfinder, not a judge.
 *
 * The baseline is taken during the countdown, while the prompt is still hidden
 * — the same rule the server uses. Sampling it after the reveal instead meant a
 * fast player could have the object half-way into frame before the "before"
 * picture was taken, and then watch the meter sit at zero while they held the
 * right thing up.
 */
export function useLocalDetection({
  videoRef,
  challenge,
  roundId,
  phase,
}: UseLocalDetectionOptions): LocalDetection {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [armed, setArmed] = useState(false);
  const baselineRef = useRef<Frame | null>(null);
  const captureRef = useRef(createAnalysisCapture());

  // Read inside the sampler so a phase change does not restart the round's
  // baseline, which is the one thing that has to survive the countdown.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    baselineRef.current = null;
    setResult(null);
    setArmed(false);

    const detector = challenge?.detector;
    if (!roundId || !detector) return;

    const capture = captureRef.current;
    let cancelled = false;

    const sample = () => {
      if (cancelled) return;
      const current = phaseRef.current;
      if (current !== 'countdown' && current !== 'challenge') return;

      const frame = capture.toFrame(videoRef.current);
      if (!frame) return;

      if (current === 'countdown' || !baselineRef.current) {
        baselineRef.current = frame;
        setArmed(true);
        return;
      }
      try {
        setResult(runDetector(detector, baselineRef.current, frame));
      } catch {
        // A resolution change mid-round can invalidate the baseline; take a new one.
        baselineRef.current = null;
      }
    };

    sample();
    const timer = window.setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [roundId, challenge, videoRef]);

  return { result, armed };
}
