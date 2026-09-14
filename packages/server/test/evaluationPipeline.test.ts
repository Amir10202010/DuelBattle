import { describe, expect, it } from 'vitest';
import { getChallenge, type PlayerAssessment } from '@battle/shared';
import { validateAssessments, VerifiedJudge } from '../src/ai/pipeline.js';
import type { AiJudge } from '../src/ai/judge.js';
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
  it('rejects ambiguous and internally inconsistent assessments', () => {
    for (const value of [
      sample({ confidence: 0.79 }),
      sample({ valid: false }),
      sample({ fulfillment: 1 }),
      sample({ objects: [] }),
    ]) {
      expect(() => validateAssessments([value], ['p1'])).toThrow();
    }
    expect(() => validateAssessments([{ ...sample(), rating: 9999 }], ['p1'])).toThrow();
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
  it('refuses validity conflicts, wide scoring conflicts and provider outages', async () => {
    const reject = sample({ valid: false, fulfillment: 0, presentation: 0, score: 0, objects: [] });
    await expect(
      new VerifiedJudge(judge([sample()]), judge([reject])).judge(input()),
    ).rejects.toThrow();
    await expect(
      new VerifiedJudge(
        judge([sample({ fulfillment: 70 })]),
        judge([sample({ fulfillment: 42 })]),
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
