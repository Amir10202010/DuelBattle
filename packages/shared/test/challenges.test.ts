import { describe, expect, it } from 'vitest';
import {
  CHALLENGES,
  getChallenge,
  pickChallenge,
  validateCatalog,
  type Challenge,
  type JudgingMode,
} from '../src/challenges.js';
import { isColorKey } from '../src/vision/color.js';

describe('catalogue', () => {
  it('satisfies its structural invariants', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('is big enough that a full match never repeats', () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(30);
  });

  it('offers both judging modes in useful quantities', () => {
    const auto = CHALLENGES.filter((c) => c.judging === 'auto');
    const peer = CHALLENGES.filter((c) => c.judging === 'peer');
    expect(auto.length).toBeGreaterThanOrEqual(15);
    expect(peer.length).toBeGreaterThanOrEqual(15);
  });

  it('draws on more than one kind of detector, so auto rounds are not all colour', () => {
    const kinds = new Set(
      CHALLENGES.filter((c) => c.detector).map((c) => c.detector!.kind),
    );
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('only asks a detector for something it can actually decide', () => {
    for (const c of CHALLENGES) {
      if (c.detector?.kind === 'color') {
        expect(isColorKey(c.detector.target)).toBe(true);
        // The colour named in the prompt must be the colour we test for.
        expect(c.prompt.toLowerCase()).toContain(c.detector.target);
      }
      if (c.detector?.kind === 'colorPair') {
        for (const target of c.detector.targets) {
          expect(isColorKey(target)).toBe(true);
          expect(c.prompt.toLowerCase()).toContain(target);
        }
      }
    }
  });

  it('finds challenges by id and reports misses honestly', () => {
    expect(getChallenge(CHALLENGES[0]!.id)?.id).toBe(CHALLENGES[0]!.id);
    expect(getChallenge('does-not-exist')).toBeUndefined();
  });
});

describe('validateCatalog', () => {
  const base: Challenge = {
    id: 'x',
    prompt: 'SHOW SOMETHING',
    category: 'object',
    difficulty: 1,
    durationMs: 20_000,
    judging: 'peer',
    tags: ['object'],
  };

  it('flags an auto challenge with no detector', () => {
    expect(validateCatalog([{ ...base, judging: 'auto' }])).toContain(
      'x: auto round without a detector',
    );
  });

  it('flags a peer challenge that carries a detector', () => {
    expect(
      validateCatalog([{ ...base, detector: { kind: 'presence', minChange: 0.1 } }]),
    ).toContain('x: peer round must not carry a detector');
  });

  it('flags duplicates, casing and implausible durations', () => {
    const problems = validateCatalog([base, { ...base, id: 'y' }, { ...base, id: 'z', prompt: 'lower case', durationMs: 5 }]);
    expect(problems).toContain('duplicate prompt: SHOW SOMETHING');
    expect(problems).toContain('z: prompt must be upper case');
    expect(problems).toContain('z: implausible duration');
  });
});

describe('pickChallenge', () => {
  it('never repeats a used challenge while options remain', () => {
    const used: string[] = [];
    for (let round = 1; round <= CHALLENGES.length; round++) {
      const next = pickChallenge({ used, roundNumber: round });
      expect(used).not.toContain(next.id);
      used.push(next.id);
    }
  });

  it('recycles gracefully once the deck is exhausted', () => {
    const used = CHALLENGES.map((c) => c.id);
    expect(() => pickChallenge({ used, roundNumber: 99 })).not.toThrow();
  });

  it('always opens with an auto round so nobody votes before they have played', () => {
    for (let i = 0; i < 200; i++) {
      expect(pickChallenge({ used: [], roundNumber: 1 }).judging).toBe('auto');
    }
  });

  it('breaks up a run of peer rounds', () => {
    const recentModes: JudgingMode[] = ['peer', 'peer'];
    for (let i = 0; i < 200; i++) {
      expect(pickChallenge({ used: [], roundNumber: 4, recentModes }).judging).toBe('auto');
    }
  });

  it('prefers harder challenges later in a match', () => {
    const tally = (roundNumber: number) => {
      let sum = 0;
      for (let i = 0; i < 400; i++) sum += pickChallenge({ used: [], roundNumber }).difficulty;
      return sum / 400;
    };
    expect(tally(6)).toBeGreaterThan(tally(1));
  });

  it('honours an explicit deck', () => {
    const only: Challenge = {
      id: 'only',
      prompt: 'SHOW A CAT',
      category: 'object',
      difficulty: 1,
      durationMs: 20_000,
      judging: 'peer',
      tags: ['cat'],
    };
    expect(pickChallenge({ used: [], roundNumber: 1, pool: [only] }).id).toBe('only');
  });

  it('is deterministic for a given random source', () => {
    const seeded = () => 0.77;
    const a = pickChallenge({ used: [], roundNumber: 3, random: seeded });
    const b = pickChallenge({ used: [], roundNumber: 3, random: seeded });
    expect(a.id).toBe(b.id);
  });
});
