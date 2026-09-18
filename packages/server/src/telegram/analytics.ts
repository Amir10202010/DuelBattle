import type { Database } from '../database.js';

/**
 * Product events, recorded on the server, in the same database as everything
 * else.
 *
 * There is no third party here and no script in the page. The questions this
 * has to answer — how many people started the bot, how many opened the app, how
 * many of those played, how many invites turn into players — are all answerable
 * from rows this server already writes, and adding a vendor to answer them
 * would mean shipping every player's activity to somebody else for the
 * privilege.
 *
 * Properties are a small JSON object, never free text from a user, never an
 * identifier belonging to anybody but the account the row is about.
 */

export const ANALYTICS_EVENTS = [
  'telegram_bot_started',
  'telegram_miniapp_opened',
  'telegram_account_created',
  'telegram_account_linked',
  'telegram_account_unlinked',
  'match_started',
  'match_completed',
  'challenge_created',
  'challenge_accepted',
  'challenge_played',
  'referral_clicked',
  'referral_activated',
  'quest_claimed',
  'achievement_unlocked',
  'premium_viewed',
  'premium_invoice_opened',
  'premium_purchased',
  'notification_sent',
  'report_filed',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

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
    props: Record<string, string | number | boolean> = {},
    now = Date.now(),
  ): void {
    try {
      this.db.sql
        .prepare('INSERT INTO analytics_events(at,name,account_id,props) VALUES(?,?,?,?)')
        .run(now, name, accountId, JSON.stringify(props));
    } catch {
      /* Telemetry is never allowed to be the reason something failed. */
    }
  }

  /** Counts a named event over a window, for the admin dashboard. */
  count(name: AnalyticsEvent, since: number): number {
    return Number(
      this.db.sql
        .prepare('SELECT count(*) AS n FROM analytics_events WHERE name=? AND at>=?')
        .get(name, since)!.n,
    );
  }

  /** Everything the admin summary shows, from real rows only. */
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
}
