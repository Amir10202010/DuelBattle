import {
  dailyBoard,
  dayKey,
  nextDayAt,
  type QuestDefinition,
  type TelegramQuestBoard,
} from '@battle/shared';
import type { Database } from '../database.js';
import { applyRewards } from '../meta/grants.js';
import { QuestBook } from '../meta/quests.js';
import { AuthError } from '../auth.js';

/**
 * Today's three things to do, as the Mini App and the bot show them.
 *
 * There is one quest board in the product and it lives in `meta/quests`; this
 * is the Telegram-shaped window onto its daily half. Progress written from the
 * browser shows up here and the other way round, and a match is recorded once
 * — by the season settlement — whichever client it was played from.
 */

export { dayKey };
export const nextResetAt = nextDayAt;
/** The three quests for a day. Same for every player, derived from the date. */
export const questsFor = (day: string): QuestDefinition[] => dailyBoard(day);

/** The parts of a finished match the quest rules are allowed to read. */
export interface QuestMatch {
  result: 'win' | 'loss' | 'draw';
  roundsWon: number;
  /** Consecutive wins after this match. */
  streak: number;
  /** Their rating before the match, so an upset can be recognised. */
  opponentRating: number;
  ratingBefore: number;
  /** True when the match came out of a friend challenge rather than the queue. */
  fromChallenge: boolean;
  ranked: boolean;
}

const coinsIn = (quest: { rewards: readonly { kind: string; amount?: number }[] }) =>
  quest.rewards.reduce((sum, reward) => sum + (reward.kind === 'coins' ? (reward.amount ?? 0) : 0), 0);

export class DailyQuests {
  private readonly book: QuestBook;

  constructor(private readonly db: Database) {
    this.book = new QuestBook(db.sql);
  }

  board(accountId: string, now: number): TelegramQuestBoard {
    const view = this.book.view(accountId, now);
    return {
      day: dayKey(now),
      resetsAt: view.dailyResetsAt,
      quests: view.daily.map((quest) => ({
        id: quest.id,
        title: quest.title,
        description: quest.description,
        progress: quest.progress,
        target: quest.target,
        reward: coinsIn(quest),
        done: quest.done,
        claimed: quest.claimed,
      })),
    };
  }

  /** Records a match directly. The settlement path does this for live matches. */
  record(accountId: string, match: QuestMatch, now: number): QuestDefinition[] {
    const ticks = this.book.record(
      accountId,
      {
        type: 'match',
        result: match.result,
        roundsWon: match.roundsWon,
        validAnswers: match.roundsWon,
        streak: match.streak,
        ranked: match.ranked,
        friendRoom: match.fromChallenge,
        upset: match.ranked && match.result === 'win' && match.opponentRating > match.ratingBefore,
        fastestWinMs: null,
        firstOfDay: false,
      },
      now,
    );
    const done = new Set(ticks.filter((tick) => tick.completedNow).map((tick) => tick.id));
    return questsFor(dayKey(now)).filter((quest) => done.has(quest.id));
  }

  /**
   * Pays out a finished daily quest: its coins and its season points, in one
   * transaction under a receipt naming the day and the quest.
   */
  claim(
    accountId: string,
    questId: string,
    now: number,
  ): { ok: true; coins: number } | { ok: false; reason: 'unknown' | 'incomplete' | 'claimed' } {
    if (!questsFor(dayKey(now)).some((quest) => quest.id === questId)) return { ok: false, reason: 'unknown' };
    try {
      return this.db.transaction(() => {
        const { rewards, receipt } = this.book.claim(accountId, questId, now);
        const granted = applyRewards(this.db.sql, accountId, rewards, receipt, now);
        return { ok: true as const, coins: granted.reduce((sum, g) => sum + (g.kind === 'coins' ? g.amount : 0), 0) };
      });
    } catch (error) {
      if (error instanceof AuthError)
        return { ok: false, reason: error.message.startsWith('Already') ? 'claimed' : 'incomplete' };
      throw error;
    }
  }
}
