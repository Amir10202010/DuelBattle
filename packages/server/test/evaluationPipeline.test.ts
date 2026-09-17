import { describe, expect, it } from 'vitest';
import { AI_CONFIDENCE_FLOOR, getChallenge, type PlayerAssessment } from '@battle/shared';
import { validateAssessments, VerifiedJudge } from '../src/ai/pipeline.js';
import { JudgeUnavailable, type AiJudge } from '../src/ai/judge.js';
const sample = (over: Partial<PlayerAssessment> = {}): PlayerAssessment => ({
  playerId: 'p1',
  valid: true,
  confidence: 0.94,
  fulfillment: 60,
  presentation: 20,
  objects: ['mug'],
  reason: 'A mug is visible.',
  score: 80,
  ...over,
});
const input = () => ({
  challenge: getChallenge('obj-face')!,
  photos: [{ playerId: 'p1', image: 'photo', contextImages: [] }],
  signal: AbortSignal.timeout(2000),
});
const judge = (value: PlayerAssessment[]): AiJudge => ({ judge: async () => value });

describe('AI trust boundary', () => {
  it.each([NaN, Infinity, -1, 101, 2.5])('rejects an invalid score %s', (score) => {
    expect(() => validateAssessments([sample({ score })], ['p1'])).toThrow();
  });
  it('recomputes score instead of trusting an adapter value', () => {
    expect(validateAssessments([sample({ score: 1 })], ['p1'])[0]!.score).toBe(80);
  });
  it('rejects missing, duplicated and foreign participants', () => {
    expect(() => validateAssessments([], ['p1'])).toThrow();
    expect(() => validateAssessments([sample(), sample()], ['p1', 'p2'])).toThrow();
    expect(() => validateAssessments([sample({ playerId: 'attacker' })], ['p1'])).toThrow();
  });
  it('rejects incoherent and internally inconsistent assessments', () => {
    for (const value of [
      sample({ confidence: 0.3 }),
      sample({ valid: false }),
      sample({ fulfillment: 1 }),
      sample({ objects: [] }),
    ]) {
      expect(() => validateAssessments([value], ['p1'])).toThrow();
    }
    expect(() => validateAssessments([{ ...sample(), rating: 9999 }], ['p1'])).toThrow();
  });

  it('lets an unsure but coherent reading through, for the floor to zero', () => {
    // Doubt is not incoherence. A reading at 0.6 used to void the round for
    // both players; it now survives validation and is refused a point by the
    // confidence floor, which is a decision about one photo rather than two.
    const [reading] = validateAssessments([sample({ confidence: 0.6 })], ['p1']);
    expect(reading).toMatchObject({ confidence: 0.6, valid: true });
    expect(reading!.confidence).toBeLessThan(AI_CONFIDENCE_FLOOR);
  });
  it('independently verifies and uses conservative criterion values', async () => {
    const pipeline = new VerifiedJudge(
      judge([sample()]),
      judge([sample({ fulfillment: 55, presentation: 18, confidence: 0.9 })]),
    );
    const result = await pipeline.judge(input());
    expect(result[0]).toMatchObject({
      fulfillment: 55,
      presentation: 18,
      confidence: 0.9,
      score: 73,
    });
  });
  it('settles a validity conflict against the disputed photo, not the round', async () => {
    const reject = sample({ valid: false, fulfillment: 0, presentation: 0, score: 0, objects: [] });
    const result = await new VerifiedJudge(judge([sample()]), judge([reject])).judge(input());
    expect(result[0]).toMatchObject({ valid: false, score: 0 });
  });

  it('refuses wide scoring conflicts and provider outages', async () => {
    await expect(
      new VerifiedJudge(
        judge([sample({ fulfillment: 70 })]),
        judge([sample({ fulfillment: 40 })]),
      ).judge(input()),
    ).rejects.toThrow();
    await expect(
      new VerifiedJudge({
        judge: async () => {
          throw new Error('offline');
        },
      }).judge(input()),
    ).rejects.toThrow();
  });

  it('tolerates the ordinary drift between two readings of one photo', async () => {
    const pipeline = new VerifiedJudge(
      judge([sample({ fulfillment: 62, presentation: 26 })]),
      judge([sample({ fulfillment: 45, presentation: 12 })]),
    );
    await expect(pipeline.judge(input())).resolves.toMatchObject([{ score: 57 }]);
  });

  it('rests the referee for a provider fault and not for a difficult photo', async () => {
    const outage = new VerifiedJudge({
      judge: async () => {
        throw new JudgeUnavailable('out of quota');
      },
    });
    await expect(outage.judge(input())).rejects.toThrow();
    expect(outage.available).toBe(false);

    // One unreadable pair of photographs says nothing about the next round, and
    // a room without a referee loses the pose rounds entirely.
    const ambiguous = new VerifiedJudge({
      judge: async () => [sample({ confidence: 0.2 })],
    });
    await expect(ambiguous.judge(input())).rejects.toThrow();
    expect(ambiguous.available).toBe(true);
  });
  it('checks the shared deadline before an additional provider request', async () => {
    const abort = new AbortController();
    let calls = 0;
    const primary: AiJudge = {
      judge: async () => {
        abort.abort();
        return [sample()];
      },
    };
    const verifier: AiJudge = {
      judge: async () => {
        calls++;
        return [sample()];
      },
    };
    await expect(
      new VerifiedJudge(primary, verifier).judge({ ...input(), signal: abort.signal }),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
