import jpeg from 'jpeg-js';
import type { Challenge } from '../shared/challenges';
import { detectColorObject } from '../shared/vision/detect';
import { ANALYSIS_WIDTH, ANALYSIS_HEIGHT, resizeFrame, type Frame } from '../shared/vision/frame';
import { imageSchema } from '../shared/validation';
import { GameError } from './errors';

/** Validate every image, including peer-judged images, before providers run. */
export function decodeEvidence(image: string): Frame {
  try {
    if (!imageSchema.safeParse(image).success) throw new Error('Invalid data URL');
    const bytes = Buffer.from(image.slice('data:image/jpeg;base64,'.length), 'base64');
    const decoded = jpeg.decode(bytes, {
      useTArray: true,
      maxResolutionInMP: 1,
      maxMemoryUsageInMB: 16,
      tolerantDecoding: false,
    });
    if (!decoded.width || !decoded.height || decoded.width > 1280 || decoded.height > 1280)
      throw new Error('Invalid dimensions');
    return resizeFrame(
      {
        width: decoded.width,
        height: decoded.height,
        data: new Uint8ClampedArray(decoded.data),
      },
      ANALYSIS_WIDTH,
      ANALYSIS_HEIGHT,
    );
  } catch {
    throw new GameError('BAD_EVIDENCE', 'Take a fresh camera snapshot and try again.');
  }
}

export type VerificationDecision =
  | { kind: 'human-review'; reviewForMs: number; observation?: string }
  | { kind: 'rejected'; reason: string };

export interface VerificationInput {
  challenge: Challenge;
  /** Preceding frames then current frame. Never trusted as liveness or capture timestamps. */
  image: string;
  frames: readonly Frame[];
  baseline?: Frame;
  signal: AbortSignal;
}

/** Providers assess evidence; only the engine can settle a round. */
export interface VerificationProvider {
  readonly id: string;
  evaluate(input: VerificationInput): VerificationDecision | Promise<VerificationDecision>;
}

export class OpponentVerificationProvider implements VerificationProvider {
  readonly id = 'temporal-assisted-peer-v2';
  evaluate({ challenge, frames, baseline }: VerificationInput): VerificationDecision {
    let observation: string | undefined;
    if (challenge.color && baseline) {
      const results = frames.map((frame) =>
        detectColorObject(baseline, frame, { target: challenge.color! }),
      );
      const stable = results.length >= 3 && results.every((result) => result.matched);
      observation = stable
        ? `New ${challenge.color} pixels appear across three frames. Check the player and the requested interaction.`
        : 'Color assistance is inconclusive. Judge the player and the requested interaction yourself.';
    }
    return { kind: 'human-review', reviewForMs: 8_000, observation };
  }
}

/** An external provider cannot hold a race indefinitely or silently award a point. */
export async function evaluateEvidence(
  provider: VerificationProvider,
  input: Omit<VerificationInput, 'signal'>,
): Promise<{ decision: VerificationDecision; fallback: boolean }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const decision = await Promise.race([
      Promise.resolve().then(() => provider.evaluate({ ...input, signal: controller.signal })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Verification timeout')), 2000);
      }),
    ]);
    if (decision.kind === 'human-review') {
      if (!Number.isFinite(decision.reviewForMs)) throw new Error('Invalid review window');
      return {
        decision: {
          kind: 'human-review',
          reviewForMs: Math.max(1000, Math.min(8000, decision.reviewForMs)),
          observation: decision.observation?.slice(0, 240),
        },
        fallback: false,
      };
    }
    if (decision.kind !== 'rejected' || typeof decision.reason !== 'string')
      throw new Error('Unsupported provider decision');
    return {
      decision: { kind: 'rejected', reason: decision.reason.slice(0, 240) },
      fallback: false,
    };
  } catch {
    return {
      decision: new OpponentVerificationProvider().evaluate({
        ...input,
        signal: controller.signal,
      }),
      fallback: true,
    };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
