import type { DatabaseSync } from 'node:sqlite';
import { DAILY_CALENDAR, calendarIndex, dayKey, nextDayAt, type CalendarView, type Reward } from '@battle/shared';
import { AuthError } from '../auth.js';
import { claimedToday } from '../economy.js';

/**
 * The seven-day calendar.
 *
 * Position is the number of days ever claimed, so a missed day costs nothing
 * but the day. The primary key is (account, day): a second claim on the same
 * UTC day is refused by the database rather than by a check that could race.
 */
export class DailyCalendar {
  constructor(private readonly sql: DatabaseSync) {}

  private claims(accountId: string): number {
    return Number(this.sql.prepare('SELECT count(*) AS n FROM calendar_claims WHERE account_id=?').get(accountId)!.n);
  }

  view(accountId: string, now: number): CalendarView {
    const claims = this.claims(accountId);
    return {
      index: calendarIndex(claims),
      claimedToday: claimedToday(this.sql, accountId, now),
      claims,
      resetsAt: nextDayAt(now),
      days: DAILY_CALENDAR,
    };
  }

  /** Takes today's square. The caller pays it out in the same transaction. */
  claim(accountId: string, now: number): { rewards: readonly Reward[]; receipt: string; square: number } {
    if (claimedToday(this.sql, accountId, now)) throw new AuthError(409, 'Already collected today. Back tomorrow.');
    const square = calendarIndex(this.claims(accountId));
    const day = dayKey(now);
    this.sql
      .prepare('INSERT INTO calendar_claims(account_id,day,square,at) VALUES(?,?,?,?)')
      .run(accountId, day, square, now);
    return { rewards: DAILY_CALENDAR[square]!, receipt: `calendar:${day}`, square };
  }
}
