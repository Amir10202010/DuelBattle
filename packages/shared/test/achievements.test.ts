import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  achievementOrder,
  getAchievement,
  newlyEarned,
  type AchievementProfile,
  type MatchSummary,
} from '../src/achievements.js';
import { STARTING_RATING } from '../src/rating.js';

const profile = (over: Partial<AchievementProfile> = {}): AchievementProfile => ({
  rating: STARTING_RATING,
  peakRating: STARTING_RATING,
  matchesPlayed: 1,
  wins: 0,
  losses: 1,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  xp: 0,
  ...over,
});

const match = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  result: 'loss',
  yourScore: 0,
  theirScore: 3,
  validAnswers: 0,
  roundsPlayed: 3,
  ratingBefore: STARTING_RATING,
  ratingAfter: STARTING_RATING - 12,
  opponentRating: STARTING_RATING,
  fastestWinMs: null,
  closestWinMs: null,
  wonByJudge: { auto: 0, peer: 0, ai: 0 },
  comeback: false,
  customRounds: 0,
  customWins: 0,
  seriesLength: 1,
  wentTheDistance: false,
  ...over,
});

describe('the catalogue', () => {
  it('has no duplicate ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('gives every one a name, a sentence and some XP', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(10);
      expect(a.description.endsWith('.')).toBe(true);
      expect(a.xp).toBeGreaterThan(0);
    }
  });

  it('pays more for the rarer ones', () => {
    const cheapest = (rarity: string) =>
      Math.min(...ACHIEVEMENTS.filter((a) => a.rarity === rarity).map((a) => a.xp));
    expect(cheapest('legendary')).toBeGreaterThan(cheapest('common'));
  });

  it('resolves by id', () => {
    expect(getAchievement('first-blood')?.name).toBe('First Blood');
    expect(getAchievement('no-such-thing')).toBeUndefined();
  });

  it('reports progress that never exceeds what it needs', () => {
    const veteran = profile({
      matchesPlayed: 5_000,
      wins: 5_000,
      bestStreak: 900,
      peakRating: 9_999,
    });
    for (const a of ACHIEVEMENTS) {
      const step = a.progress?.(veteran);
      if (!step) continue;
      expect(step.have).toBeLessThanOrEqual(step.need);
    }
  });
});

describe('earning them', () => {
  it('marks a first match and a first win at the right moment', () => {
    const first = newlyEarned({ profile: profile(), match: match() }, []);
    expect(first.map((a) => a.id)).toContain('opening-night');
    expect(first.map((a) => a.id)).not.toContain('first-blood');

    const won = newlyEarned(
      {
        profile: profile({ wins: 1, losses: 0, streak: 1, bestStreak: 1 }),
        match: match({ result: 'win' }),
      },
      ['opening-night'],
    );
    expect(won.map((a) => a.id)).toContain('first-blood');
  });

  it('never hands back something already held', () => {
    const held = ACHIEVEMENTS.map((a) => a.id);
    expect(
      newlyEarned({ profile: profile({ matchesPlayed: 999, wins: 999 }), match: match() }, held),
    ).toEqual([]);
  });

  it('reads a clean sheet off the score, not off the result alone', () => {
    const ids = (summary: MatchSummary) =>
      newlyEarned({ profile: profile({ wins: 1 }), match: summary }, []).map((a) => a.id);
    expect(ids(match({ result: 'win', yourScore: 3, theirScore: 0 }))).toContain('clean-sheet');
    expect(ids(match({ result: 'win', yourScore: 3, theirScore: 1 }))).not.toContain('clean-sheet');
    expect(ids(match({ result: 'loss', yourScore: 0, theirScore: 3 }))).not.toContain(
      'clean-sheet',
    );
  });

  it('requires three distinct categories in one match', () => {
    const both = match({ result: 'win', categories: ['color', 'motion', 'color'] });
    const all = match({ result: 'win', categories: ['color', 'motion', 'light'] });
    const ids = (m: MatchSummary) =>
      newlyEarned({ profile: profile(), match: m }, []).map((a) => a.id);
    expect(ids(both)).not.toContain('all-three');
    expect(ids(all)).toContain('all-three');
  });

  it('only calls it an upset when the gap was really there', () => {
    const ids = (opponentRating: number) =>
      newlyEarned(
        { profile: profile({ wins: 1 }), match: match({ result: 'win', opponentRating }) },
        [],
      ).map((a) => a.id);
    expect(ids(STARTING_RATING + 199)).not.toContain('giant-killer');
    expect(ids(STARTING_RATING + 200)).toContain('giant-killer');
  });

  it('measures the ladder against the peak, so a bad week cannot take a badge back', () => {
    const fallen = profile({ rating: 800, peakRating: 1500 });
    expect(newlyEarned({ profile: fallen, match: match() }, []).map((a) => a.id)).toContain(
      'clean-sweep',
    );
  });

  it('will not call three rounds flawless when only two were answered', () => {
    const ids = (validAnswers: number) =>
      newlyEarned({ profile: profile(), match: match({ roundsPlayed: 3, validAnswers }) }, []).map(
        (a) => a.id,
      );
    expect(ids(2)).not.toContain('flawless');
    expect(ids(3)).toContain('flawless');
  });
});

describe('ordering the grid', () => {
  it('puts what is held first and what is closest next', () => {
    const ordered = achievementOrder(profile({ matchesPlayed: 9, wins: 9 }), ['first-blood']);
    expect(ordered[0]!.id).toBe('first-blood');
    const regular = ordered.findIndex((a) => a.id === 'regular');
    const institution = ordered.findIndex((a) => a.id === 'institution');
    expect(regular).toBeLessThan(institution);
  });

  it('returns the whole catalogue, once each', () => {
    const ordered = achievementOrder(profile(), []);
    expect(ordered).toHaveLength(ACHIEVEMENTS.length);
    expect(new Set(ordered.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
