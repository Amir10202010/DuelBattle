import {
  levelFor,
  matchXp,
  newlyEarned,
  nextRating,
  rankMove,
  type MatchRecord,
  type MatchResult,
  type MatchRewards,
  type MatchSummary,
} from '@battle/shared';
import { HISTORY_KEPT, blankProfile, type PlayerProfile, type ProfileStore } from './profiles.js';

export interface Contestant {
  id: string;
  name: string;
  /** Rounds won in the match just finished. */
  score: number;
  /** Everything the match did, from this player's side of it. */
  summary: Omit<MatchSummary, 'ratingBefore' | 'ratingAfter' | 'opponentRating' | 'result'>;
}

export interface RatingUpdate {
  profile: PlayerProfile;
  before: number;
  after: number;
  /** Signed, and exactly what the player is shown. */
  change: number;
  /** XP, levels and badges. Separate from the rating on purpose. */
  rewards: MatchRewards;
}

/**
 * A match with nothing remarkable in it.
 *
 * Every field here is something an achievement might ask about, so the default
 * has to be the answer "no": no fast round, no comeback, no prompt anybody
 * wrote. A caller that has a real match hands one over instead.
 */
export function plainSummary(
  scores: { yourScore: number; theirScore: number } = { yourScore: 0, theirScore: 0 },
): Contestant['summary'] {
  return {
    yourScore: scores.yourScore,
    theirScore: scores.theirScore,
    validAnswers: 0,
    roundsPlayed: scores.yourScore + scores.theirScore,
    fastestWinMs: null,
    closestWinMs: null,
    wonByJudge: { auto: 0, peer: 0, ai: 0 },
    comeback: false,
    customRounds: 0,
    customWins: 0,
    seriesLength: 1,
    wentTheDistance: false,
  };
}

function resultOf(mine: number, theirs: number): MatchResult {
  return mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
}

/**
 * Writes one result into one record.
 *
 * The order here is the order a player experiences it: the rating moves, the
 * counters follow, and only then are XP and achievements worked out — because
 * both are questions about the record *after* the match, and asking them a line
 * earlier is how "win your tenth match" unlocks on the ninth.
 */
function advance(
  profile: PlayerProfile,
  opponent: PlayerProfile,
  contestant: Contestant,
  result: MatchResult,
  scores: { mine: number; theirs: number },
  at: number,
): RatingUpdate {
  const before = profile.rating;
  const after = nextRating(profile, opponent, result);
  const streak = result === 'win' ? profile.streak + 1 : 0;

  const settled: PlayerProfile = {
    ...profile,
    rating: after,
    peakRating: Math.max(profile.peakRating, after),
    matchesPlayed: profile.matchesPlayed + 1,
    wins: profile.wins + (result === 'win' ? 1 : 0),
    losses: profile.losses + (result === 'loss' ? 1 : 0),
    draws: profile.draws + (result === 'draw' ? 1 : 0),
    streak,
    bestStreak: Math.max(profile.bestStreak, streak),
    lastSeenAt: at,
  };

  const summary: MatchSummary = {
    ...contestant.summary,
    result,
    ratingBefore: before,
    ratingAfter: after,
    opponentRating: opponent.rating,
  };

  const earned = newlyEarned({ profile: settled, match: summary }, settled.achievements);
  const xp =
    matchXp({
      result,
      roundsWon: scores.mine,
      validAnswers: contestant.summary.validAnswers,
      streak,
    }) + earned.reduce((sum, a) => sum + a.xp, 0);

  const levelBefore = levelFor(settled.xp).level;
  const levelAfter = levelFor(settled.xp + xp).level;

  const record: MatchRecord = {
    at,
    opponentName: opponent.name,
    result,
    ratingBefore: before,
    ratingAfter: after,
    yourScore: scores.mine,
    theirScore: scores.theirs,
    xp,
  };

  const updated: PlayerProfile = {
    ...settled,
    xp: settled.xp + xp,
    achievements: [...settled.achievements, ...earned.map((a) => a.id)],
    history: [record, ...profile.history].slice(0, HISTORY_KEPT),
  };

  return {
    profile: updated,
    before,
    after,
    change: after - before,
    rewards: {
      xp,
      levelBefore,
      levelAfter,
      unlocked: earned.map((a) => a.id),
      rankMove: rankMove(before, after),
    },
  };
}

/**
 * Writes a finished match into both players' records.
 *
 * Both ratings are computed against the *same* snapshot of the other. Updating
 * one and then feeding the new number into the other's calculation would make
 * the exchange lopsided by a point or two, and which way it leaned would
 * depend on nothing more principled than argument order.
 */
export function recordMatch(
  store: ProfileStore,
  a: Contestant,
  b: Contestant,
  at: number,
): Record<string, RatingUpdate> {
  const before = (who: Contestant): PlayerProfile => ({
    ...(store.get(who.id) ?? blankProfile(who.id, at)),
    name: who.name,
  });

  const profileA = before(a);
  const profileB = before(b);

  const updateA = advance(profileA, profileB, a, resultOf(a.score, b.score), { mine: a.score, theirs: b.score }, at);
  const updateB = advance(profileB, profileA, b, resultOf(b.score, a.score), { mine: b.score, theirs: a.score }, at);

  store.save(updateA.profile);
  store.save(updateB.profile);
  return { [a.id]: updateA, [b.id]: updateB };
}

/** Reads a profile without creating one, for showing a card before a match. */
export function profileFor(store: ProfileStore, id: string, name: string, at: number): PlayerProfile {
  const existing = store.get(id);
  return existing ? { ...existing, name: name || existing.name } : { ...blankProfile(id, at), name };
}
