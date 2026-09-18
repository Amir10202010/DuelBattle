import type { MatchRewards } from '@battle/shared';

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
  /** Consecutive wins after this match. */
  streak: number;
  rewards: MatchRewards;
}

export interface SettledMatch {
  /** The receipt the economy and the rating share. Unique per settled match. */
  matchId: string;
  roomCode: string;
  ranked: boolean;
  at: number;
  /** Always two, and never the same account twice. */
  players: [SettledPlayer, SettledPlayer];
}

/**
 * Called after the settlement transaction has committed.
 *
 * After, not inside: everything downstream of a result is allowed to fail, and
 * none of it may take the rating down with it. Implementations must not throw;
 * the room calls this defensively anyway.
 */
export type SettlementListener = (match: SettledMatch) => void;
