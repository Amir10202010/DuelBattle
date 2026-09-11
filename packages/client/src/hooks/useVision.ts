import { useEffect, useRef, useState } from 'react';
import { runDetector, type Challenge, type DetectionResult, type Frame } from '@battle/shared';
import { createAnalysisCapture } from '../media/capture.js';

/** How often the on-device preview runs. Fast enough to feel live, cheap enough to ignore. */
const SAMPLE_INTERVAL_MS = 180;
/** The baseline is retaken for a few frames in case the first one caught a blur. */
const BASELINE_SETTLE_MS = 350;

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
  active: boolean;
}

/**
 * Runs the round's detector on this device, purely so the player can see
 * whether the camera has found what they are holding.
 *
 * It is the identical function the server runs on the submitted frame, but it
 * is never the verdict: the score comes from the server's run, over the frame
 * that was actually sent. This is a viewfinder, not a judge.
 */
export function useLocalDetection({
  videoRef,
  challenge,
  roundId,
  active,
}: UseLocalDetectionOptions): LocalDetection {
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [armed, setArmed] = useState(false);
  const baselineRef = useRef<Frame | null>(null);
  const captureRef = useRef(createAnalysisCapture());

  useEffect(() => {
    baselineRef.current = null;
    setResult(null);
    setArmed(false);

    const detector = challenge?.detector;
    if (!active || !roundId || !detector) return;

    const capture = captureRef.current;
    const startedAt = Date.now();
    let cancelled = false;

    const sample = () => {
      if (cancelled) return;
      const frame = capture.toFrame(videoRef.current);
      if (!frame) return;

      // The prompt has just appeared and the player has not moved yet, so the
      // first frames of the round are the honest "before" picture.
      if (!baselineRef.current || Date.now() - startedAt < BASELINE_SETTLE_MS) {
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
  }, [active, roundId, challenge, videoRef]);

  return { result, armed };
}
