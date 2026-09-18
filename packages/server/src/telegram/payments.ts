import { randomBytes } from 'node:crypto';
import type { Database } from '../database.js';
import { log } from '../log.js';
import type { TelegramBotApi } from './api.js';
import { telegramConfig } from './config.js';
import { PREMIUM, type Entitlements } from './entitlements.js';

/**
 * Telegram Stars, and the two rules that keep a payment system honest.
 *
 * **Nothing is delivered before `successful_payment`.** A pre-checkout query is
 * Telegram asking whether we are willing to sell; it is not money. The Mini App
 * gets a callback when the invoice closes, and that callback is a claim made by
 * a client, so it grants nothing either. Only the update that carries a charge
 * id moves an entitlement.
 *
 * **The charge id is the primary key.** Telegram retries updates, and an outage
 * at the wrong moment means seeing the same `successful_payment` twice. With
 * the charge id as the key, the second write loses to a uniqueness constraint
 * and the entitlement is granted exactly once — in the same transaction as the
 * row that records why.
 */

export const PREMIUM_PRODUCT = 'premium';

/** `premium:<accountId>:<nonce>` — carried through Telegram and back. */
function buildPayload(accountId: string): string {
  return `${PREMIUM_PRODUCT}:${accountId}:${randomBytes(6).toString('hex')}`;
}

export function parsePayload(payload: string): { product: string; accountId: string } | null {
  const match = /^([a-z_]{1,24}):([a-f0-9]{32}):[a-f0-9]{12}$/.exec(payload);
  return match ? { product: match[1]!, accountId: match[2]! } : null;
}

export interface PaymentGrant {
  accountId: string;
  stars: number;
  until: number | null;
  /** False when this charge had already been processed. */
  fresh: boolean;
}

export class Payments {
  constructor(
    private readonly db: Database,
    private readonly api: TelegramBotApi,
    private readonly entitlements: Entitlements,
  ) {}

  get available(): boolean {
    return this.api.configured && telegramConfig.premiumStars > 0;
  }

  /** A link the Mini App hands to `Telegram.WebApp.openInvoice`. */
  async invoiceFor(accountId: string): Promise<{ link: string } | { error: string }> {
    if (!this.available) return { error: 'Premium is not available on this server yet.' };
    const days = telegramConfig.premiumDays;
    const result = await this.api.createInvoiceLink({
      title: 'Duel Battle Premium',
      description: days
        ? `Premium for ${days} days: a premium badge, deeper stats, exclusive cosmetics and priority in the queue.`
        : 'Premium: a premium badge, deeper stats, exclusive cosmetics and priority in the queue.',
      payload: buildPayload(accountId),
      stars: telegramConfig.premiumStars,
      label: 'Duel Battle Premium',
    });
    if (!result.ok) return { error: 'We could not open the payment right now. Try again shortly.' };
    return { link: result.result };
  }

  /**
   * Answers Telegram's pre-checkout question.
   *
   * Ten seconds is the entire budget, so this does one cheap check — is the
   * payload one of ours, for an account that exists — and says yes or no. It
   * grants nothing.
   */
  approvePreCheckout(payload: string): { ok: boolean; message?: string } {
    const parsed = parsePayload(payload);
    if (!parsed || parsed.product !== PREMIUM_PRODUCT)
      return { ok: false, message: 'This purchase is no longer available.' };
    if (!this.db.sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(parsed.accountId))
      return { ok: false, message: 'Open the Mini App and try again.' };
    return { ok: true };
  }

  /**
   * The only place an entitlement is created from a payment.
   *
   * One transaction: the charge row and the entitlement land together or
   * neither does, so there is no window in which we have taken money without
   * recording what it bought.
   */
  settle(input: {
    chargeId: string;
    payload: string;
    stars: number;
    now: number;
  }): PaymentGrant | null {
    const parsed = parsePayload(input.payload);
    if (!parsed || parsed.product !== PREMIUM_PRODUCT) {
      log.warn('telegram payment with an unrecognised payload', { chargeId: input.chargeId });
      return null;
    }
    return this.db.transaction(() => {
      const inserted = this.db.sql
        .prepare("INSERT OR IGNORE INTO telegram_payments VALUES(?,?,?,?,?,'paid',?,NULL)")
        .run(
          input.chargeId,
          parsed.accountId,
          PREMIUM_PRODUCT,
          input.stars,
          input.payload,
          input.now,
        );
      if (!inserted.changes) {
        // Already settled. Report the state rather than paying twice.
        const premium = this.entitlements.premium(parsed.accountId, input.now);
        return {
          accountId: parsed.accountId,
          stars: input.stars,
          until: premium.until,
          fresh: false,
        };
      }
      const { until } = this.entitlements.grant({
        accountId: parsed.accountId,
        feature: PREMIUM,
        source: 'telegram_stars',
        days: telegramConfig.premiumDays || null,
        now: input.now,
      });
      return { accountId: parsed.accountId, stars: input.stars, until, fresh: true };
    });
  }

  /** What `/paysupport` shows, and what an administrator reads before refunding. */
  history(accountId: string): {
    chargeId: string;
    stars: number;
    status: string;
    createdAt: number;
  }[] {
    return this.db.sql
      .prepare(
        'SELECT charge_id, stars, status, created_at FROM telegram_payments WHERE account_id=? ORDER BY created_at DESC LIMIT 10',
      )
      .all(accountId)
      .map((row) => ({
        chargeId: String(row.charge_id),
        stars: Number(row.stars),
        status: String(row.status),
        createdAt: Number(row.created_at),
      }));
  }

  /**
   * Refunds a charge and takes the entitlement back with it.
   *
   * Telegram is asked first: if it refuses, nothing local changes, because a
   * revoked entitlement with the player's Stars still spent is the worst of
   * both outcomes.
   */
  async refund(input: {
    chargeId: string;
    telegramUserId: number;
    now: number;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const row = this.db.sql
      .prepare("SELECT account_id, status FROM telegram_payments WHERE charge_id=?")
      .get(input.chargeId);
    if (!row) return { ok: false, error: 'No such charge.' };
    if (String(row.status) === 'refunded') return { ok: true };

    const result = await this.api.refundStarPayment({
      userId: input.telegramUserId,
      chargeId: input.chargeId,
    });
    if (!result.ok) return { ok: false, error: result.description };

    this.db.transaction(() => {
      this.db.sql
        .prepare("UPDATE telegram_payments SET status='refunded', refunded_at=? WHERE charge_id=?")
        .run(input.now, input.chargeId);
      this.entitlements.revoke(String(row.account_id), PREMIUM);
    });
    return { ok: true };
  }
}
