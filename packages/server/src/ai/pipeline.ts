import { z } from 'zod';
import { photoAssessmentSchema } from '@battle/shared/validation';
import type { PlayerAssessment } from '@battle/shared';
import { JudgeUnavailable, type AiJudge } from './judge.js';
import { log } from '../log.js';

const assessment = photoAssessmentSchema.omit({ slot: true }).extend({
  playerId: z.string().min(1).max(64),
  score: z.number().int().min(0).max(100),
  detector: z.enum(['yolov8', 'unavailable']).optional(),
  detections: z.array(z.unknown()).max(32).optional(),
});
const CONFIDENCE = 0.8;

/** Also validates injected adapters. No AI provider can write a game verdict directly. */
export function validateAssessments(raw: unknown, ids: string[]): PlayerAssessment[] {
  const parsed = z.array(assessment).min(1).max(2).parse(raw);
  if (
    parsed.length !== ids.length ||
    new Set(parsed.map((a) => a.playerId)).size !== ids.length ||
    parsed.some((a) => !ids.includes(a.playerId))
  )
    throw new JudgeUnavailable('The referee could not verify every answer.');
  for (const a of parsed) {
    if (
      a.confidence < CONFIDENCE ||
      (a.valid && (a.fulfillment < 42 || !a.objects.length)) ||
      (!a.valid && a.fulfillment > 55)
    )
      throw new JudgeUnavailable('The referee needs clearer evidence.');
  }
  return parsed.map((a) => ({
    playerId: a.playerId,
    valid: a.valid,
    confidence: a.confidence,
    fulfillment: a.fulfillment,
    presentation: a.presentation,
    objects: a.objects,
    reason: a.reason,
    score: a.valid ? a.fulfillment + a.presentation : 0,
  }));
}

export class VerifiedJudge implements AiJudge {
  constructor(
    private readonly primary: AiJudge,
    private readonly verifier: AiJudge = primary,
  ) {}

  async judge(input: Parameters<AiJudge['judge']>[0]): Promise<PlayerAssessment[]> {
    const started = Date.now();
    const ids = input.photos.map((p) => p.playerId);
    // Each pass is independent: no names, timing, previous judgement or score.
    // A shared absolute deadline includes retries and provider response parsing.
    const primary = validateAssessments(await this.primary.judge(input), ids);
    input.signal.throwIfAborted();
    const second = validateAssessments(
      await this.verifier.judge({ ...input, photos: [...input.photos].reverse() }),
      ids,
    );
    const result = primary.map((a) => {
      const b = second.find((value) => value.playerId === a.playerId)!;
      if (
        a.valid !== b.valid ||
        Math.abs(a.fulfillment - b.fulfillment) > 18 ||
        Math.abs(a.score - b.score) > 25
      ) {
        throw new JudgeUnavailable('Independent checks disagree. No ranked verdict will be used.');
      }
      return {
        ...a,
        confidence: Math.min(a.confidence, b.confidence),
        fulfillment: Math.min(a.fulfillment, b.fulfillment),
        presentation: Math.min(a.presentation, b.presentation),
        score: a.valid
          ? Math.min(a.fulfillment, b.fulfillment) + Math.min(a.presentation, b.presentation)
          : 0,
        reason: `${a.reason} Independently verified.`.slice(0, 300),
      };
    });
    log.info('evaluation complete', {
      challenge: input.challenge.id,
      durationMs: Date.now() - started,
      confidence: Math.min(...result.map((a) => a.confidence)),
      passes: 2,
    });
    return result;
  }
}
