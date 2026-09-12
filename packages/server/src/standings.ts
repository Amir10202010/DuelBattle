import { nextRating, type MatchResult } from '@battle/shared';
import { HISTORY_KEPT, blankProfile, type PlayerProfile, type ProfileStore } from './profiles.js';

export interface Contestant {
  id: string;
  name: string;
  /** Rounds won in the match just finished. */
  score: number;
}

export interface RatingUpdate {
  profile: PlayerProfile;
  before: number;
  after: number;
  /** Signed, and exactly what the player is shown. */
  change: number;
}

function resultOf(mine: number, theirs: number): MatchResult {
  return mine > theirs ? 'win' : mine < theirs ? 'loss' : 'draw';
}

function advance(
  profile: PlayerProfile,
  opponent: PlayerProfile,
  result: MatchResult,
  scores: { mine: number; theirs: number },
  at: number,
): RatingUpdate {
  const before = profile.rating;
  const after = nextRating(profile, opponent, result);
  const streak = result === 'win' ? profile.streak + 1 : 0;

  const record = {
    at,
    opponentName: opponent.name,
    result,
    ratingBefore: before,
    ratingAfter: after,
    yourScore: scores.mine,
    theirScore: scores.theirs,
  };

  const updated: PlayerProfile = {
    ...profile,
    rating: after,
    matchesPlayed: profile.matchesPlayed + 1,
    wins: profile.wins + (result === 'win' ? 1 : 0),
    losses: profile.losses + (result === 'loss' ? 1 : 0),
    draws: profile.draws + (result === 'draw' ? 1 : 0),
    streak,
    bestStreak: Math.max(profile.bestStreak, streak),
    lastSeenAt: at,
    history: [record, ...profile.history].slice(0, HISTORY_KEPT),
  };

  return { profile: updated, before, after, change: after - before };
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

  const updateA = advance(profileA, profileB, resultOf(a.score, b.score), { mine: a.score, theirs: b.score }, at);
  const updateB = advance(profileB, profileA, resultOf(b.score, a.score), { mine: b.score, theirs: a.score }, at);

  store.save(updateA.profile);
  store.save(updateB.profile);
  return { [a.id]: updateA, [b.id]: updateB };
}

/** Reads a profile without creating one, for showing a card before a match. */
export function profileFor(store: ProfileStore, id: string, name: string, at: number): PlayerProfile {
  const existing = store.get(id);
  return existing ? { ...existing, name: name || existing.name } : { ...blankProfile(id, at), name };
}
