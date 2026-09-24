import { chest, coins, gems, passPoints, type Reward } from './rewards.js';

/**
 * The daily claim, as a seven-day calendar.
 *
 * One claim per UTC day moves you one square along; the seventh square is a
 * chest and then the week starts again. A missed day does not send anybody
 * back to square one — punishing the evening you were busy is how a calendar
 * turns from a small pleasure into a chore you resent.
 */
export const DAILY_CALENDAR: readonly (readonly Reward[])[] = [
  [coins(40)],
  [coins(60)],
  [gems(5)],
  [coins(80), passPoints(100)],
  [coins(100)],
  [gems(10)],
  [chest('battle'), passPoints(200)],
];

/** Which square the next claim lands on, given how many claims came before. */
export function calendarIndex(claimsSoFar: number): number {
  return ((Math.max(0, Math.floor(claimsSoFar)) % DAILY_CALENDAR.length) + DAILY_CALENDAR.length) % DAILY_CALENDAR.length;
}

export interface CalendarView {
  /** The square the next claim lands on, 0-based. */
  index: number;
  claimedToday: boolean;
  /** Total claims ever. Drives nothing but the "day N" label. */
  claims: number;
  resetsAt: number;
  days: readonly (readonly Reward[])[];
}
