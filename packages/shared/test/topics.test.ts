import { describe, expect, it } from 'vitest';
import {
  MAX_TOPIC_LENGTH,
  TOPICS,
  topicCategories,
  topicChallenges,
  topicId,
  validateTopic,
} from '../src/topics.js';
import {
  CHALLENGES,
  allChallengesPool,
  getChallenge,
  isAiVerifiable,
  pickChallenge,
  promptExists,
} from '../src/challenges.js';

describe('the pool as shipped', () => {
  it('is large enough to be worth having', () => {
    expect(TOPICS.length).toBeGreaterThanOrEqual(1_000);
  });

  it('holds nothing that cannot be rendered', () => {
    for (const topic of TOPICS) {
      expect(topic.prompt.length).toBeLessThanOrEqual(MAX_TOPIC_LENGTH);
      expect(topic.prompt).toBe(topic.prompt.toUpperCase());
      expect(topic.prompt).toMatch(/^[A-Z0-9 '’\-.,!?$&+:()]+$/);
    }
  });

  it('passes the same gate the generator has to pass', () => {
    const taken = new Set<string>();
    for (const topic of TOPICS) {
      const check = validateTopic(topic, taken);
      expect(check.ok ? null : `${topic.prompt}: ${check.reason}`).toBeNull();
      taken.add(topic.prompt);
    }
  });

  it('says nothing twice, and nothing the catalogue already says', () => {
    const prompts = TOPICS.map((t) => t.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
    const catalogue = new Set(CHALLENGES.map((c) => c.prompt));
    for (const prompt of prompts) expect(catalogue.has(prompt)).toBe(false);
  });

  it('gives every topic an id nothing else has', () => {
    const ids = new Set([...TOPICS.map((t) => t.id), ...CHALLENGES.map((c) => c.id)]);
    expect(ids.size).toBe(TOPICS.length + CHALLENGES.length);
  });

  it('derives ids from the prompt, so a rebuild keeps them', () => {
    expect(topicId('SHOW SOMETHING RED')).toBe(topicId('SHOW SOMETHING RED'));
    expect(topicId('SHOW SOMETHING RED')).not.toBe(topicId('SHOW SOMETHING BLUE'));
  });

  it('spreads across categories rather than piling into one', () => {
    const categories = topicCategories();
    expect(categories.length).toBeGreaterThanOrEqual(10);
    expect(categories[0]!.count).toBeLessThan(TOPICS.length * 0.45);
  });
});

describe('playing them', () => {
  it('deals every topic as an opponent-judged round', () => {
    for (const challenge of topicChallenges()) {
      expect(challenge.judging).toBe('peer');
      expect(challenge.detector).toBeUndefined();
    }
  });

  it('lets the referee take the ones a photograph settles, and no others', () => {
    const byId = new Map(topicChallenges().map((c) => [c.id, c]));
    for (const topic of TOPICS) {
      expect(isAiVerifiable(byId.get(topic.id)!)).toBe(topic.visual);
    }
  });

  it('resolves a topic through the same lookup as a catalogue prompt', () => {
    const topic = TOPICS[100]!;
    expect(getChallenge(topic.id)?.prompt).toBe(topic.prompt);
    expect(getChallenge('color-red')?.prompt).toBe('SHOW SOMETHING RED');
  });

  it('refuses a player-written prompt the pool already contains', () => {
    expect(promptExists(TOPICS[0]!.prompt)).toBe(true);
    expect(promptExists('SOMETHING NOBODY HAS EVER WRITTEN DOWN')).toBe(false);
  });

  it('still opens on a camera-judged round with a thousand others in the deck', () => {
    for (let i = 0; i < 200; i++) {
      const first = pickChallenge({ used: [], roundNumber: 1, pool: allChallengesPool() });
      expect(first.judging).toBe('auto');
    }
  });

  it('still refuses three opponent-judged rounds in a row', () => {
    for (let i = 0; i < 200; i++) {
      const next = pickChallenge({
        used: [],
        roundNumber: 4,
        recentModes: ['peer', 'peer'],
        pool: allChallengesPool(),
      });
      expect(next.judging).toBe('auto');
    }
  });

  it('keeps the camera in about a third of the rounds it used to be in', () => {
    // The point of the pool is variety, not a different game. The picker's own
    // rules are what hold the ratio, so this is the check that they still do.
    let auto = 0;
    const rounds = 900;
    const modes: ('auto' | 'peer')[] = [];
    const used: string[] = [];
    for (let i = 1; i <= rounds; i++) {
      const roundNumber = ((i - 1) % 9) + 1;
      if (roundNumber === 1) {
        used.length = 0;
        modes.length = 0;
      }
      const challenge = pickChallenge({
        used,
        roundNumber,
        recentModes: modes,
        pool: allChallengesPool(),
      });
      used.push(challenge.id);
      modes.push(challenge.judging);
      if (challenge.judging === 'auto') auto++;
    }
    expect(auto / rounds).toBeGreaterThan(0.25);
    expect(auto / rounds).toBeLessThan(0.55);
  });
});

describe('the gate', () => {
  const taken = new Set(['SHOW SOMETHING ALREADY HERE']);

  it('upper-cases, trims and drops a trailing full stop', () => {
    const check = validateTopic({ prompt: '  show   something tidy.  ' }, taken);
    expect(check.ok && check.topic.prompt).toBe('SHOW SOMETHING TIDY');
  });

  it('refuses anything too long to render', () => {
    const check = validateTopic({ prompt: `SHOW ${'A'.repeat(MAX_TOPIC_LENGTH)}` }, taken);
    expect(check.ok ? null : check.reason).toBe('too-long');
  });

  it('refuses a sentence that is not an instruction', () => {
    const check = validateTopic({ prompt: 'THE MOST INTERESTING THING IN THE ROOM' }, taken);
    expect(check.ok ? null : check.reason).toBe('no-instruction');
  });

  it('refuses the things a webcam game must never ask for', () => {
    for (const prompt of [
      'SHOW YOUR CREDIT CARD NUMBER',
      'SHOW ME YOUR PASSWORD',
      'SHOW YOUR PET TO THE CAMERA',
      'SHOW SOMETHING AND BURN IT',
      'SHOW A CHILD IN THE ROOM',
    ]) {
      const check = validateTopic({ prompt }, taken);
      expect(check.ok ? prompt : check.reason).toBe('needs-something-not-here');
    }
  });

  it('refuses a duplicate however it was spelled', () => {
    expect(validateTopic({ prompt: 'show something already here' }, taken).ok).toBe(false);
  });

  it('defaults a missing difficulty rather than rejecting the prompt', () => {
    const check = validateTopic({ prompt: 'SHOW SOMETHING PLAUSIBLE' }, taken);
    expect(check.ok && check.topic.difficulty).toBe(2);
  });
});

it('keeps editorial metadata and rejects unsafe physical or personal-data prompts', () => {
  for (const topic of TOPICS) {
    expect(topic.language).toBe('en');
    expect(topic.expectedResponseType).toBe('photo');
    expect(topic.qualityScore).toBeGreaterThanOrEqual(70);
    expect(topic.evaluationCriteria.length).toBeGreaterThan(0);
    expect(topic.safetyStatus).toBe('screened');
  }
  for (const prompt of [
    'SHOW ME A KNIFE',
    'HOLD UP YOUR PASSPORT',
    'BRING A BANK CARD, NUMBERS HIDDEN',
    'SHOW ME A CREDIT CARD',
  ]) {
    expect(validateTopic({ prompt }, new Set())).toMatchObject({
      ok: false,
      reason: 'needs-something-not-here',
    });
  }
});
