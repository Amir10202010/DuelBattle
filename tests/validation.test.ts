import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  challengeSchema,
  generateProposal,
  selectChallenge,
  validateProposal,
} from '../shared/challenges';
import { actionSchemas } from '../shared/protocol';
import { RateLimiter } from '../server/rate-limit';
import { colorFraction, TemporalColorGuide } from '../src/vision/color';

describe('challenge review and protocol boundaries', () => {
  it('validates every catalog entry and keeps subjective claims human reviewed', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const challenge of CHALLENGES) {
      expect(challengeSchema.safeParse(challenge).success).toBe(true);
      expect(challenge.aiVerifiable).toBe(false);
      expect(challenge.subjective).toBe(challenge.verificationType === 'SUBJECTIVE');
    }
  });
  it('avoids repeats until the reviewed catalog is exhausted', () => {
    const ids: string[] = [];
    for (let i = 0; i < CHALLENGES.length; i++) ids.push(selectChallenge(ids, () => 0).id);
    expect(new Set(ids).size).toBe(CHALLENGES.length);
    expect(selectChallenge(ids).id).not.toBe(ids.at(-1));
  });
  it('rejects dangerous, private, impossible and unsupported proposal inputs', () => {
    for (const prompt of [
      'Show a knife to the camera',
      'Jump onto a desk',
      'Show your password',
      'Go outside and find a bird',
      '<script>alert(1)</script>',
    ])
      expect(() => validateProposal({ ...CHALLENGES[0], prompt }, ['OBJECT'])).toThrow();
    expect(() => validateProposal({ ...CHALLENGES[0], timeLimit: 0 }, ['OBJECT'])).toThrow();
    expect(() => validateProposal(CHALLENGES[0], ['ACTION'])).toThrow('unavailable');
    expect(() => validateProposal({ ...CHALLENGES[0], aiVerifiable: true }, ['OBJECT'])).toThrow(
      'not available',
    );
  });
  it('quarantines even plausible custom/generated text pending human safety and feasibility review', async () => {
    expect(validateProposal(CHALLENGES[0], ['OBJECT']).status).toBe('PENDING_REVIEW');
    const context = {
      category: 'OBJECT' as const,
      difficulty: 'easy' as const,
      language: 'en' as const,
      previousIds: [],
      supported: ['OBJECT' as const],
    };
    await expect(
      generateProposal({ generate: async () => ({ winner: 'me' }) }, context),
    ).rejects.toThrow();
    expect((await generateProposal({ generate: async () => CHALLENGES[0] }, context)).status).toBe(
      'PENDING_REVIEW',
    );
  });
  it('rejects client-provided winner, timestamps, premium and script markup', () => {
    expect(actionSchemas.create.safeParse({ name: 'Alex', premium: true }).success).toBe(false);
    expect(actionSchemas.create.safeParse({ name: '<img onerror=1>' }).success).toBe(false);
    expect(
      actionSchemas.ready.safeParse({ roomCode: 'ABCDEF1234', ready: true, winner: 'me' }).success,
    ).toBe(false);
    expect(actionSchemas.join.safeParse({ roomCode: '../etc', name: 'Alex' }).success).toBe(false);
    expect(
      actionSchemas.signal.safeParse({
        roomCode: 'ABCDEF1234',
        description: { type: 'offer', sdp: 'x'.repeat(24_001) },
      }).success,
    ).toBe(false);
  });
  it('throttles abuse while allowing a new window', () => {
    const limits = new RateLimiter();
    limits.take('a', 2, 100, 0);
    limits.take('a', 2, 100, 0);
    expect(() => limits.take('a', 2, 100, 0)).toThrow('too fast');
    expect(() => limits.take('a', 2, 100, 100)).not.toThrow();
  });
});
describe('real on-device color assistance', () => {
  it('distinguishes vivid colors from neutral and dark frames', () => {
    const frame = (r: number, g: number, b: number) =>
      new Uint8ClampedArray(Array.from({ length: 100 }, () => [r, g, b, 255]).flat());
    expect(colorFraction(frame(220, 15, 15), 'red')).toBe(1);
    expect(colorFraction(frame(20, 100, 220), 'blue')).toBe(1);
    expect(colorFraction(frame(20, 180, 40), 'green')).toBe(1);
    expect(colorFraction(frame(128, 128, 128), 'red')).toBe(0);
    expect(colorFraction(frame(20, 0, 0), 'red')).toBe(0);
    expect(colorFraction(frame(20, 100, 220), 'red')).toBe(0);
  });
  it('requires temporal stability and clears stale evidence', () => {
    const guide = new TemporalColorGuide();
    expect(guide.update(0.2)).toBe(false);
    expect(guide.update(0.2)).toBe(false);
    expect(guide.update(0.2)).toBe(true);
    expect(guide.update(0.01)).toBe(false);
    expect(guide.update(0.2)).toBe(false);
    guide.reset();
    expect(guide.update(0.2)).toBe(false);
  });
});
