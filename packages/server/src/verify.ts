import jpeg from 'jpeg-js';
import {
  ANALYSIS_HEIGHT,
  ANALYSIS_WIDTH,
  resizeFrame,
  runDetector,
  type AutoVerdict,
  type Challenge,
  type Frame,
} from '@battle/shared';
import { log } from './log.js';

/** Guard against a decompression bomb: a tiny payload can claim huge dimensions. */
const MAX_DECODED_PIXELS = 4_000_000;

export class DecodeError extends Error {}

const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/** A server-selected crop helps the photo judge see small objects. Full evidence
 * still accompanies it; client-provided boxes never enter this path. */
export function cropEvidence(image: string, box: readonly number[]): string | undefined {
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n) || n < 0 || n > 1) ||
    box[2]! <= box[0]! || box[3]! <= box[1]!) return undefined;
  try {
    const decoded = jpeg.decode(Buffer.from(image.slice(DATA_URL_PREFIX.length), 'base64'), {
      useTArray: true, maxMemoryUsageInMB: 64,
    });
    if (decoded.width * decoded.height > MAX_DECODED_PIXELS) return undefined;
    const pad = 0.05;
    const left = Math.floor(Math.max(0, box[0]! - pad) * decoded.width);
    const top = Math.floor(Math.max(0, box[1]! - pad) * decoded.height);
    const width = Math.ceil(Math.min(1, box[2]! + pad) * decoded.width) - left;
    const height = Math.ceil(Math.min(1, box[3]! + pad) * decoded.height) - top;
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
      const offset = ((top + y) * decoded.width + left) * 4;
      data.set(decoded.data.subarray(offset, offset + width * 4), y * width * 4);
    }
    return DATA_URL_PREFIX + jpeg.encode({ width, height, data }, 85).data.toString('base64');
  } catch { return undefined; }
}

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
  if (!challenge.detector) return { kind: 'undecidable', reason: 'challenge has no detector' };
  if (!baseline) return { kind: 'needs-baseline' };

  try {
    const result = runDetector(challenge.detector, baseline, submitted);
    // Unreadable evidence is never turned into a player vote.
    if (result.undecidable) return { kind: 'undecidable', reason: result.reason };
    return {
      kind: 'verdict',
      verdict: {
        matched: result.matched,
        confidence: result.confidence,
        reason: result.reason,
        evaluation: {
          score: result.matched ? Math.min(100, Math.max(0, Math.round(result.score ?? 100))) : 0,
          criterion: challenge.detector.kind === 'color' ? 'color' : 'task',
          label: 'Shown object', labelRu: 'Предмет',
          ...(challenge.detector.kind === 'color' ? { color: challenge.detector.target } : {}),
          ...(result.region ? { region: result.region.box } : {}),
        },
      },
    };
  } catch (err) {
    log.warn('detector threw', {
      challengeId: challenge.id,
      detector: challenge.detector.kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return { kind: 'undecidable', reason: 'detector failed' };
  }
}
