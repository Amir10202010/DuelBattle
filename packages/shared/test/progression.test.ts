import { describe, expect, it } from 'vitest';
import {
  BASE_LEVEL_COST,
  LEVEL_COST_STEP,
  XP_PER_MATCH,
  levelFor,
  matchXp,
  xpForLevel,
  xpToReach,
} from '../src/progression.js';
import {
  DIVISIONS_PER_TIER,
  STARTING_RATING,
  TIERS,
  demotionRisk,
  nextRank,
  rankFor,
  rankMove,
} from '../src/rating.js';

describe('xp', () => {
  it('pays for turning up, win or lose', () => {
    const lost = matchXp({ result: 'loss', roundsWon: 0, validAnswers: 0, streak: 0 });
    expect(lost).toBe(XP_PER_MATCH);
  });

  it('pays more for winning than for losing the same match', () => {
    const shape = { roundsWon: 3, validAnswers: 5 } as const;
    expect(matchXp({ ...shape, result: 'win', streak: 1 })).toBeGreaterThan(
      matchXp({ ...shape, result: 'loss', streak: 0 }),
    );
  });

  it('pays for the rounds a losing match went well in', () => {
    const close = matchXp({ result: 'loss', roundsWon: 2, validAnswers: 5, streak: 0 });
    const whitewash = matchXp({ result: 'loss', roundsWon: 0, validAnswers: 0, streak: 0 });
    expect(close).toBeGreaterThan(whitewash);
  });

  it('caps what a streak is worth, so a run is not a runaway', () => {
    const base = { result: 'win', roundsWon: 3, validAnswers: 3 } as const;
    const long = matchXp({ ...base, streak: 40 });
    const capped = matchXp({ ...base, streak: 6 });
    expect(long).toBe(capped);
  });

  it('never goes backwards', () => {
    for (let rounds = 0; rounds < 15; rounds++) {
      const here = matchXp({ result: 'win', roundsWon: rounds, validAnswers: rounds, streak: 1 });
      const more = matchXp({ result: 'win', roundsWon: rounds + 1, validAnswers: rounds + 1, streak: 1 });
      expect(more).toBeGreaterThan(here);
    }
  });
});

describe('levels', () => {
  it('starts everybody at level one with nothing banked', () => {
    const level = levelFor(0);
    expect(level.level).toBe(1);
    expect(level.into).toBe(0);
    expect(level.cost).toBe(BASE_LEVEL_COST);
  });

  it('gets harder by a fixed step rather than doubling', () => {
    expect(xpForLevel(2) - xpForLevel(1)).toBe(LEVEL_COST_STEP);
    expect(xpForLevel(9) - xpForLevel(8)).toBe(LEVEL_COST_STEP);
  });

  it('agrees with itself at every boundary', () => {
    for (let level = 1; level <= 200; level++) {
      const at = xpToReach(level);
      expect(levelFor(at).level).toBe(level);
      expect(levelFor(at).into).toBe(0);
      expect(levelFor(at - 1).level).toBe(level - 1 || 1);
      expect(levelFor(at + xpForLevel(level) - 1).level).toBe(level);
    }
  });

  it('is monotonic, and never reports more progress than a level holds', () => {
    let last = 1;
    for (let xp = 0; xp < 60_000; xp += 37) {
      const level = levelFor(xp);
      expect(level.level).toBeGreaterThanOrEqual(last);
      expect(level.into).toBeLessThan(level.cost);
      expect(level.progress).toBeLessThanOrEqual(1);
      last = level.level;
    }
  });

  it('shrugs off nonsense rather than reporting level zero', () => {
    expect(levelFor(-100).level).toBe(1);
    expect(levelFor(12.7).level).toBe(1);
  });
});

describe('ranks', () => {
  it('cuts every tier but the apex into divisions', () => {
    for (const tier of TIERS.slice(0, -1)) {
      const seen = new Set<number>();
      const top = TIERS[TIERS.indexOf(tier) + 1]!.floor;
      for (let rating = tier.floor; rating < top; rating++) {
        seen.add(rankFor(rating).division!);
      }
      expect(seen.size).toBe(DIVISIONS_PER_TIER);
    }
    expect(rankFor(TIERS[TIERS.length - 1]!.floor + 50).division).toBeNull();
  });

  it('numbers divisions so that I is the top of a tier', () => {
    const tier = TIERS[3]!;
    expect(rankFor(tier.floor).division).toBe(3);
    expect(rankFor(TIERS[4]!.floor - 1).division).toBe(1);
  });

  it('draws every boundary on a whole rating point', () => {
    for (let rating = 0; rating < 2600; rating += 3) {
      const rank = rankFor(rating);
      expect(Number.isInteger(rank.floor)).toBe(true);
      expect(Number.isInteger(rank.ceiling) || rank.ceiling === Infinity).toBe(true);
    }
  });

  it('never leaves a rating between two rungs', () => {
    for (let rating = 0; rating < 2600; rating += 7) {
      const rank = rankFor(rating);
      expect(rating).toBeGreaterThanOrEqual(rank.floor);
      expect(rating).toBeLessThan(rank.ceiling);
      expect(rank.progress).toBeGreaterThanOrEqual(0);
      expect(rank.progress).toBeLessThanOrEqual(1);
    }
  });

  it('says what the next rung costs, and stops at the very top', () => {
    const step = nextRank(STARTING_RATING);
    expect(step).not.toBeNull();
    expect(step!.pointsAway).toBeGreaterThan(0);
    expect(rankFor(STARTING_RATING + step!.pointsAway).label).toBe(step!.rank.label);
    expect(nextRank(9_999)).toBeNull();
  });

  it('warns about the drop before it happens, and not at the bottom', () => {
    const rank = rankFor(STARTING_RATING);
    const risk = demotionRisk(STARTING_RATING);
    expect(risk!.pointsAway).toBe(Math.ceil(STARTING_RATING - rank.floor));
    expect(demotionRisk(0)).toBeNull();
  });

  it('reports a move only when the label actually changed', () => {
    const rank = rankFor(STARTING_RATING);
    expect(rankMove(STARTING_RATING, STARTING_RATING + 1)).toBeNull();
    expect(rankMove(rank.floor, rank.floor - 1)).toBe('demoted');
    expect(rankMove(rank.ceiling - 1, rank.ceiling)).toBe('promoted');
  });
});
