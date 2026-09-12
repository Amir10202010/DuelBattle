/**
 * What the game notices.
 *
 * Two rules kept this list short. Nothing is here that a player cannot picture
 * themselves doing — "win a round in under three seconds" is a thing that
 * happens to you, "play 1,000 matches" is a chore with a badge on it. And
 * nothing is here that the server cannot actually establish from a finished
 * match, because an achievement that unlocks on a guess is worse than no
 * achievement.
 *
 * Every rule is a pure function of a settled profile and one match summary, so
 * the same catalogue draws the locked ones with a progress bar on the client
 * and awards the unlocked ones on the server. There is exactly one list.
 */

import { TIERS } from './rating.js';

export type AchievementGroup = 'first' | 'habit' | 'streak' | 'dominance' | 'craft' | 'ladder';

/** How often this is expected to turn up. Drives nothing but how it is drawn. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';

/** The parts of a record an achievement is allowed to read. */
export interface AchievementProfile {
  rating: number;
  peakRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  xp: number;
}

/** One finished match, from one player's side of it. */
export interface MatchSummary {
  result: 'win' | 'loss' | 'draw';
  yourScore: number;
  theirScore: number;
  /** Rounds in which you produced an answer the judge accepted. */
  validAnswers: number;
  roundsPlayed: number;
  ratingBefore: number;
  ratingAfter: number;
  opponentRating: number;
  /** Your fastest round-winning answer this match, in milliseconds. */
  fastestWinMs: number | null;
  /** The narrowest margin you won a round by, in milliseconds. */
  closestWinMs: number | null;
  /** Rounds you took, split by who decided them. */
  wonByJudge: { auto: number; peer: number; ai: number };
  /** You were two rounds down at some point and still took the match. */
  comeback: boolean;
  /** Rounds played from a prompt somebody in the room wrote. */
  customRounds: number;
  /** Rounds you won from a prompt somebody in the room wrote. */
  customWins: number;
  /** Matches played back to back in this room, this one included. */
  seriesLength: number;
  /** The match ran to the round cap rather than being won outright. */
  wentTheDistance: boolean;
}

export interface AchievementContext {
  /** The record as it stands *after* the match has been written into it. */
  profile: AchievementProfile;
  match: MatchSummary;
}

export interface Achievement {
  readonly id: string;
  readonly name: string;
  /** Written as the thing you did, not as an instruction. */
  readonly description: string;
  readonly group: AchievementGroup;
  readonly rarity: Rarity;
  /** Added to the player's XP the moment it unlocks. */
  readonly xp: number;
  /** Whether this match earns it. */
  readonly earned: (ctx: AchievementContext) => boolean;
  /**
   * How far along a locked one is, when it is the kind of thing that counts up.
   * Present so the client can draw a bar instead of a question mark.
   */
  readonly progress?: (profile: AchievementProfile) => { have: number; need: number };
}

const counter = (
  need: number,
  read: (p: AchievementProfile) => number,
): Pick<Achievement, 'earned' | 'progress'> => ({
  earned: ({ profile }) => read(profile) >= need,
  progress: (profile) => ({ have: Math.min(need, read(profile)), need }),
});

const tierNamed = (name: string): number =>
  TIERS.find((t) => t.name === name)?.floor ?? Number.POSITIVE_INFINITY;

const reachedTier = (name: string): Pick<Achievement, 'earned' | 'progress'> => ({
  earned: ({ profile }) => profile.peakRating >= tierNamed(name),
  progress: (profile) => ({ have: Math.min(tierNamed(name), profile.peakRating), need: tierNamed(name) }),
});

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ---- First steps: the first hour, acknowledged. ----
  {
    id: 'opening-night',
    name: 'Opening Night',
    description: 'Finished your first match.',
    group: 'first',
    rarity: 'common',
    xp: 25,
    ...counter(1, (p) => p.matchesPlayed),
  },
  {
    id: 'first-blood',
    name: 'First Blood',
    description: 'Won your first match.',
    group: 'first',
    rarity: 'common',
    xp: 50,
    ...counter(1, (p) => p.wins),
  },
  {
    id: 'placed',
    name: 'Placed',
    description: 'Played out placement. The number means something now.',
    group: 'first',
    rarity: 'common',
    xp: 75,
    ...counter(5, (p) => p.matchesPlayed),
  },

  // ---- Habit: volume, kept to three so it stays a nod rather than a treadmill. ----
  {
    id: 'regular',
    name: 'Regular',
    description: 'Ten matches played.',
    group: 'habit',
    rarity: 'common',
    xp: 60,
    ...counter(10, (p) => p.matchesPlayed),
  },
  {
    id: 'fixture',
    name: 'Fixture',
    description: 'Fifty matches played.',
    group: 'habit',
    rarity: 'uncommon',
    xp: 150,
    ...counter(50, (p) => p.matchesPlayed),
  },
  {
    id: 'institution',
    name: 'Institution',
    description: 'Two hundred matches played.',
    group: 'habit',
    rarity: 'rare',
    xp: 400,
    ...counter(200, (p) => p.matchesPlayed),
  },
  {
    id: 'winning-habit',
    name: 'Winning Habit',
    description: 'Ten matches won.',
    group: 'habit',
    rarity: 'common',
    xp: 80,
    ...counter(10, (p) => p.wins),
  },
  {
    id: 'serial-winner',
    name: 'Serial Winner',
    description: 'Fifty matches won.',
    group: 'habit',
    rarity: 'rare',
    xp: 300,
    ...counter(50, (p) => p.wins),
  },

  // ---- Streaks. ----
  {
    id: 'hat-trick',
    name: 'Hat Trick',
    description: 'Three matches in a row.',
    group: 'streak',
    rarity: 'common',
    xp: 60,
    ...counter(3, (p) => p.bestStreak),
  },
  {
    id: 'on-a-tear',
    name: 'On A Tear',
    description: 'Five in a row.',
    group: 'streak',
    rarity: 'uncommon',
    xp: 120,
    ...counter(5, (p) => p.bestStreak),
  },
  {
    id: 'unbeaten',
    name: 'Unbeaten',
    description: 'Ten in a row, without losing one.',
    group: 'streak',
    rarity: 'legendary',
    xp: 350,
    ...counter(10, (p) => p.bestStreak),
  },

  // ---- Dominance: how a match was won, not how many. ----
  {
    id: 'clean-sheet',
    name: 'Clean Sheet',
    description: 'Won a match without conceding a single round.',
    group: 'dominance',
    rarity: 'uncommon',
    xp: 100,
    earned: ({ match }) => match.result === 'win' && match.theirScore === 0,
  },
  {
    id: 'the-long-one',
    name: 'The Long One',
    description: 'Won a first-to-five without dropping a round.',
    group: 'dominance',
    rarity: 'legendary',
    xp: 250,
    earned: ({ match }) => match.result === 'win' && match.yourScore >= 5 && match.theirScore === 0,
  },
  {
    id: 'comeback',
    name: 'The Comeback',
    description: 'Went two rounds down and won anyway.',
    group: 'dominance',
    rarity: 'rare',
    xp: 150,
    earned: ({ match }) => match.result === 'win' && match.comeback,
  },
  {
    id: 'distance',
    name: 'Went The Distance',
    description: 'Won a match that used every round it had.',
    group: 'dominance',
    rarity: 'uncommon',
    xp: 100,
    earned: ({ match }) => match.result === 'win' && match.wentTheDistance,
  },
  {
    id: 'giant-killer',
    name: 'Giant Killer',
    description: 'Beat somebody rated two hundred points above you.',
    group: 'dominance',
    rarity: 'rare',
    xp: 200,
    earned: ({ match }) =>
      match.result === 'win' && match.opponentRating - match.ratingBefore >= 200,
  },

  // ---- Craft: the things that take hands rather than patience. ----
  {
    id: 'quickdraw',
    name: 'Quickdraw',
    description: 'Won a round in under three seconds.',
    group: 'craft',
    rarity: 'uncommon',
    xp: 100,
    earned: ({ match }) => match.fastestWinMs !== null && match.fastestWinMs < 3_000,
  },
  {
    id: 'photo-finish',
    name: 'Photo Finish',
    description: 'Took a round by less than a tenth of a second.',
    group: 'craft',
    rarity: 'rare',
    xp: 150,
    earned: ({ match }) => match.closestWinMs !== null && match.closestWinMs < 100,
  },
  {
    id: 'flawless',
    name: 'Flawless',
    description: 'Answered every round of a match, and every answer counted.',
    group: 'craft',
    rarity: 'rare',
    xp: 150,
    earned: ({ match }) => match.roundsPlayed >= 3 && match.validAnswers === match.roundsPlayed,
  },
  {
    id: 'jury-of-one',
    name: 'Jury Of One',
    description: 'Won a round your opponent had to approve themselves.',
    group: 'craft',
    rarity: 'common',
    xp: 50,
    earned: ({ match }) => match.wonByJudge.peer > 0,
  },
  {
    id: 'machine-approved',
    name: 'Machine Approved',
    description: 'Won a round the AI referee decided.',
    group: 'craft',
    rarity: 'uncommon',
    xp: 80,
    earned: ({ match }) => match.wonByJudge.ai > 0,
  },
  {
    id: 'all-three',
    name: 'All Three Referees',
    description: 'Won a round under each of the three judges, in one match.',
    group: 'craft',
    rarity: 'legendary',
    xp: 250,
    earned: ({ match }) =>
      match.wonByJudge.auto > 0 && match.wonByJudge.peer > 0 && match.wonByJudge.ai > 0,
  },
  {
    id: 'house-rules',
    name: 'House Rules',
    description: 'Won a round somebody in the room made up.',
    group: 'craft',
    rarity: 'uncommon',
    xp: 80,
    earned: ({ match }) => match.customWins > 0,
  },
  {
    id: 'best-of-the-night',
    name: 'Best Of The Night',
    description: 'Took a third match in a row against the same opponent.',
    group: 'craft',
    rarity: 'rare',
    xp: 150,
    earned: ({ match }) => match.result === 'win' && match.seriesLength >= 3,
  },

  // ---- The ladder itself. ----
  {
    id: 'room-reader',
    name: 'Room Reader',
    description: 'Climbed to Room Reader.',
    group: 'ladder',
    rarity: 'uncommon',
    xp: 120,
    ...reachedTier('Room Reader'),
  },
  {
    id: 'clean-sweep',
    name: 'Clean Sweep',
    description: 'Climbed to Clean Sweep.',
    group: 'ladder',
    rarity: 'rare',
    xp: 200,
    ...reachedTier('Clean Sweep'),
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Climbed to Untouchable.',
    group: 'ladder',
    rarity: 'legendary',
    xp: 400,
    ...reachedTier('Untouchable'),
  },
  {
    id: 'household-name',
    name: 'Household Name',
    description: 'Reached the top of the ladder.',
    group: 'ladder',
    rarity: 'legendary',
    xp: 600,
    ...reachedTier('Household Name'),
  },
];

export const ACHIEVEMENTS_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export function getAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS_BY_ID.get(id);
}

/** Total XP on the table, for the achievements page to quote honestly. */
export const TOTAL_ACHIEVEMENT_XP = ACHIEVEMENTS.reduce((sum, a) => sum + a.xp, 0);

/**
 * Which achievements this match just earned.
 *
 * Only ever adds. Anything already unlocked is skipped rather than re-tested,
 * so a rule that gets stricter later cannot take a badge back off somebody who
 * genuinely earned it under the old one.
 */
export function newlyEarned(
  ctx: AchievementContext,
  already: readonly string[],
): Achievement[] {
  const held = new Set(already);
  return ACHIEVEMENTS.filter((a) => !held.has(a.id) && a.earned(ctx));
}

/** Ordering for the grid: unlocked first, then closest to unlocking. */
export function achievementOrder(
  profile: AchievementProfile,
  unlocked: readonly string[],
): Achievement[] {
  const held = new Set(unlocked);
  const share = (a: Achievement): number => {
    if (held.has(a.id)) return 2;
    const step = a.progress?.(profile);
    return step && step.need > 0 ? step.have / step.need : 0;
  };
  return [...ACHIEVEMENTS].sort((a, b) => share(b) - share(a));
}
