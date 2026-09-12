/**
 * XP and levels: the number that only ever goes up.
 *
 * A rating answers "who is better than whom", which means it has to be able to
 * fall, and a player who has just lost three in a row is looking at a screen
 * that says only that. XP answers a different question — "was that evening
 * worth anything" — and its answer is always yes. The two are deliberately not
 * interchangeable: nothing here feeds back into matchmaking or the ladder,
 * because an award for turning up must never become a way to buy rank.
 */

/** XP for finishing a match at all, win or lose. */
export const XP_PER_MATCH = 20;
/** On top of that, for winning it. */
export const XP_PER_WIN = 40;
/** For each round taken. Rewards the part of a losing match that went well. */
export const XP_PER_ROUND_WON = 8;
/** For each round you produced a valid answer in, won or not. */
export const XP_PER_VALID_ANSWER = 2;
/** Per consecutive win, capped, so a streak is worth defending. */
export const XP_PER_STREAK_STEP = 5;
export const XP_STREAK_CAP = 5;

/** What one finished match was worth, before achievements are added. */
export function matchXp(input: {
  result: 'win' | 'loss' | 'draw';
  roundsWon: number;
  validAnswers: number;
  /** Consecutive wins *after* this match. */
  streak: number;
}): number {
  const streakSteps = Math.min(XP_STREAK_CAP, Math.max(0, input.streak - 1));
  return (
    XP_PER_MATCH +
    (input.result === 'win' ? XP_PER_WIN : 0) +
    input.roundsWon * XP_PER_ROUND_WON +
    input.validAnswers * XP_PER_VALID_ANSWER +
    (input.result === 'win' ? streakSteps * XP_PER_STREAK_STEP : 0)
  );
}

/**
 * What the next level costs.
 *
 * Linear growth rather than exponential: a curve that doubles every level
 * turns level 20 into a second job, and this is a game two people play for
 * half an hour. Level 2 is one good match; level 30 is a habit.
 */
export const BASE_LEVEL_COST = 120;
export const LEVEL_COST_STEP = 40;

export function xpForLevel(level: number): number {
  return BASE_LEVEL_COST + (Math.max(1, level) - 1) * LEVEL_COST_STEP;
}

/** Total XP needed to *reach* a level, counting from level 1 at zero. */
export function xpToReach(level: number): number {
  const n = Math.max(1, level) - 1;
  // Sum of an arithmetic series, closed form so a level 400 profile is free.
  return n * BASE_LEVEL_COST + (n * (n - 1) * LEVEL_COST_STEP) / 2;
}

export interface Level {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level costs in total. */
  cost: number;
  /** 0..1 through the current level. */
  progress: number;
}

export function levelFor(totalXp: number): Level {
  const xp = Math.max(0, Math.floor(totalXp));
  // Invert the closed form rather than looping: xpToReach is a quadratic in n.
  const a = LEVEL_COST_STEP / 2;
  const b = BASE_LEVEL_COST - LEVEL_COST_STEP / 2;
  const n = Math.floor((-b + Math.sqrt(b * b + 4 * a * xp)) / (2 * a));
  // Floating point near a boundary can land a point either side; walk it back.
  let level = Math.max(1, n + 1);
  while (xpToReach(level) > xp) level--;
  while (xpToReach(level + 1) <= xp) level++;

  const into = xp - xpToReach(level);
  const cost = xpForLevel(level);
  return { level, into, cost, progress: cost > 0 ? Math.min(1, into / cost) : 0 };
}
