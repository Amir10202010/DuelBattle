import { describe, expect, it } from 'vitest';
import {
  AI_VERIFIABLE_IDS,
  CHALLENGES,
  getChallenge,
  isAiVerifiable,
  pickChallenge,
  samplePrompts,
  type Challenge,
  type JudgingMode,
  validateCatalog,
  allChallengesPool,
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

describe('the rounds an AI referee may take', () => {
  it('names only prompts that exist, and only ones the opponent judges today', () => {
    for (const id of AI_VERIFIABLE_IDS) {
      const challenge = getChallenge(id);
      expect(challenge, `AI_VERIFIABLE names a challenge that does not exist: ${id}`).toBeDefined();
      // A round the camera already settles has nothing to ask a model.
      expect(challenge!.judging, id).toBe('peer');
    }
  });

  it('leaves the prompts no photograph can settle with the opponent', () => {
    // Price, weight, smell, personal history and anything needing sound. If one
    // of these ever turns up in the AI list, it was a mistake.
    for (const id of ['obj-cheap', 'obj-expensive', 'obj-heavy', 'obj-smell', 'obj-book']) {
      expect(AI_VERIFIABLE_IDS, id).not.toContain(id);
    }
    for (const c of CHALLENGES) {
      if (c.category === 'story') expect(AI_VERIFIABLE_IDS, c.id).not.toContain(c.id);
    }
  });

  it('agrees with isAiVerifiable', () => {
    for (const c of CHALLENGES) {
      expect(isAiVerifiable(c), c.id).toBe(AI_VERIFIABLE_IDS.includes(c.id));
    }
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
      validateCatalog([{ ...base, detector: { kind: 'coverage', minChange: 0.8 } }]),
    ).toContain('x: peer round must not carry a detector');
  });

  it('flags a prompt that names a different colour than it tests for', () => {
    // Unwinnable, and nothing about playing it would explain why.
    const problems = validateCatalog([
      { ...base, judging: 'auto', detector: { kind: 'color', target: 'blue' } },
    ]);
    expect(problems.join(' ')).toContain('does not name the colour it tests for');
  });

  it('flags a colour pair where only one colour is named', () => {
    const problems = validateCatalog([
      {
        ...base,
        prompt: 'SHOW SOMETHING RED',
        judging: 'auto',
        detector: { kind: 'colorPair', targets: ['red', 'white'] },
      },
    ]);
    expect(problems.join(' ')).toContain('white');
  });

  it('accepts a detector whose colours the prompt does name', () => {
    expect(
      validateCatalog([
        {
          ...base,
          prompt: 'SHOW SOMETHING RED AND WHITE',
          judging: 'auto',
          detector: { kind: 'colorPair', targets: ['red', 'white'] },
        },
      ]),
    ).toEqual([]);
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


describe('pickChallenge and what a room has seen lately', () => {
  it('reaches past the prompts the room just played', () => {
    const recent = CHALLENGES.slice(0, 20).map((c) => c.id);
    for (let i = 0; i < 200; i++) {
      const picked = pickChallenge({ used: [], avoid: recent, roundNumber: 4 });
      expect(recent).not.toContain(picked.id);
    }
  });

  it('plays a seen prompt rather than let round one stop being camera-judged', () => {
    // Every auto challenge is in the avoid list. The opener matters more than
    // the freshness, so the freshness is what gives.
    const allAuto = CHALLENGES.filter((c) => c.judging === 'auto').map((c) => c.id);
    for (let i = 0; i < 100; i++) {
      const picked = pickChallenge({ used: [], avoid: allAuto, roundNumber: 1 });
      expect(picked.judging).toBe('auto');
    }
  });

  it('still refuses to repeat inside the match it is playing', () => {
    // `used` is the hard rule; `avoid` is the soft one, and they do not trade.
    const used = CHALLENGES.filter((c) => c.judging === 'peer')
      .slice(0, 30)
      .map((c) => c.id);
    for (let i = 0; i < 200; i++) {
      const picked = pickChallenge({ used, avoid: [], roundNumber: 5 });
      expect(used).not.toContain(picked.id);
    }
  });
});

describe('samplePrompts', () => {
  it('returns the number asked for', () => {
    expect(samplePrompts(3)).toHaveLength(3);
    expect(samplePrompts(1)).toHaveLength(1);
  });

  it('returns real prompts the game can actually deal', () => {
    const all = new Set(allChallengesPool().map((c) => c.prompt));
    for (const prompt of samplePrompts(4)) expect(all.has(prompt)).toBe(true);
  });

  it('never repeats itself inside one sample', () => {
    for (let i = 0; i < 200; i++) {
      const sample = samplePrompts(4);
      expect(new Set(sample).size).toBe(sample.length);
    }
  });

  it('shows the range rather than four of the same kind', () => {
    // A new player waiting in the lobby should not conclude the whole game is
    // about colours.
    for (let i = 0; i < 100; i++) {
      const sample = samplePrompts(3);
      const categories = sample.map(
        (prompt) => allChallengesPool().find((c) => c.prompt === prompt)!.category,
      );
      expect(new Set(categories).size).toBe(categories.length);
    }
  });

  it('survives a degenerate random source', () => {
    expect(samplePrompts(3, () => 0)).toHaveLength(3);
    expect(samplePrompts(3, () => 0.999999)).toHaveLength(3);
    expect(samplePrompts(3, () => 1)).toHaveLength(3);
  });
});
