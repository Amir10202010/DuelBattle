import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  isClientEvent,
  sanitizeProps,
  type EventProps,
} from '@battle/shared';
import type { Database } from './database.js';

/**
 * Product events, recorded on the server, in the same database as everything
 * else.
 *
 * There is no third party here and no script in the page. The questions this
 * has to answer — who came back, who played, who paid and what for — are all
 * answerable from rows this server already writes, and adding a vendor to
 * answer them would mean shipping every player's activity to somebody else for
 * the privilege.
 *
 * Properties are a small JSON object, never free text from a user, never an
 * identifier belonging to anybody but the account the row is about. Client
 * events may only use the names the shared list allows; everything involving
 * money, rewards or a result is written here by the server from its own
 * records, because a client event is a hint, not evidence.
 */

export const TELEGRAM_EVENTS = [
  'telegram_bot_started',
  'telegram_miniapp_opened',
  'telegram_account_created',
  'telegram_account_linked',
  'telegram_account_unlinked',
  'match_started',
  'challenge_created',
  'challenge_accepted',
  'challenge_played',
  'referral_clicked',
  'referral_activated',
  'achievement_unlocked',
  'premium_viewed',
  'premium_invoice_opened',
  'premium_purchased',
  'notification_sent',
  'report_filed',
] as const;

/** Every name a row may carry. Kept for readers of the database as much as for the compiler. */
export const ANALYTICS_EVENTS = [...new Set([...TELEGRAM_EVENTS, ...SERVER_EVENTS, ...CLIENT_EVENTS])];

export type AnalyticsEvent =
  | (typeof TELEGRAM_EVENTS)[number]
  | (typeof SERVER_EVENTS)[number]
  | (typeof CLIENT_EVENTS)[number];

export interface AnalyticsTotals {
  dau: number;
  wau: number;
  mau: number;
  telegramPlayers: number;
  newToday: number;
  duelsToday: number;
  playersToday: number;
  premiumHolders: number;
  referralsJoined: number;
  referralsActivated: number;
  openReports: number;
}

/** One batch a browser may send: small, named from the allow-list, and bounded. */
export const MAX_CLIENT_BATCH = 25;

export class Analytics {
  constructor(private readonly db: Database) {}

  /**
   * Records one event.
   *
   * Never throws. An analytics write that can break a match is not worth
   * having, and the failure mode of a missing row is a slightly wrong chart.
   */
  track(
    name: AnalyticsEvent,
    accountId: string | null,
    props: EventProps = {},
    now = Date.now(),
    sessionId: string | null = null,
  ): void {
    try {
      this.db.sql
        .prepare('INSERT INTO analytics_events(at,name,account_id,props,session_id) VALUES(?,?,?,?,?)')
        .run(now, name, accountId, JSON.stringify(props), sessionId);
    } catch {
      /* Telemetry is never allowed to be the reason something failed. */
    }
  }

  /**
   * Records what a browser reported.
   *
   * Unknown names are dropped rather than rejected, so an old client talking to
   * a newer server loses a row, not a request. Timestamps are the server's:
   * a client clock is a claim, and cohorts built on claims drift.
   */
  trackClient(input: unknown, accountId: string | null, now: number): number {
    if (!input || typeof input !== 'object') return 0;
    const { session, events } = input as { session?: unknown; events?: unknown };
    const sessionId = typeof session === 'string' && /^[a-z0-9]{8,32}$/.test(session) ? session : null;
    if (!Array.isArray(events)) return 0;
    let kept = 0;
    for (const event of events.slice(0, MAX_CLIENT_BATCH)) {
      const { name, props } = (event ?? {}) as { name?: unknown; props?: unknown };
      if (!isClientEvent(name)) continue;
      this.track(name, accountId, sanitizeProps(props), now, sessionId);
      kept++;
    }
    return kept;
  }

  /** Counts a named event over a window, for the admin dashboard. */
  count(name: AnalyticsEvent, since: number): number {
    return Number(
      this.db.sql
        .prepare('SELECT count(*) AS n FROM analytics_events WHERE name=? AND at>=?')
        .get(name, since)!.n,
    );
  }

  /** Everything the Telegram admin summary shows, from real rows only. */
  totals(now: number): AnalyticsTotals {
    const active = (since: number) =>
      Number(
        this.db.sql
          .prepare('SELECT count(*) AS n FROM telegram_identities WHERE last_seen_at>=?')
          .get(since)!.n,
      );
    const startOfDay = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
    );
    return {
      dau: active(now - 86_400_000),
      wau: active(now - 7 * 86_400_000),
      mau: active(now - 30 * 86_400_000),
      telegramPlayers: Number(
        this.db.sql.prepare('SELECT count(*) AS n FROM telegram_identities').get()!.n,
      ),
      newToday: Number(
        this.db.sql
          .prepare('SELECT count(*) AS n FROM telegram_identities WHERE created_at>=?')
          .get(startOfDay)!.n,
      ),
      duelsToday: Number(
        this.db.sql.prepare('SELECT count(*) AS n FROM match_receipts WHERE at>=?').get(startOfDay)!
          .n,
      ),
      playersToday: this.playersToday(startOfDay),
      premiumHolders: Number(
        this.db.sql
          .prepare(
            "SELECT count(*) AS n FROM entitlements WHERE feature='premium' AND (expires_at IS NULL OR expires_at>?)",
          )
          .get(now)!.n,
      ),
      referralsJoined: Number(
        this.db.sql.prepare('SELECT count(*) AS n FROM referral_claims').get()!.n,
      ),
      referralsActivated: Number(
        this.db.sql
          .prepare("SELECT count(*) AS n FROM referral_claims WHERE status='rewarded'")
          .get()!.n,
      ),
      openReports: Number(
        this.db.sql.prepare("SELECT count(*) AS n FROM player_reports WHERE state='open'").get()!.n,
      ),
    };
  }

  /**
   * Distinct people who finished a ranked match today.
   *
   * Counted from settled matches rather than from sessions, because "played"
   * is the only number worth putting on a screen, and a session is not a game.
   */
  playersToday(since: number): number {
    return Number(
      this.db.sql
        .prepare(
          'SELECT count(*) AS n FROM (SELECT a AS id FROM match_receipts WHERE at>=? UNION SELECT b FROM match_receipts WHERE at>=?)',
        )
        .get(since, since)!.n,
    );
  }

  /** Ninety days is enough for every cohort the dashboard draws. */
  sweep(now: number): void {
    try {
      this.db.sql.prepare('DELETE FROM analytics_events WHERE at < ?').run(now - 90 * 86_400_000);
    } catch {
      /* Housekeeping never takes anything down with it. */
    }
  }
}
