/**
 * Elo, and what a number out of it means to a player.
 *
 * Pure on purpose. The server is the only thing allowed to *write* a rating,
 * but the client shows what a win would be worth before you play it, and the
 * two must agree to the point — a preview that lies is worse than no preview.
 */

/** Where everybody starts. */
export const STARTING_RATING = 1000;

/** A rating never reads below this, so a bad week cannot bottom out. */
export const RATING_FLOOR = 100;

/** Matches before a rating is treated as settled rather than a guess. */
export const PLACEMENT_MATCHES = 5;

/**
 * How hard a result moves the number.
 *
 * Large while the rating is still finding you, so placement takes an evening
 * rather than a month. Small at the top, where the difference between 1800 and
 * 1820 should take actual work.
 */
export function kFactor(matchesPlayed: number, rating: number): number {
  if (matchesPlayed < 10) return 40;
  if (rating >= 1800) return 16;
  return 24;
}

/** The share of the match this rating is expected to take, 0..1. */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export type MatchResult = 'win' | 'loss' | 'draw';

function scoreOf(result: MatchResult): number {
  return result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
}

export interface RatingInput {
  rating: number;
  matchesPlayed: number;
}

/**
 * The rating after a result, rounded to a whole number.
 *
 * Rounding happens here rather than at the edges so that the change a player is
 * shown is exactly the change that was stored. Half-points drifting apart
 * between the screen and the file is the kind of bug nobody reports and
 * everybody notices.
 */
export function nextRating(
  player: RatingInput,
  opponent: RatingInput,
  result: MatchResult,
): number {
  const expected = expectedScore(player.rating, opponent.rating);
  const k = kFactor(player.matchesPlayed, player.rating);
  const moved = player.rating + k * (scoreOf(result) - expected);
  return Math.max(RATING_FLOOR, Math.round(moved));
}

/** What this result is worth, for showing before or after a match. */
export function ratingChange(
  player: RatingInput,
  opponent: RatingInput,
  result: MatchResult,
): number {
  return nextRating(player, opponent, result) - player.rating;
}

export interface Tier {
  /** Ascending. The tier a rating falls into is the last one it clears. */
  readonly floor: number;
  readonly name: string;
  /** One line, in the second person, for the profile card. */
  readonly blurb: string;
}

/**
 * The ladder.
 *
 * Named for what the game actually asks of you — knowing where things are and
 * getting to them first — rather than for metals, which say nothing and belong
 * to a different game.
 */
export const TIERS: readonly Tier[] = [
  { floor: 0, name: 'Still Looking', blurb: 'Everything is in the last place you check.' },
  { floor: 900, name: 'Rummager', blurb: 'You know which drawer, roughly.' },
  { floor: 1100, name: 'Quick Hands', blurb: 'You get there before you have finished reading.' },
  { floor: 1300, name: 'Room Reader', blurb: 'You knew where it was before the prompt did.' },
  { floor: 1500, name: 'Clean Sweep', blurb: 'Your room answers faster than you do.' },
  { floor: 1700, name: 'Untouchable', blurb: 'People check the scoreboard twice.' },
];

export function tierFor(rating: number): Tier {
  let found = TIERS[0]!;
  for (const tier of TIERS) if (rating >= tier.floor) found = tier;
  return found;
}

/** The next rung and what it costs, or null at the top. */
export function nextTier(rating: number): { tier: Tier; pointsAway: number } | null {
  const above = TIERS.find((t) => t.floor > rating);
  return above ? { tier: above, pointsAway: above.floor - rating } : null;
}

/** A rating is a guess until placement is done, and should be labelled as one. */
export function isPlaced(matchesPlayed: number): boolean {
  return matchesPlayed >= PLACEMENT_MATCHES;
}
