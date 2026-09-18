import type { TelegramNotificationPrefs } from '@battle/shared';
import type { Database } from '../database.js';
import { log } from '../log.js';
import type { InlineKeyboardButton, TelegramBotApi } from './api.js';
import { botLink, telegramConfig } from './config.js';
import type { TelegramIdentities } from './identity.js';

/**
 * Reaching somebody who is not looking at the app.
 *
 * This is the whole reason a Telegram integration is worth building, and it is
 * also the fastest way to make somebody mute a bot forever. So the design is
 * defensive by default:
 *
 *   - **Nothing in a request path waits on Telegram.** A notification is a row.
 *     A single worker drains the rows. A match settles at the speed of SQLite
 *     whether or not api.telegram.org is answering today.
 *   - **Every message is checked against a preference** before it is queued and
 *     again before it is sent, because the player may have turned it off in
 *     between.
 *   - **Every message has a dedupe key.** A settlement evaluated twice, a
 *     webhook retried, a rematch of the same room — each is one message.
 *   - **Some messages are not worth sending at all.** Telling somebody they won
 *     while they are staring at the victory screen is noise, so those kinds are
 *     held briefly and dropped if the player was recently in the app.
 */

export const NOTIFICATION_KINDS = [
  'match-result',
  'challenge-received',
  'challenge-accepted',
  'friend-joined',
  'achievement',
  'rank-change',
  'streak',
  'referral-reward',
  'premium-activated',
  'weekly-recap',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Which toggle governs each kind. One table, no per-kind special cases. */
const CATEGORY: Record<NotificationKind, keyof TelegramNotificationPrefs> = {
  'match-result': 'matches',
  'challenge-received': 'challenges',
  'challenge-accepted': 'challenges',
  'friend-joined': 'social',
  achievement: 'achievements',
  'rank-change': 'achievements',
  streak: 'achievements',
  'referral-reward': 'social',
  'premium-activated': 'matches',
  'weekly-recap': 'digest',
};

/**
 * Kinds that are only interesting to somebody who has put the phone down.
 *
 * Held for a short while, then dropped if the player has been in the app since.
 */
const SUPPRESS_IF_ACTIVE: ReadonlySet<NotificationKind> = new Set([
  'match-result',
  'achievement',
  'rank-change',
  'streak',
]);
const SUPPRESS_DELAY_MS = 45_000;

/** Attempts before a message is abandoned, and how long to wait between them. */
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [30_000, 120_000, 600_000];

export const DEFAULT_PREFS: TelegramNotificationPrefs = {
  matches: true,
  challenges: true,
  achievements: true,
  social: true,
  digest: true,
  quietFrom: null,
  quietTo: null,
  utcOffsetMinutes: 0,
};

export interface NotificationMessage {
  text: string;
  buttons?: InlineKeyboardButton[][];
}

export interface QueuedNotification {
  accountId: string;
  kind: NotificationKind;
  /** Makes the message idempotent. Must describe the *event*, not the moment. */
  dedupeKey: string;
  message: NotificationMessage;
  /** Delay before the first delivery attempt. */
  delayMs?: number;
}

/** True when `now`, in the player's own clock, falls inside their quiet hours. */
export function inQuietHours(prefs: TelegramNotificationPrefs, now: number): boolean {
  if (prefs.quietFrom === null || prefs.quietTo === null) return false;
  if (prefs.quietFrom === prefs.quietTo) return false;
  const local = new Date(now + prefs.utcOffsetMinutes * 60_000);
  const hour = local.getUTCHours();
  // A window that wraps midnight is the normal case, not the exception.
  return prefs.quietFrom < prefs.quietTo
    ? hour >= prefs.quietFrom && hour < prefs.quietTo
    : hour >= prefs.quietFrom || hour < prefs.quietTo;
}

/** When the quiet window this moment falls into ends. */
function afterQuietHours(prefs: TelegramNotificationPrefs, now: number): number {
  if (!inQuietHours(prefs, now)) return now;
  const local = new Date(now + prefs.utcOffsetMinutes * 60_000);
  const target = prefs.quietTo!;
  const hoursAway = (target - local.getUTCHours() + 24) % 24 || 24;
  const minutesIntoHour = local.getUTCMinutes();
  return now + hoursAway * 3_600_000 - minutesIntoHour * 60_000;
}

export class NotificationService {
  private draining = false;

  constructor(
    private readonly db: Database,
    private readonly api: TelegramBotApi,
    private readonly identities: TelegramIdentities,
  ) {}

  preferences(accountId: string): TelegramNotificationPrefs {
    const row = this.db.sql
      .prepare('SELECT * FROM notification_prefs WHERE account_id=?')
      .get(accountId);
    if (!row) return { ...DEFAULT_PREFS };
    return {
      matches: Number(row.matches) === 1,
      challenges: Number(row.challenges) === 1,
      achievements: Number(row.achievements) === 1,
      social: Number(row.social) === 1,
      digest: Number(row.digest) === 1,
      quietFrom: row.quiet_from === null ? null : Number(row.quiet_from),
      quietTo: row.quiet_to === null ? null : Number(row.quiet_to),
      utcOffsetMinutes: Number(row.utc_offset_minutes ?? 0),
    };
  }

  savePreferences(
    accountId: string,
    prefs: TelegramNotificationPrefs,
    now: number,
  ): TelegramNotificationPrefs {
    this.db.sql
      .prepare(
        `INSERT INTO notification_prefs
         (account_id,matches,challenges,achievements,social,digest,quiet_from,quiet_to,utc_offset_minutes,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(account_id) DO UPDATE SET matches=excluded.matches, challenges=excluded.challenges,
           achievements=excluded.achievements, social=excluded.social, digest=excluded.digest,
           quiet_from=excluded.quiet_from, quiet_to=excluded.quiet_to,
           utc_offset_minutes=excluded.utc_offset_minutes, updated_at=excluded.updated_at`,
      )
      .run(
        accountId,
        prefs.matches ? 1 : 0,
        prefs.challenges ? 1 : 0,
        prefs.achievements ? 1 : 0,
        prefs.social ? 1 : 0,
        prefs.digest ? 1 : 0,
        prefs.quietFrom,
        prefs.quietTo,
        prefs.utcOffsetMinutes,
        now,
      );
    return prefs;
  }

  /**
   * Queues a message.
   *
   * Everything that could make this message wrong to send is checked here — no
   * Telegram account, no permission to write, the toggle is off, it is the
   * middle of their night, it has already been queued — so the worker's only
   * job is delivery.
   */
  notify(input: QueuedNotification, now: number): boolean {
    const identity = this.identities.byAccount(input.accountId);
    if (!identity) return false;
    // Telegram tells us whether the bot is allowed to write first. Ignoring it
    // is how a bot gets reported rather than blocked.
    if (!identity.allowsWriteToPm) return false;

    const prefs = this.preferences(input.accountId);
    if (!prefs[CATEGORY[input.kind]]) return false;

    let notBefore = now + (input.delayMs ?? 0);
    if (SUPPRESS_IF_ACTIVE.has(input.kind)) notBefore = Math.max(notBefore, now + SUPPRESS_DELAY_MS);
    /*
     * Quiet hours apply to everything, with no exceptions.
     *
     * Every app that buzzes somebody at three in the morning does it by
     * deciding that this particular message was too important to hold, and
     * every one of them is wrong: a player who set the hours meant it. A
     * challenge is good for a day and reads just as well at nine.
     *
     * Measured from `notBefore` rather than from `now`, so a message already
     * delayed into the quiet window is deferred too.
     */
    notBefore = afterQuietHours(prefs, notBefore);

    try {
      const inserted = this.db.sql
        .prepare(
          `INSERT OR IGNORE INTO notification_outbox
           (account_id,kind,dedupe_key,payload,not_before,attempts,state,last_error,created_at,sent_at)
           VALUES(?,?,?,?,?,0,'queued',NULL,?,NULL)`,
        )
        .run(
          input.accountId,
          input.kind,
          input.dedupeKey,
          JSON.stringify(input.message),
          notBefore,
          now,
        );
      return inserted.changes > 0;
    } catch (error) {
      log.warn('could not queue a notification', {
        kind: input.kind,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return false;
    }
  }

  /**
   * Sends whatever is due.
   *
   * Serial rather than parallel: Telegram rate-limits per bot, a handful of
   * messages a second is well inside it, and a burst of concurrent sends is how
   * a 429 turns into a retry storm. Re-entrancy is guarded because the interval
   * that calls this does not wait for it.
   */
  async drain(now: number, limit = 20): Promise<number> {
    if (this.draining || !this.api.configured) return 0;
    this.draining = true;
    let sent = 0;
    try {
      const due = this.db.sql
        .prepare(
          `SELECT id, account_id, kind, payload, attempts FROM notification_outbox
           WHERE state='queued' AND not_before<=? ORDER BY id LIMIT ?`,
        )
        .all(now, limit);

      for (const row of due) {
        const id = Number(row.id);
        const accountId = String(row.account_id);
        const kind = String(row.kind) as NotificationKind;
        const identity = this.identities.byAccount(accountId);

        // Re-checked at the moment of sending: a preference changed while the
        // message sat in the queue has to win.
        if (!identity || !identity.allowsWriteToPm || !this.preferences(accountId)[CATEGORY[kind]]) {
          this.finish(id, 'dropped', 'preference');
          continue;
        }
        if (
          SUPPRESS_IF_ACTIVE.has(kind) &&
          now - identity.lastSeenAt < SUPPRESS_DELAY_MS
        ) {
          this.finish(id, 'dropped', 'active');
          continue;
        }

        const message = JSON.parse(String(row.payload)) as NotificationMessage;
        const result = await this.api.sendMessage({
          chatId: identity.telegramUserId,
          text: message.text,
          ...(message.buttons ? { buttons: message.buttons } : {}),
        });

        if (result.ok) {
          this.finish(id, 'sent', null);
          sent++;
          continue;
        }

        const attempts = Number(row.attempts) + 1;
        if (result.status === 403) {
          // Blocked, or the chat is gone. Stop writing to them and stop asking.
          this.db.sql
            .prepare(
              `INSERT INTO notification_prefs
               (account_id,matches,challenges,achievements,social,digest,quiet_from,quiet_to,utc_offset_minutes,updated_at)
               VALUES(?,0,0,0,0,0,NULL,NULL,0,?)
               ON CONFLICT(account_id) DO UPDATE SET matches=0,challenges=0,achievements=0,social=0,digest=0,updated_at=excluded.updated_at`,
            )
            .run(accountId, now);
          this.finish(id, 'dropped', 'blocked');
          continue;
        }
        if (!result.retryable || attempts >= MAX_ATTEMPTS) {
          this.finish(id, 'failed', result.description.slice(0, 120));
          continue;
        }
        const wait = (result.retryAfter ?? 0) * 1000 || BACKOFF_MS[attempts - 1] || 600_000;
        this.db.sql
          .prepare('UPDATE notification_outbox SET attempts=?, not_before=?, last_error=? WHERE id=?')
          .run(attempts, now + wait, result.description.slice(0, 120), id);
        // A rate limit applies to the whole bot, so stop the pass rather than
        // walking the rest of the queue into the same wall.
        if (result.status === 429) break;
      }
    } finally {
      this.draining = false;
    }
    return sent;
  }

  private finish(id: number, state: 'sent' | 'failed' | 'dropped', error: string | null): void {
    this.db.sql
      .prepare('UPDATE notification_outbox SET state=?, sent_at=?, last_error=? WHERE id=?')
      .run(state, Date.now(), error, id);
  }

  /** How many messages are waiting. Shown on the admin screen. */
  pending(): number {
    return Number(
      this.db.sql.prepare("SELECT count(*) AS n FROM notification_outbox WHERE state='queued'").get()!
        .n,
    );
  }
}

/** The button every notification ends with: a way back into the game. */
export function playButton(label = '⚔️ Play again'): InlineKeyboardButton[][] {
  const url = botLink();
  const app = telegramConfig.miniAppUrl ? `${telegramConfig.miniAppUrl}/tg` : '';
  if (app) return [[{ text: label, web_app: { url: app } }]];
  return url ? [[{ text: label, url }]] : [];
}
