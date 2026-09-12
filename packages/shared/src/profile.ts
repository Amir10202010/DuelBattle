import type { MatchResult } from './rating.js';

/** One finished match, as it reads on a profile card. */
export interface MatchRecord {
  at: number;
  opponentName: string;
  result: MatchResult;
  ratingBefore: number;
  ratingAfter: number;
  yourScore: number;
  theirScore: number;
}

/**
 * What a player is allowed to know about somebody's record.
 *
 * Everything here is a count of matches played in public against a live
 * opponent, so all of it is fair game to show either side. The recent history
 * is the exception, and only because a card showing ten of somebody else's
 * matches is a stalking tool rather than a scoreboard — the server sends that
 * to the person it belongs to and to nobody else.
 */
export interface PublicProfile {
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Consecutive wins, reset by anything that is not a win. */
  streak: number;
  bestStreak: number;
  /** Present only on your own card. */
  history?: MatchRecord[];
}

/** What a finished match did to one player's rating. */
export interface RatingDelta {
  before: number;
  after: number;
  /** Signed, and exactly what is shown on screen. */
  change: number;
}
