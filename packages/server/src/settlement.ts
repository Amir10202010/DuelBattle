import type { MatchRewards, MetaMatchRewards } from '@battle/shared';

/**
 * What a finished match tells the rest of the product.
 *
 * A ranked result is written in exactly one place — `Room.settleRatings` — and
 * a growing number of things want to know about it: a daily quest, a play
 * streak, a referral that becomes worth paying, a message to somebody who has
 * already closed the tab. Reaching into the room from each of them would put
 * four subsystems inside the match engine.
 *
 * So the room announces, once, through this one optional hook. It knows
 * nothing about Telegram, and a deployment without a bot never sets it.
 */

export interface SettledPlayer {
  /** The account row, which is also the profile row. */
  accountId: string;
  name: string;
  /** Rounds taken in the match just finished. */
  score: number;
  result: 'win' | 'loss' | 'draw';
  ratingBefore: number;
  ratingAfter: number;
  /** Signed, exactly as the player was shown it. */
  ratingChange: number;
  /** Consecutive wins after this match. Ranked-only on a ranked match; any mode on a casual one. */
  streak: number;
  rewards: MatchRewards;
  /** Rounds in which this player's answer was accepted. */
  validAnswers: number;
  /** Their fastest round-winning answer, in milliseconds. */
  fastestWinMs: number | null;
  /**
   * Whether this match paid out progression at all. A casual match past the
   * daily ceiling, or past the per-pair limit, still counts for quests.
   */
  rewarded: boolean;
  /** A player who leaves an active match earns no quest or pass progress. */
  forfeited?: boolean;
  /** Filled in once the season and quests have seen the match. */
  meta?: MetaMatchRewards & { questsCompleted: string[] };
}

export interface SettledMatch {
  /** The receipt the economy and the rating share. Unique per settled match. */
  matchId: string;
  roomCode: string;
  ranked: boolean;
  /** Played in a room somebody opened and shared, rather than one the queue made. */
  friendRoom: boolean;
  at: number;
  /** Always two, and never the same account twice. */
  players: [SettledPlayer, SettledPlayer];
}

/**
 * Called after the settlement transaction has committed, for ranked and casual
 * matches alike; a listener that only cares about one checks `ranked`.
 *
 * After, not inside: everything downstream of a result is allowed to fail, and
 * none of it may take the rating down with it. Implementations must not throw;
 * the room calls this defensively anyway.
 */
export type SettlementListener = (match: SettledMatch) => void;

/**
 * Moves the season and the quest boards for a settled match, and says what
 * moved, keyed by account.
 *
 * Unlike the listener above this one answers, because the answer belongs on
 * the result screen the players are about to see. It runs after the rating
 * has committed, in its own transaction; if it fails, the result stands and
 * the screen simply shows less.
 */
export type MetaSettlement = (
  match: SettledMatch,
) => Record<string, MetaMatchRewards & { questsCompleted: string[] }>;
