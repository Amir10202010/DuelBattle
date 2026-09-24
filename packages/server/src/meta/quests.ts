import type { DatabaseSync } from 'node:sqlite';
import {
  STARTER_QUESTS,
  dailyBoard,
  dayKey,
  nextDayAt,
  nextWeekAt,
  periodKey,
  weekKey,
  weeklyBoard,
  type QuestBoardView,
  type QuestDefinition,
  type QuestEvent,
  type QuestView,
  type Reward,
} from '@battle/shared';
import { AuthError } from '../auth.js';

export interface QuestTick {
  id: string;
  title: string;
  progress: number;
  target: number;
  done: boolean;
  /** This event is the one that finished it. */
  completedNow: boolean;
}

/**
 * Quest progress, for every board at once.
 *
 * The daily and weekly boards are derived from the date; only progress is
 * stored, keyed by the period it belongs to, so a reset is nothing more than a
 * new key. The starter chain lives under one key forever and disappears from
 * view once every step of it has been collected.
 */
export class QuestBook {
  constructor(private readonly sql: DatabaseSync) {}

  /** The quests live at a moment: today's, this week's, and any starter step left. */
  active(now: number): QuestDefinition[] {
    return [...dailyBoard(dayKey(now)), ...weeklyBoard(weekKey(now)), ...STARTER_QUESTS];
  }

  private rows(accountId: string, now: number) {
    const keys = [periodKey('daily', now), periodKey('weekly', now), 'starter'];
    const rows = this.sql
      .prepare(
        `SELECT period_key, quest_id, progress, claimed_at FROM quest_progress
         WHERE account_id=? AND period_key IN (?,?,?)`,
      )
      .all(accountId, ...keys);
    return new Map(
      rows.map((row) => [
        `${String(row.period_key)}|${String(row.quest_id)}`,
        { progress: Number(row.progress), claimed: row.claimed_at !== null },
      ]),
    );
  }

  view(accountId: string, now: number): QuestBoardView {
    const state = this.rows(accountId, now);
    const toView = (quest: QuestDefinition): QuestView => {
      const row = state.get(`${periodKey(quest.period, now)}|${quest.id}`) ?? { progress: 0, claimed: false };
      const progress = Math.min(quest.target, row.progress);
      return {
        id: quest.id,
        period: quest.period,
        title: quest.title,
        description: quest.description,
        progress,
        target: quest.target,
        rewards: quest.rewards,
        done: progress >= quest.target,
        claimed: row.claimed,
      };
    };
    const starter = STARTER_QUESTS.map(toView);
    return {
      daily: dailyBoard(dayKey(now)).map(toView),
      weekly: weeklyBoard(weekKey(now)).map(toView),
      starter: starter.every((quest) => quest.claimed) ? [] : starter,
      dailyResetsAt: nextDayAt(now),
      weeklyResetsAt: nextWeekAt(now),
    };
  }

  /**
   * Moves every live quest the event touches.
   *
   * Called inside the caller's transaction, with an event the server built
   * itself. Returns what moved, so the result screen can say "2/3" the moment
   * it happens instead of the next time somebody opens the lobby.
   */
  record(accountId: string, event: QuestEvent, now: number): QuestTick[] {
    const ticks: QuestTick[] = [];
    for (const quest of this.active(now)) {
      const step = quest.advance(event);
      if (step <= 0) continue;
      const key = periodKey(quest.period, now);
      const before = Number(
        this.sql
          .prepare('SELECT progress FROM quest_progress WHERE account_id=? AND period_key=? AND quest_id=?')
          .get(accountId, key, quest.id)?.progress ?? 0,
      );
      if (before >= quest.target) continue;
      const after = Math.min(quest.target, before + step);
      this.sql
        .prepare(
          `INSERT INTO quest_progress(account_id,period_key,quest_id,progress,claimed_at) VALUES(?,?,?,?,NULL)
           ON CONFLICT(account_id,period_key,quest_id) DO UPDATE SET progress=excluded.progress`,
        )
        .run(accountId, key, quest.id, after);
      ticks.push({
        id: quest.id,
        title: quest.title,
        progress: after,
        target: quest.target,
        done: after >= quest.target,
        completedNow: after >= quest.target,
      });
    }
    return ticks;
  }

  /**
   * Marks a finished quest as collected and returns what it pays.
   *
   * The caller pays it inside the same transaction, under a receipt naming the
   * period and the quest, so a double tap collects once.
   */
  claim(accountId: string, questId: string, now: number): { quest: QuestDefinition; rewards: Reward[]; receipt: string } {
    const quest = this.active(now).find((candidate) => candidate.id === questId);
    if (!quest) throw new AuthError(404, 'That quest is not on your board.');
    const key = periodKey(quest.period, now);
    const row = this.sql
      .prepare('SELECT progress, claimed_at FROM quest_progress WHERE account_id=? AND period_key=? AND quest_id=?')
      .get(accountId, key, questId);
    if (!row || Number(row.progress) < quest.target) throw new AuthError(409, 'Finish the quest first.');
    if (row.claimed_at !== null) throw new AuthError(409, 'Already collected.');
    this.sql
      .prepare('UPDATE quest_progress SET claimed_at=? WHERE account_id=? AND period_key=? AND quest_id=?')
      .run(now, accountId, key, questId);
    return { quest, rewards: quest.rewards, receipt: `quest:${key}:${questId}` };
  }

  /** Finished and waiting to be collected, across every board. */
  claimable(accountId: string, now: number): number {
    const view = this.view(accountId, now);
    return [...view.daily, ...view.weekly, ...view.starter].filter((quest) => quest.done && !quest.claimed).length;
  }
}
