import type { Database } from '../database.js';
import { dayKey } from './quests.js';

/**
 * Turning up, counted separately from winning.
 *
 * The profile already has a win streak, and it is the right shape for what it
 * measures: it breaks the moment you lose, because that is what "on a run"
 * means. A *play* streak is a different promise — it survives a bad night and
 * only breaks if you do not show up — and folding the two together would make
 * both of them lie.
 *
 * Days are UTC, matching the daily quest board, so a player never sees one
 * reset without the other.
 */

export interface DailyStreak {
  current: number;
  best: number;
  lastDay: string;
}

/** Whether `day` is exactly the calendar day after `previous`. */
function isNextDay(previous: string, day: string): boolean {
  const before = Date.parse(`${previous}T00:00:00Z`);
  const now = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(before) && Number.isFinite(now) && now - before === 86_400_000;
}

export class DailyStreaks {
  constructor(private readonly db: Database) {}

  /** What to draw. A streak that has already lapsed reads as zero, not as stale. */
  read(accountId: string, now: number): DailyStreak {
    const row = this.db.sql
      .prepare('SELECT current, best, last_day FROM daily_streaks WHERE account_id=?')
      .get(accountId);
    if (!row) return { current: 0, best: 0, lastDay: '' };
    const lastDay = String(row.last_day);
    const today = dayKey(now);
    const alive = lastDay === today || isNextDay(lastDay, today);
    return {
      current: alive ? Number(row.current) : 0,
      best: Number(row.best),
      lastDay,
    };
  }

  /**
   * Records that a match finished today.
   *
   * Returns the new streak and whether this match extended it, because "day 5"
   * is worth saying once and not five times.
   */
  record(accountId: string, now: number): { streak: DailyStreak; extended: boolean } {
    const today = dayKey(now);
    const row = this.db.sql
      .prepare('SELECT current, best, last_day FROM daily_streaks WHERE account_id=?')
      .get(accountId);

    if (!row) {
      this.db.sql.prepare('INSERT INTO daily_streaks VALUES(?,1,1,?)').run(accountId, today);
      return { streak: { current: 1, best: 1, lastDay: today }, extended: true };
    }

    const lastDay = String(row.last_day);
    if (lastDay === today) {
      return {
        streak: { current: Number(row.current), best: Number(row.best), lastDay },
        extended: false,
      };
    }

    const current = isNextDay(lastDay, today) ? Number(row.current) + 1 : 1;
    const best = Math.max(Number(row.best), current);
    this.db.sql
      .prepare('UPDATE daily_streaks SET current=?, best=?, last_day=? WHERE account_id=?')
      .run(current, best, today, accountId);
    return { streak: { current, best, lastDay: today }, extended: true };
  }
}
