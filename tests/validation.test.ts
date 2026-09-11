import { describe, expect, it } from 'vitest';
import { CHALLENGES, getChallenge, selectChallenge, validateCatalog } from '../shared/challenges';
import { actionSchemas, challengeSchema } from '../shared/validation';
import { generateProposal, validateProposal } from '../server/challenges';
import { RateLimiter } from '../server/rate-limit';

describe('challenge review and protocol boundaries', () => {
  it('validates every catalog entry and keeps subjective claims human reviewed', () => {
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    for (const challenge of CHALLENGES) {
      expect(challengeSchema.safeParse(challenge).success).toBe(true);
      expect(challenge.aiVerifiable).toBe(false);
      expect(challenge.subjective).toBe(challenge.verificationType === 'SUBJECTIVE');
    }
  });
  it('holds the catalog to its structural invariants', () => {
    expect(validateCatalog()).toEqual([]);
    expect(validateCatalog([{ ...CHALLENGES[0], id: 'broken', aiVerifiable: true }])).toContain(
      'broken: no challenge is decided automatically',
    );
    expect(validateCatalog([{ ...CHALLENGES[0], id: 'broken', subjective: true }])).toContain(
      'broken: subjective flag disagrees with the verification type',
    );
  });
  it('avoids repeats until the reviewed catalog is exhausted', () => {
    const ids: string[] = [];
    for (let i = 0; i < CHALLENGES.length; i++) ids.push(selectChallenge(ids, () => 0, i + 1).id);
    expect(new Set(ids).size).toBe(CHALLENGES.length);
    expect(selectChallenge(ids, Math.random, CHALLENGES.length + 1).id).not.toBe(ids.at(-1));
  });
  it('opens with an assisted round and never runs three judged rounds in a row', () => {
    for (let seed = 0; seed < 40; seed++) {
      const random = () => (seed % 20) / 20;
      const first = selectChallenge([], random, 1);
      expect(first.color).toBeTruthy();
      expect(first.subjective).toBe(false);
      const ids = [first.id];
      for (let round = 2; round <= 12; round++) ids.push(selectChallenge(ids, random, round).id);
      const judged = ids.map((id) => getChallenge(id)!.subjective);
      for (let i = 2; i < judged.length; i++)
        expect(judged[i - 2] && judged[i - 1] && judged[i]).toBe(false);
    }
  });
  it('ramps difficulty rather than filtering on it', () => {
    const late = Array.from(
      { length: 200 },
      (_, i) => selectChallenge([], () => i / 200, 6).difficulty,
    );
    expect(late.filter((d) => d === 'hard').length).toBeGreaterThan(
      late.filter((d) => d === 'easy').length,
    );
    expect(late).toContain('easy');
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
