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
  /** What this match was, from this player's side of it. */
  result: MatchResult;
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

  const earned = summary.forfeited
    ? []
    : newlyEarned({ profile: settled, match: summary }, settled.achievements);
  const xp =
    matchXp({
      result,
      roundsWon: scores.mine,
      validAnswers: contestant.summary.validAnswers,
      streak,
    }) + earned.reduce((sum, a) => sum + a.xp, 0);
  const today = new Date(at).toISOString().slice(0, 10);
  const dailyBonus =
    summary.forfeited ||
    profile.history.some(
      (r) => (r.dailyBonus ?? 0) > 0 && new Date(r.at).toISOString().slice(0, 10) === today,
    )
      ? 0
      : 75;
  const totalXp = summary.forfeited ? 0 : xp + dailyBonus;

  const levelBefore = levelFor(settled.xp).level;
  const levelAfter = levelFor(settled.xp + totalXp).level;

  const record: MatchRecord = {
    mode: 'ranked',
    forfeited: summary.forfeited ?? false,
    topicIds: summary.topicIds ?? [],
    at,
    opponentName: opponent.name,
    result,
    ratingBefore: before,
    ratingAfter: after,
    yourScore: scores.mine,
    theirScore: scores.theirs,
    xp: totalXp,
    dailyBonus,
    categories: contestant.summary.categories ?? [],
  };

  const updated: PlayerProfile = {
    ...settled,
    xp: settled.xp + totalXp,
    achievements: [...settled.achievements, ...earned.map((a) => a.id)],
    history: [record, ...profile.history].slice(0, HISTORY_KEPT),
  };

  return {
    profile: updated,
    result,
    before,
    after,
    change: after - before,
    rewards: {
      xp: totalXp,
      dailyBonus,
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
  matchId?: string,
  winnerOverride?: string,
): Record<string, RatingUpdate> {
  if (
    a.id === b.id ||
    !Number.isInteger(a.score) ||
    !Number.isInteger(b.score) ||
    a.score < 0 ||
    b.score < 0
  ) {
    throw new Error('Invalid match contestants');
  }
  const settle = () => {
    if (matchId && store.claimMatch && !store.claimMatch(matchId, a.id, b.id, at)) return {};
    const before = (who: Contestant): PlayerProfile => ({
      ...(store.get(who.id) ?? blankProfile(who.id, at)),
      name: who.name,
      ...(store.rankedPage
        ? { previousPosition: store.rankedPage('rating', who.id, 0, 0).own?.position ?? 0 }
        : {}),
    });

    const profileA = before(a);
    const profileB = before(b);

    if (winnerOverride && winnerOverride !== a.id && winnerOverride !== b.id)
      throw new Error('Invalid winner');
    const updateA = advance(
      profileA,
      profileB,
      a,
      winnerOverride ? (winnerOverride === a.id ? 'win' : 'loss') : resultOf(a.score, b.score),
      { mine: a.score, theirs: b.score },
      at,
    );
    const updateB = advance(
      profileB,
      profileA,
      b,
      winnerOverride ? (winnerOverride === b.id ? 'win' : 'loss') : resultOf(b.score, a.score),
      { mine: b.score, theirs: a.score },
      at,
    );

    store.save(updateA.profile);
    store.save(updateB.profile);
    if (matchId && store.rewardMatch) {
      updateA.rewards.coins = store.rewardMatch(a.id, matchId, updateA.rewards, at);
      updateB.rewards.coins = store.rewardMatch(b.id, matchId, updateB.rewards, at);
    }
    return { [a.id]: updateA, [b.id]: updateB };
  };
  return store.transaction ? store.transaction(settle) : settle();
}

/** Consecutive wins at the top of a history, whatever mode each match was. */
function historyStreak(history: readonly MatchRecord[]): number {
  let streak = 0;
  for (const record of history) {
    if (record.result !== 'win') break;
    streak++;
  }
  return streak;
}

export interface CasualUpdate extends RatingUpdate {
  /** False when the daily ceiling or the per-pair limit held this one back. */
  rewarded: boolean;
  /** Consecutive wins across both modes, for the quest boards. */
  anyStreak: number;
}

/**
 * Writes a finished casual match into both records.
 *
 * The rating does not move and placement does not advance — a casual match is
 * allowed to be careless, and a ladder that listened to careless matches would
 * be measuring the wrong thing. Everything else a match is worth still lands:
 * XP, a few coins, a line in the history. The two limits are what keep that
 * honest: five paid matches a day between the same two accounts, and a daily
 * ceiling per account, past which a match still counts but pays nothing.
 */
export function recordCasual(
  store: ProfileStore,
  a: Contestant,
  b: Contestant,
  at: number,
  matchId: string,
  winnerOverride?: string,
): Record<string, CasualUpdate> {
  if (a.id === b.id || !Number.isInteger(a.score) || !Number.isInteger(b.score) || a.score < 0 || b.score < 0)
    throw new Error('Invalid match contestants');
  if (winnerOverride && winnerOverride !== a.id && winnerOverride !== b.id)
    throw new Error('Invalid winner');
  const settle = () => {
    const pairOk = store.claimCasual ? store.claimCasual(matchId, a.id, b.id, at) : true;
    if (pairOk === null) return {};
    const profiles = new Map([a, b].map((who) => [who.id, { ...(store.get(who.id) ?? blankProfile(who.id, at)), name: who.name }]));
    const out: Record<string, CasualUpdate> = {};
    for (const [me, them] of [[a, b], [b, a]] as const) {
      const profile = profiles.get(me.id)!;
      const opponent = profiles.get(them.id)!;
      const result = winnerOverride ? (winnerOverride === me.id ? 'win' : 'loss') : resultOf(me.score, them.score);
      const rewarded = pairOk && (store.casualAllowance ? store.casualAllowance(me.id, at) : true);
      const xp = rewarded && !me.summary.forfeited
        ? matchXp({ result, roundsWon: me.score, validAnswers: me.summary.validAnswers, streak: 0 })
        : 0;
      const record: MatchRecord = {
        mode: 'casual',
        forfeited: me.summary.forfeited ?? false,
        topicIds: me.summary.topicIds ?? [],
        at,
        opponentName: opponent.name,
        result,
        ratingBefore: profile.rating,
        ratingAfter: profile.rating,
        yourScore: me.score,
        theirScore: them.score,
        xp,
        categories: me.summary.categories ?? [],
      };
      const levelBefore = levelFor(profile.xp).level;
      const updated: PlayerProfile = {
        ...profile,
        xp: profile.xp + xp,
        casualPlayed: (profile.casualPlayed ?? 0) + 1,
        casualWins: (profile.casualWins ?? 0) + (result === 'win' ? 1 : 0),
        lastSeenAt: at,
        history: [record, ...profile.history].slice(0, HISTORY_KEPT),
      };
      store.save(updated);
      const rewards: MatchRewards = {
        xp,
        casual: true,
        levelBefore,
        levelAfter: levelFor(updated.xp).level,
        unlocked: [],
        rankMove: null,
      };
      if (rewarded && xp > 0 && store.rewardCasual) rewards.coins = store.rewardCasual(me.id, matchId, rewards, result === 'win', at);
      out[me.id] = {
        profile: updated,
        result,
        before: profile.rating,
        after: profile.rating,
        change: 0,
        rewards,
        rewarded: rewarded && xp > 0,
        anyStreak: historyStreak(updated.history),
      };
    }
    return out;
  };
  return store.transaction ? store.transaction(settle) : settle();
}

/** Reads a profile without creating one, for showing a card before a match. */
export function profileFor(
  store: ProfileStore,
  id: string,
  name: string,
  at: number,
): PlayerProfile {
  const existing = store.get(id);
  return existing
    ? { ...existing, name: name || existing.name }
    : { ...blankProfile(id, at), name };
}
