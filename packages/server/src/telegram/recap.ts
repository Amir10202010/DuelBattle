import { rankFor } from '@battle/shared';
import type { Database } from '../database.js';
import type { PlayerProfile } from '../profiles.js';
import { escapeHtml } from './service.js';
import type { NotificationService } from './notifications.js';
import { playButton } from './notifications.js';
import type { DailyStreaks } from './streaks.js';

/**
 * One message a week, about the week.
 *
 * It exists because the settings screen offers to send it, and an app that
 * offers a thing it never does is worse than one that offers less. It is also
 * the only message in the product that arrives without the player having done
 * anything, so it has two rules.
 *
 * **Nothing is sent to somebody who did not play.** A recap of a week with no
 * matches in it is an app asking to be reopened, which is exactly the kind of
 * message people mute a bot over.
 *
 * **Every number is real.** It is read back out of the stored match history —
 * the same rows the profile page draws — so the recap cannot claim a week that
 * did not happen.
 */

/** Monday 09:00 in the player's own clock is when a week is worth reading. */
const SEND_HOUR_LOCAL = 9;
const WEEK_MS = 7 * 86_400_000;

export interface WeeklyTotals {
  played: number;
  wins: number;
  losses: number;
  ratingChange: number;
  xp: number;
  bestStreak: number;
}

/** What the last seven days did, from the rows already stored. */
export function weekOf(profile: PlayerProfile, now: number): WeeklyTotals {
  const since = now - WEEK_MS;
  const week = profile.history.filter((record) => record.at >= since);
  let ratingChange = 0;
  let xp = 0;
  let wins = 0;
  let losses = 0;
  let run = 0;
  let bestStreak = 0;
  // Oldest first, so a run reads in the order it was played.
  for (const record of [...week].reverse()) {
    ratingChange += record.ratingAfter - record.ratingBefore;
    xp += record.xp ?? 0;
    if (record.result === 'win') {
      wins++;
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else {
      if (record.result === 'loss') losses++;
      run = 0;
    }
  }
  return { played: week.length, wins, losses, ratingChange, xp, bestStreak };
}

/**
 * The weekly digest pass.
 *
 * Runs on the same slow tick as everything else and does nothing at all on six
 * days out of seven. The `dedupe_key` carries the ISO week, so a restart, a
 * redeploy or a second pass in the same hour cannot send it twice.
 */
export class WeeklyRecap {
  constructor(
    private readonly db: Database,
    private readonly notifications: NotificationService,
    private readonly streaks: DailyStreaks,
  ) {}

  /** Returns how many recaps were queued, for the logs. */
  run(now: number): number {
    let queued = 0;
    // Only players who have been in the app this month; a recap is for somebody
    // who is still around, not a win-back campaign.
    const candidates = this.db.sql
      .prepare('SELECT account_id FROM telegram_identities WHERE last_seen_at >= ? LIMIT 500')
      .all(now - 30 * 86_400_000)
      .map((row) => String(row.account_id));

    for (const accountId of candidates) {
      const prefs = this.notifications.preferences(accountId);
      if (!prefs.digest) continue;
      // Monday morning where they are, not where the server is.
      const local = new Date(now + prefs.utcOffsetMinutes * 60_000);
      if (local.getUTCDay() !== 1 || local.getUTCHours() !== SEND_HOUR_LOCAL) continue;

      const profile = this.db.get(accountId);
      if (!profile) continue;
      const week = weekOf(profile, now);
      if (week.played === 0) continue;

      const rank = rankFor(profile.rating);
      const winRate = Math.round((week.wins / week.played) * 100);
      const daily = this.streaks.read(accountId, now);
      const lines = [
        '📅 <b>Your week in Duel Battle</b>',
        '',
        `Duels      ${week.played}`,
        `Won        ${week.wins} (${winRate}%)`,
        `Rating     ${week.ratingChange >= 0 ? '+' : ''}${week.ratingChange} → <b>${profile.rating}</b>`,
        `XP         +${week.xp}`,
        week.bestStreak >= 2 ? `Best run   ${week.bestStreak} in a row` : '',
        daily.current >= 2 ? `Days       ${daily.current} in a row` : '',
        '',
        `You are ${escapeHtml(rank.label)}.`,
      ].filter(Boolean);

      if (
        this.notifications.notify(
          {
            accountId,
            kind: 'weekly-recap',
            dedupeKey: `recap:${accountId}:${isoWeek(local)}`,
            message: { text: lines.join('\n'), buttons: playButton('⚔️ Play this week') },
          },
          now,
        )
      )
        queued++;
    }
    return queued;
  }
}

/** `2026-W07`. Stable per player per week, which is what the dedupe needs. */
export function isoWeek(local: Date): string {
  const date = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
  // ISO weeks start on Monday and are numbered by the Thursday they contain.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (date.getTime() - firstThursday.getTime()) / 86_400_000 / 7 -
        ((firstThursday.getUTCDay() + 6) % 7) / 7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
