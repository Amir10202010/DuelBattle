import { randomBytes } from 'node:crypto';
import { offerById, type Granted } from '@battle/shared';
import type { Database } from '../database.js';
import { log } from '../log.js';
import type { TelegramBotApi } from './api.js';
import { telegramConfig } from './config.js';
import { PREMIUM, type Entitlements } from '../entitlements.js';

/**
 * Telegram Stars, and the two rules that keep a payment system honest.
 *
 * **Nothing is delivered before `successful_payment`.** A pre-checkout query is
 * Telegram asking whether we are willing to sell; it is not money. The Mini App
 * gets a callback when the invoice closes, and that callback is a claim made by
 * a client, so it grants nothing either. Only the update that carries a charge
 * id moves an entitlement or a wallet.
 *
 * **The charge id is the primary key.** Telegram retries updates, and an outage
 * at the wrong moment means seeing the same `successful_payment` twice. With
 * the charge id as the key, the second write loses to a uniqueness constraint
 * and the purchase is delivered exactly once — in the same transaction as the
 * row that records why.
 *
 * Two kinds of product go through here: the Premium membership, and every
 * real-money offer in the store (gem packs, the starter and founder packs),
 * which are delivered by the same shop code the web checkout uses.
 */

export const PREMIUM_PRODUCT = 'premium';

/**
 * What Premium actually gives, in the order it is shown. Every line here is
 * something the code does; a benefit nobody built is not a benefit.
 */
export const PREMIUM_BENEFITS = [
  'A premium badge on your card and on the ladder',
  'The premium track of the current season pass, for as long as Premium is active',
  'The Patron title and banner, yours to keep',
] as const;

/** Items Premium hands over the first time it is bought. */
const PREMIUM_ITEMS = ['title-patron', 'banner-patron'];

/** `<product>:<accountId>:<nonce>` — carried through Telegram and back. */
function buildPayload(product: string, accountId: string): string {
  return `${product}:${accountId}:${randomBytes(6).toString('hex')}`;
}

export function parsePayload(payload: string): { product: string; accountId: string; orderId?: string } | null {
  const match = /^([a-z0-9_]{1,24}):([a-f0-9]{32}):([a-f0-9]{24}|[a-f0-9]{12})$/.exec(payload);
  return match ? { product: match[1]!, accountId: match[2]!, ...(match[3]!.length === 24 ? { orderId: match[3]! } : {}) } : null;
}

export interface PaymentGrant {
  accountId: string;
  stars: number;
  /** `premium`, or the id of the store offer that was bought. */
  product: string;
  until: number | null;
  /** What an offer delivered. Empty for Premium. */
  granted: Granted[];
  /** False when this charge had already been processed. */
  fresh: boolean;
}

/** The store, as far as a Stars payment needs to know it. */
export interface StarOffers {
  createOrder(accountId: string, offerId: string, now: number): string;
  canPayOrder(accountId: string, offerId: string, orderId: string, amount?: number, now?: number): boolean;
  available(accountId: string, offerId: string, now: number): boolean;
  fulfill(
    input: { accountId: string; offerId: string; chargeId: string; stars: number; orderId?: string },
    now: number,
  ): { granted: Granted[]; fresh: boolean } | null;
}

export class Payments {
  constructor(
    private readonly db: Database,
    private readonly api: TelegramBotApi,
    private readonly entitlements: Entitlements,
    private readonly offers?: StarOffers,
  ) {}

  get available(): boolean {
    return this.api.configured && telegramConfig.premiumStars > 0;
  }

  /** Whether store offers can be paid in Stars on this deployment. */
  get offersAvailable(): boolean {
    return this.api.configured && Boolean(this.offers);
  }

  /** A link the Mini App hands to `Telegram.WebApp.openInvoice`. */
  async invoiceFor(accountId: string): Promise<{ link: string } | { error: string }> {
    if (!this.available) return { error: 'Premium is not available on this server yet.' };
    const days = telegramConfig.premiumDays;
    const result = await this.api.createInvoiceLink({
      title: 'Duel Battle Premium',
      description: `${days ? `Premium for ${days} days: ` : 'Premium: '}a premium badge, the premium track of the current season pass while it lasts, and the Patron title and banner.`,
      payload: buildPayload(PREMIUM_PRODUCT, accountId),
      stars: telegramConfig.premiumStars,
      label: 'Duel Battle Premium',
    });
    if (!result.ok) return { error: 'We could not open the payment right now. Try again shortly.' };
    return { link: result.result };
  }

  /** An invoice for one of the store's real-money offers, priced in Stars. */
  async invoiceForOffer(accountId: string, offerId: string, now: number): Promise<{ link: string; orderId: string } | { error: string }> {
    const offer = offerById(offerId);
    if (!this.offersAvailable || !offer || offer.price.currency !== 'money')
      return { error: 'This offer is not sold here.' };
    if (!this.offers!.available(accountId, offerId, now)) return { error: 'You already have this.' };
    const orderId = this.offers!.createOrder(accountId, offerId, now);
    const result = await this.api.createInvoiceLink({
      title: offer.name,
      description: offer.description,
      payload: `${offer.id}:${accountId}:${orderId}`,
      stars: offer.price.stars,
      label: offer.name,
    });
    if (!result.ok) return { error: 'We could not open the payment right now. Try again shortly.' };
    return { link: result.result, orderId };
  }

  /**
   * Answers Telegram's pre-checkout question.
   *
   * Ten seconds is the entire budget, so this does one cheap check — is the
   * payload one of ours, for an account that exists, for something still on
   * sale to them — and says yes or no. It grants nothing.
   */
  approvePreCheckout(payload: string, now = Date.now(), payment?: { amount: number; currency: string }): { ok: boolean; message?: string } {
    const parsed = parsePayload(payload);
    if (!parsed) return { ok: false, message: 'This purchase is no longer available.' };
    if (!this.db.sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(parsed.accountId))
      return { ok: false, message: 'Open the Mini App and try again.' };
    const price = parsed.product === PREMIUM_PRODUCT ? telegramConfig.premiumStars : offerById(parsed.product)?.price;
    const expected = typeof price === 'number' ? price : price?.currency === 'money' ? price.stars : null;
    if (payment && (payment.currency !== 'XTR' || payment.amount !== expected))
      return { ok: false, message: 'This invoice has an invalid price.' };
    if (parsed.product === PREMIUM_PRODUCT) return { ok: this.available };
    const offer = offerById(parsed.product);
    if (!offer || offer.price.currency !== 'money' || !this.offers)
      return { ok: false, message: 'This purchase is no longer available.' };
    if (!this.offers.available(parsed.accountId, offer.id, now))
      return { ok: false, message: 'You already have this.' };
    if (parsed.orderId && !this.offers.canPayOrder(parsed.accountId, offer.id, parsed.orderId, payment?.amount, now))
      return { ok: false, message: 'This purchase is no longer available.' };
    return { ok: true };
  }

  /**
   * The only place a Stars payment turns into something delivered.
   *
   * One transaction: the charge row and what it bought land together or
   * neither does, so there is no window in which we have taken Stars without
   * recording what they paid for.
   */
  settle(input: {
    chargeId: string;
    payload: string;
    stars: number;
    now: number;
    currency?: string;
  }): PaymentGrant | null {
    const parsed = parsePayload(input.payload);
    const offer = parsed && parsed.product !== PREMIUM_PRODUCT ? offerById(parsed.product) : undefined;
    if (!parsed || (parsed.product !== PREMIUM_PRODUCT && (!offer || !this.offers))) {
      log.warn('telegram payment with an unrecognised payload', { chargeId: input.chargeId });
      return null;
    }
    const expected = parsed.product === PREMIUM_PRODUCT ? telegramConfig.premiumStars : offer?.price.currency === 'money' ? offer.price.stars : null;
    if (!Number.isSafeInteger(input.stars) || input.stars !== expected || (input.currency !== undefined && input.currency !== 'XTR')) return null;
    if (!this.db.sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(parsed.accountId)) return null;
    return this.db.transaction(() => {
      const existing = this.db.sql.prepare('SELECT account_id, product, payload FROM telegram_payments WHERE charge_id=?').get(input.chargeId);
      if (existing && (existing.account_id !== parsed.accountId || existing.product !== parsed.product || existing.payload !== input.payload)) return null;
      if (offer && parsed.orderId && !existing && !this.offers!.canPayOrder(parsed.accountId, offer.id, parsed.orderId, input.stars)) return null;
      const inserted = this.db.sql
        .prepare("INSERT OR IGNORE INTO telegram_payments VALUES(?,?,?,?,?,'paid',?,NULL)")
        .run(input.chargeId, parsed.accountId, parsed.product, input.stars, input.payload, input.now);

      if (offer) {
        // The shop keys its own record by the same charge id, so a repeat is
        // answered from what was delivered the first time.
        const delivered = this.offers!.fulfill(
          { accountId: parsed.accountId, offerId: offer.id, chargeId: input.chargeId, stars: input.stars, ...(parsed.orderId ? { orderId: parsed.orderId } : {}) },
          input.now,
        );
        if (!delivered) {
          log.warn('telegram payment did not match its offer', { chargeId: input.chargeId, offer: offer.id });
          return null;
        }
        return {
          accountId: parsed.accountId,
          stars: input.stars,
          product: offer.id,
          until: null,
          granted: delivered.granted,
          fresh: Boolean(inserted.changes) && delivered.fresh,
        };
      }

      if (!inserted.changes) {
        // Already settled. Report the state rather than paying twice.
        const premium = this.entitlements.premium(parsed.accountId, input.now);
        return { accountId: parsed.accountId, stars: input.stars, product: PREMIUM_PRODUCT, until: premium.until, granted: [], fresh: false };
      }
      const { until } = this.entitlements.grant({
        accountId: parsed.accountId,
        feature: PREMIUM,
        source: 'telegram_stars',
        days: telegramConfig.premiumDays || null,
        now: input.now,
      });
      for (const item of PREMIUM_ITEMS)
        this.db.sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(parsed.accountId, item, input.now);
      return { accountId: parsed.accountId, stars: input.stars, product: PREMIUM_PRODUCT, until, granted: [], fresh: true };
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
   * Refunds a charge and takes back what it bought.
   *
   * Telegram is asked first: if it refuses, nothing local changes, because a
   * revoked purchase with the player's Stars still spent is the worst of both
   * outcomes.
   */
  async refund(input: {
    chargeId: string;
    telegramUserId: number;
    now: number;
    /** Takes back an offer's delivery. Supplied by the service that owns the shop. */
    revokeOffer?: (chargeId: string, now: number) => void;
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const row = this.db.sql
      .prepare('SELECT account_id, product, status FROM telegram_payments WHERE charge_id=?')
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
      if (String(row.product) === PREMIUM_PRODUCT) this.entitlements.revoke(String(row.account_id), PREMIUM);
      else input.revokeOffer?.(input.chargeId, input.now);
    });
    return { ok: true };
  }
}
