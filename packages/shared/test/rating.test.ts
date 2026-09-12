import { describe, expect, it } from 'vitest';
import {
  PLACEMENT_MATCHES,
  RATING_FLOOR,
  STARTING_RATING,
  TIERS,
  expectedScore,
  isPlaced,
  kFactor,
  nextRating,
  nextTier,
  ratingChange,
  tierFor,
} from '../src/rating.js';

const settled = (rating: number) => ({ rating, matchesPlayed: 50 });

describe('expectedScore', () => {
  it('is even between equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBe(0.5);
  });

  it('is the textbook 0.76 at a 200-point gap', () => {
    expect(expectedScore(1400, 1200)).toBeCloseTo(0.76, 2);
  });

  it('mirrors: what one expects to take, the other expects to lose', () => {
    expect(expectedScore(1400, 1100) + expectedScore(1100, 1400)).toBeCloseTo(1, 10);
  });
});

describe('nextRating', () => {
  it('splits the K-factor evenly when equals meet', () => {
    const before = settled(1200);
    expect(nextRating(before, settled(1200), 'win')).toBe(1212);
    expect(nextRating(before, settled(1200), 'loss')).toBe(1188);
    expect(nextRating(before, settled(1200), 'draw')).toBe(1200);
  });

  it('pays almost nothing for beating somebody far below', () => {
    // Farming a much weaker opponent is not a strategy; the maths says so.
    expect(ratingChange(settled(1600), settled(1000), 'win')).toBeLessThanOrEqual(1);
  });

  it('costs dearly to lose to them', () => {
    expect(ratingChange(settled(1600), settled(1000), 'loss')).toBeLessThan(-20);
  });

  it('pays well for an upset', () => {
    expect(ratingChange(settled(1000), settled(1600), 'win')).toBeGreaterThan(20);
  });

  it('is zero-sum between two players on the same footing', () => {
    const a = settled(1250);
    const b = settled(1180);
    expect(ratingChange(a, b, 'win') + ratingChange(b, a, 'loss')).toBe(0);
  });

  it('moves a new player faster than a settled one', () => {
    const rookie = { rating: STARTING_RATING, matchesPlayed: 0 };
    const veteran = { rating: STARTING_RATING, matchesPlayed: 50 };
    const opponent = settled(STARTING_RATING);
    expect(ratingChange(rookie, opponent, 'win')).toBeGreaterThan(
      ratingChange(veteran, opponent, 'win'),
    );
  });

  it('moves the top of the ladder slowest of all', () => {
    expect(kFactor(50, 1850)).toBeLessThan(kFactor(50, 1200));
  });

  it('never drops below the floor, however bad the week', () => {
    let rating = RATING_FLOOR + 5;
    for (let i = 0; i < 40; i++) {
      // Losing to somebody at your own level is what actually costs points.
      rating = nextRating({ rating, matchesPlayed: 100 }, settled(rating + 45), 'loss');
    }
    expect(rating).toBe(RATING_FLOOR);
  });

  it('cannot be ground down by somebody far above you', () => {
    // Elo says so before the floor has to: a loss you were never expected to
    // avoid is worth almost nothing, so a stronger player cannot bury you.
    let rating = 400;
    for (let i = 0; i < 40; i++) {
      rating = nextRating({ rating, matchesPlayed: 100 }, settled(1800), 'loss');
    }
    expect(rating).toBeGreaterThan(390);
  });

  it('returns whole numbers, so the change shown is the change stored', () => {
    for (let i = 0; i < 200; i++) {
      const mine = { rating: 800 + i * 4, matchesPlayed: i };
      const theirs = settled(1000 + ((i * 37) % 700));
      const after = nextRating(mine, theirs, i % 3 === 0 ? 'draw' : 'win');
      expect(Number.isInteger(after)).toBe(true);
      expect(after - mine.rating).toBe(ratingChange(mine, theirs, i % 3 === 0 ? 'draw' : 'win'));
    }
  });
});

describe('tiers', () => {
  it('starts everybody with room to fall as well as room to climb', () => {
    // Deliberate: a new player lands partway up rather than one step off the
    // bottom. A ladder whose only direction is up is a progress bar.
    const start = TIERS.indexOf(tierFor(STARTING_RATING));
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(TIERS.length - 1);
    expect(tierFor(0).name).toBe(TIERS[0]!.name);
  });

  it('is ordered, with no gaps and no overlaps', () => {
    for (let i = 1; i < TIERS.length; i++) {
      expect(TIERS[i]!.floor).toBeGreaterThan(TIERS[i - 1]!.floor);
    }
    // Every rating from the floor to well past the top lands somewhere.
    for (let rating = 0; rating < 2600; rating += 13) {
      const tier = tierFor(rating);
      expect(rating).toBeGreaterThanOrEqual(tier.floor);
    }
  });

  it('picks the highest tier a rating clears, not the first', () => {
    const top = TIERS[TIERS.length - 1]!;
    expect(tierFor(top.floor + 500).name).toBe(top.name);
  });

  it('says how far the next rung is, and stops at the top', () => {
    const step = nextTier(TIERS[0]!.floor);
    expect(step?.tier.name).toBe(TIERS[1]!.name);
    expect(step?.pointsAway).toBe(TIERS[1]!.floor);
    expect(nextTier(TIERS[TIERS.length - 1]!.floor + 1)).toBeNull();
  });

  it('gives every tier something to read', () => {
    for (const tier of TIERS) {
      expect(tier.name.length).toBeGreaterThan(0);
      expect(tier.blurb.length).toBeGreaterThan(0);
      expect(tier.blurb.length).toBeLessThanOrEqual(60);
    }
  });
});

describe('placement', () => {
  it('treats a rating as a guess until enough matches are in', () => {
    expect(isPlaced(PLACEMENT_MATCHES - 1)).toBe(false);
    expect(isPlaced(PLACEMENT_MATCHES)).toBe(true);
  });
});
