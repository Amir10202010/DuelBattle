import jpeg from 'jpeg-js';
import {
  ANALYSIS_HEIGHT,
  ANALYSIS_WIDTH,
  detectColorObject,
  resizeFrame,
  type AutoVerdict,
  type Challenge,
  type DetectorSpec,
  type Frame,
} from '@battle/shared';
import { detectChange } from '@battle/shared';
import { log } from './log.js';

/** Guard against a decompression bomb: a tiny payload can claim huge dimensions. */
const MAX_DECODED_PIXELS = 4_000_000;

export class DecodeError extends Error {}

const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/**
 * Decodes a client snapshot and immediately reduces it to the shared analysis
 * resolution, so nothing downstream ever holds a full-size frame.
 */
export function decodeEvidence(dataUrl: string): Frame {
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) {
    throw new DecodeError('expected a base64 JPEG data URL');
  }
  const bytes = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), 'base64');
  if (bytes.length === 0) throw new DecodeError('empty image payload');

  let decoded: { width: number; height: number; data: Uint8Array };
  try {
    decoded = jpeg.decode(bytes, { useTArray: true, maxMemoryUsageInMB: 64 });
  } catch (err) {
    throw new DecodeError(err instanceof Error ? err.message : 'unreadable JPEG');
  }
  if (decoded.width * decoded.height > MAX_DECODED_PIXELS) {
    throw new DecodeError('image resolution above the allowed ceiling');
  }

  const frame: Frame = {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.length),
  };
  return resizeFrame(frame, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
}

export type VerifyOutcome =
  | { kind: 'verdict'; verdict: AutoVerdict }
  | { kind: 'needs-baseline' }
  | { kind: 'undecidable'; reason: string };

/**
 * Re-runs the challenge's detector on the server, over the frames the client
 * actually submitted. The client runs the identical function for instant
 * feedback, but only this result is ever written into the match state — a
 * client that lies about its own verdict changes nothing.
 */
export function verifySubmission(
  challenge: Challenge,
  baseline: Frame | undefined,
  submitted: Frame,
): VerifyOutcome {
  const detector: DetectorSpec | undefined = challenge.detector;
  if (!detector) return { kind: 'undecidable', reason: 'challenge has no detector' };
  if (!baseline) return { kind: 'needs-baseline' };

  try {
    switch (detector.kind) {
      case 'color': {
        const result = detectColorObject(baseline, submitted, {
          target: detector.target,
          ...(detector.minShare !== undefined ? { minShare: detector.minShare } : {}),
          ...(detector.minChange !== undefined ? { minChange: detector.minChange } : {}),
        });
        return {
          kind: 'verdict',
          verdict: {
            matched: result.matched,
            confidence: result.confidence,
            reason: result.reason,
          },
        };
      }
      case 'presence': {
        const change = detectChange(baseline, submitted);
        const matched = change >= detector.minChange;
        return {
          kind: 'verdict',
          verdict: {
            matched,
            confidence: matched ? Math.min(1, change / (detector.minChange * 3)) : 0,
            reason: matched ? 'Got it.' : 'Nothing changed in frame.',
          },
        };
      }
    }
  } catch (err) {
    log.warn('detector threw', {
      challengeId: challenge.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'undecidable', reason: 'detector failed' };
  }
}
