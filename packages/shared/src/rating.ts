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
 *
 * Eight rungs rather than six, and a new player lands on the third of them.
 * That is the point of the shape: starting one step off the bottom means the
 * only direction with any room in it is up, and a ladder you cannot fall down
 * is a progress bar wearing a costume.
 */
export const TIERS: readonly Tier[] = [
  { floor: 0, name: 'Still Looking', blurb: 'Everything is in the last place you check.' },
  { floor: 700, name: 'Rummager', blurb: 'You know which drawer, roughly.' },
  { floor: 900, name: 'Quick Hands', blurb: 'You get there before you have finished reading.' },
  { floor: 1100, name: 'Room Reader', blurb: 'You knew where it was before the prompt did.' },
  { floor: 1300, name: 'Clean Sweep', blurb: 'Your room answers faster than you do.' },
  { floor: 1500, name: 'Sleight of Hand', blurb: 'Nobody quite sees you reach for it.' },
  { floor: 1700, name: 'Untouchable', blurb: 'People check the scoreboard twice.' },
  { floor: 1900, name: 'Household Name', blurb: 'Your room has a reputation of its own.' },
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

/**
 * Divisions inside a tier.
 *
 * Eight tiers alone is a promotion every few hundred points, which on a good
 * evening is nothing at all and on a bad month is out of sight. Thirds give
 * every rating a rung it is actually standing on and one it can see from
 * there — III at the bottom, I at the top, the way every ladder that has ever
 * worked is numbered.
 */
export const DIVISIONS_PER_TIER = 3;

/** Where the apex tier is drawn to, since it has no ceiling of its own. */
const APEX_SPAN = 300;

export interface Rank {
  tier: Tier;
  /** 1 is the top of the tier, 3 the bottom. Null in the apex, which has none. */
  division: 1 | 2 | 3 | null;
  /** "Room Reader II", or "Household Name" at the apex. */
  label: string;
  /** Rating at which this rung begins. */
  floor: number;
  /** Rating at which the next rung begins; Infinity at the very top. */
  ceiling: number;
  /** How far through this rung the rating is, 0..1. */
  progress: number;
}

const NUMERALS = ['I', 'II', 'III'] as const;

function tierCeiling(tier: Tier): number {
  const above = TIERS.find((t) => t.floor > tier.floor);
  return above ? above.floor : tier.floor + APEX_SPAN;
}

function isApex(tier: Tier): boolean {
  return tier.floor === TIERS[TIERS.length - 1]!.floor;
}

/**
 * The exact rung a rating is standing on.
 *
 * Everything a rank badge, a progress bar or a promotion line needs comes from
 * here, so none of them can disagree about where somebody is.
 */
/**
 * Where each division inside a tier begins, as whole rating points.
 *
 * Rounded rather than divided, because a boundary is a number a player reads:
 * "34 to Quick Hands I" has to mean that gaining 34 points promotes you, and a
 * ceiling of 1033.333 makes that sentence false by a third of a point. Integer
 * boundaries also keep the arithmetic exact, which is what stops a rating
 * sitting exactly on a line from landing on the wrong side of it.
 */
function divisionBounds(tier: Tier): number[] {
  const span = tierCeiling(tier) - tier.floor;
  return Array.from({ length: DIVISIONS_PER_TIER + 1 }, (_, i) =>
    Math.round((span * i) / DIVISIONS_PER_TIER),
  );
}

export function rankFor(rating: number): Rank {
  const tier = tierFor(rating);

  if (isApex(tier)) {
    return {
      tier,
      division: null,
      label: tier.name,
      floor: tier.floor,
      ceiling: Number.POSITIVE_INFINITY,
      progress: Math.min(1, Math.max(0, (rating - tier.floor) / APEX_SPAN)),
    };
  }

  const bounds = divisionBounds(tier);
  const into = rating - tier.floor;
  let step = 0;
  for (let i = 0; i < DIVISIONS_PER_TIER; i++) if (into >= bounds[i]!) step = i;

  const floor = tier.floor + bounds[step]!;
  const ceiling = tier.floor + bounds[step + 1]!;
  const division = (DIVISIONS_PER_TIER - step) as 1 | 2 | 3;

  return {
    tier,
    division,
    label: `${tier.name} ${NUMERALS[division - 1]}`,
    floor,
    ceiling,
    progress: ceiling > floor ? Math.min(1, Math.max(0, (rating - floor) / (ceiling - floor))) : 0,
  };
}

/** The rung above this one and what it costs, or null at the very top. */
export function nextRank(rating: number): { rank: Rank; pointsAway: number } | null {
  const here = rankFor(rating);
  if (!Number.isFinite(here.ceiling)) return null;
  return { rank: rankFor(here.ceiling), pointsAway: Math.max(1, Math.ceil(here.ceiling - rating)) };
}

/**
 * How close the drop is.
 *
 * There is no hidden shield and no grace matches: the rung you are on is the
 * rung your rating clears, both ways. What the game owes a player instead is
 * warning, which is what this is for — a number on screen before the match
 * rather than a demotion they did not see coming.
 */
export function demotionRisk(rating: number): { rank: Rank; pointsAway: number } | null {
  const here = rankFor(rating);
  if (here.floor <= 0) return null;
  return { rank: rankFor(here.floor - 1), pointsAway: Math.max(0, Math.ceil(rating - here.floor)) };
}

/** Whether a result moved somebody between rungs, and which way. */
export function rankMove(before: number, after: number): 'promoted' | 'demoted' | null {
  const from = rankFor(before);
  const to = rankFor(after);
  if (from.label === to.label) return null;
  return to.floor > from.floor ? 'promoted' : 'demoted';
}

/** A rating is a guess until placement is done, and should be labelled as one. */
export function isPlaced(matchesPlayed: number): boolean {
  return matchesPlayed >= PLACEMENT_MATCHES;
}
