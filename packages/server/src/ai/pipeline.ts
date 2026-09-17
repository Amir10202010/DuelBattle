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
/**
 * Below this a reading is not cautious, it is incoherent, and the round has to
 * be thrown away.
 *
 * It used to sit at 0.8, above the confidence floor that already zeroes an
 * uncertain answer — so a referee that said "probably, 0.75" did not score that
 * photo zero, it cancelled the whole round for both players. Two separate
 * mechanisms were doing the same job, and the stricter one was doing it to the
 * wrong person. The floor handles doubt; this only catches nonsense.
 */
const COHERENT = 0.5;

/** Also validates injected adapters. No AI provider can write a game verdict directly. */
export function validateAssessments(raw: unknown, ids: string[]): PlayerAssessment[] {
  const parsed = z.array(assessment).min(1).max(2).parse(raw);
  if (
    parsed.length !== ids.length ||
    new Set(parsed.map((a) => a.playerId)).size !== ids.length ||
    parsed.some((a) => !ids.includes(a.playerId))
  )
    throw new JudgeUnavailable('The referee could not verify every answer.', 'evidence');
  for (const a of parsed) {
    // Internal contradictions only: a reading that calls an answer good and
    // then scores it as a miss, or rejects one and then scores it well, has not
    // understood its own rubric.
    if (
      a.confidence < COHERENT ||
      (a.valid && (a.fulfillment < 35 || !a.objects.length)) ||
      (!a.valid && a.fulfillment > 55)
    )
      throw new JudgeUnavailable('The referee needs clearer evidence.', 'evidence');
  }
  return parsed.map((a) => ({
    playerId: a.playerId,
    valid: a.valid,
    confidence: a.confidence,
    fulfillment: a.fulfillment,
    presentation: a.presentation,
    objects: a.objects,
    reason: a.reason,
    reasonRu: a.reasonRu,
    objectsRu: a.objectsRu,
    score: a.valid ? a.fulfillment + a.presentation : 0,
  }));
}

/**
 * How far two independent readings of the same photograph may drift before the
 * round is unscoreable.
 *
 * Presentation is a judgement call and fulfillment is a judgement call with a
 * number on it, so two passes over the same picture legitimately land a dozen
 * points apart, especially on the silly rounds where the whole point is how
 * inventively somebody pulled a face. The old window was tight enough that
 * ordinary variance read as a malfunction. These are wide enough to tolerate
 * taste and narrow enough that a genuinely unstable reading still fails.
 */
const MAX_FULFILLMENT_DRIFT = 26;
const MAX_SCORE_DRIFT = 34;
/** A provider in trouble is rested; a difficult photo is not held against the next one. */
const PROVIDER_REST_MS = 30_000;

export class VerifiedJudge implements AiJudge {
  private unavailableUntil = 0;
  get available(): boolean { return Date.now() >= this.unavailableUntil; }
  constructor(
    private readonly primary: AiJudge,
    private readonly verifier: AiJudge = primary,
  ) {}

  async judge(input: Parameters<AiJudge['judge']>[0]): Promise<PlayerAssessment[]> {
    input.signal.throwIfAborted();
    const started = Date.now();
    const ids = input.photos.map((p) => p.playerId);
    // Each pass is independent: no names, timing, previous judgement or score.
    // A shared absolute deadline includes retries and provider response parsing.
    if (!this.available) throw new JudgeUnavailable('The photo check is resting.');
    let primary: PlayerAssessment[], second: PlayerAssessment[];
    try {
      const readings = await Promise.all([
        Promise.resolve().then(() => { input.signal.throwIfAborted(); return this.primary.judge(input); }),
        Promise.resolve().then(() => { input.signal.throwIfAborted(); return this.verifier.judge({ ...input, photos: [...input.photos].reverse() }); }),
      ]);
      primary = validateAssessments(readings[0], ids);
      second = validateAssessments(readings[1], ids);
    } catch (error) {
      // Only a provider that is actually failing earns a rest.
      if (!(error instanceof JudgeUnavailable) || error.kind === 'provider') {
        this.unavailableUntil = Date.now() + PROVIDER_REST_MS;
      }
      throw error;
    }
    input.signal.throwIfAborted();
    const result = primary.map((a) => {
      const b = second.find((value) => value.playerId === a.playerId)!;
      // How far apart the two numbers are only means anything when the two
      // passes are grading the same thing. When one of them rejected the photo
      // outright its scores are zero by construction, and comparing them to a
      // grade would count one disagreement twice.
      if (
        a.valid &&
        b.valid &&
        (Math.abs(a.fulfillment - b.fulfillment) > MAX_FULFILLMENT_DRIFT ||
          Math.abs(a.score - b.score) > MAX_SCORE_DRIFT)
      ) {
        throw new JudgeUnavailable('The photo checks disagree.', 'evidence');
      }
      /*
       * Two passes that disagree about whether an answer counts settle on "it
       * does not", for that player alone.
       *
       * This used to void the round. That punished the wrong person: if the
       * referee was unsure about one photograph, the opponent lost a round they
       * had clearly won, and the match reported that nothing could be checked.
       * Requiring both passes to agree before a point is awarded is strictly
       * more cautious per player, and it never costs anybody a round somebody
       * else's picture was ambiguous in.
       */
      const valid = a.valid && b.valid;
      return {
        ...a,
        valid,
        confidence: Math.min(a.confidence, b.confidence),
        fulfillment: Math.min(a.fulfillment, b.fulfillment),
        presentation: Math.min(a.presentation, b.presentation),
        score: valid
          ? Math.min(a.fulfillment, b.fulfillment) + Math.min(a.presentation, b.presentation)
          : 0,
        reason: a.valid === b.valid ? a.reason : 'The two photo checks did not agree on this one.',
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
