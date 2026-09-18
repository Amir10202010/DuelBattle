import type { TelegramPremium } from '@battle/shared';
import type { Database } from '../database.js';

/**
 * What a player is entitled to, and deliberately not who paid for it.
 *
 * The temptation with a second payment provider is a second premium flag, and
 * then a third when the web subscription arrives, and then a helper somewhere
 * that asks `isTelegramPremium || isStripePremium || …`. Every feature check in
 * the product would then know about payment providers, which is exactly the
 * knowledge a feature check should not have.
 *
 * So there is one question — *does this account hold this entitlement right
 * now* — answered from one table. `source` is recorded for support and
 * reconciliation and is read by nothing that decides behaviour.
 */

export const PREMIUM = 'premium';

export type EntitlementSource = 'telegram_stars' | 'web_subscription' | 'grant';

export class Entitlements {
  constructor(private readonly db: Database) {}

  /**
   * Whether an entitlement is live.
   *
   * A null expiry is a grant that does not run out, which is what a lifetime
   * purchase or an administrative grant looks like.
   */
  has(accountId: string, feature: string, now: number): boolean {
    const row = this.db.sql
      .prepare('SELECT expires_at FROM entitlements WHERE account_id=? AND feature=?')
      .get(accountId, feature);
    if (!row) return false;
    return row.expires_at === null || Number(row.expires_at) > now;
  }

  premium(accountId: string, now: number): TelegramPremium {
    const row = this.db.sql
      .prepare('SELECT source, expires_at FROM entitlements WHERE account_id=? AND feature=?')
      .get(accountId, PREMIUM);
    if (!row) return { active: false, until: null, source: null };
    const until = row.expires_at === null ? null : Number(row.expires_at);
    return {
      active: until === null || until > now,
      until,
      source: String(row.source),
    };
  }

  /**
   * Grants or extends an entitlement.
   *
   * Extending from the later of *now* and the current expiry is the only
   * behaviour that does not quietly rob somebody: buying a second month while
   * the first is still running has to add a month to the end of it, not restart
   * the clock from today.
   *
   * The caller holds the transaction. This is always written next to whatever
   * proves it was paid for, never on its own.
   */
  grant(input: {
    accountId: string;
    feature: string;
    source: EntitlementSource;
    /** Zero or null grants something that never expires. */
    days: number | null;
    now: number;
  }): { until: number | null } {
    const existing = this.db.sql
      .prepare('SELECT expires_at FROM entitlements WHERE account_id=? AND feature=?')
      .get(input.accountId, input.feature);

    if (!input.days) {
      this.db.sql
        .prepare(
          `INSERT INTO entitlements(account_id,feature,source,granted_at,expires_at) VALUES(?,?,?,?,NULL)
           ON CONFLICT(account_id,feature) DO UPDATE SET source=excluded.source, expires_at=NULL`,
        )
        .run(input.accountId, input.feature, input.source, input.now);
      return { until: null };
    }

    const base =
      existing && existing.expires_at !== null
        ? Math.max(input.now, Number(existing.expires_at))
        : input.now;
    // An already-unlimited entitlement is never downgraded to a dated one.
    if (existing && existing.expires_at === null) return { until: null };

    const until = base + input.days * 86_400_000;
    this.db.sql
      .prepare(
        `INSERT INTO entitlements(account_id,feature,source,granted_at,expires_at) VALUES(?,?,?,?,?)
         ON CONFLICT(account_id,feature) DO UPDATE SET source=excluded.source, expires_at=excluded.expires_at`,
      )
      .run(input.accountId, input.feature, input.source, input.now, until);
    return { until };
  }

  /** Used by a refund, and by an administrator undoing a mistaken grant. */
  revoke(accountId: string, feature: string): void {
    this.db.sql
      .prepare('DELETE FROM entitlements WHERE account_id=? AND feature=?')
      .run(accountId, feature);
  }
}
