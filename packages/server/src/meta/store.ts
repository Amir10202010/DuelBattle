import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  OFFERS,
  PASS_PLUS_TIERS,
  cosmetic,
  dailyDeals,
  dayKey,
  nextDayAt,
  normalizeLoadout,
  offerById,
  seasonAt,
  type Granted,
  type Offer,
  type StoreView,
} from '@battle/shared';
import { AuthError } from '../auth.js';
import { debitCurrency, ensureWallet, owns, purchase } from '../economy.js';
import { passFeature, type Entitlements } from '../entitlements.js';
import { applyRewards } from './grants.js';
import type { SeasonPass } from './season.js';

export type MoneyProvider = 'stripe' | 'telegram_stars';

export interface FulfilledOrder {
  orderId: string;
  accountId: string;
  offerId: string;
  granted: Granted[];
  /** False when this payment had already been delivered. */
  fresh: boolean;
}

const newOrderId = () => randomBytes(12).toString('hex');
const CHECKOUT_WINDOW_MS = 24 * 60 * 60_000;

/**
 * The shop behind every price in the game.
 *
 * Three kinds of payment end in the same place. Coins and gems are debited
 * here, inside the transaction that grants what they bought. Real money is
 * never taken here at all: an order is written as pending, a provider takes
 * the payment, and only the provider's signed confirmation — keyed by its own
 * id, which is unique in the table — moves the order to paid and delivers it.
 */
export class Shop {
  constructor(
    private readonly sql: DatabaseSync,
    private readonly entitlements: Entitlements,
    private readonly season: SeasonPass,
  ) {}

  private createdAt(accountId: string): number {
    return Number(this.sql.prepare('SELECT created_at FROM accounts WHERE id=?').get(accountId)?.created_at ?? 0);
  }

  /** Whether a limited offer is already used up for this account. */
  purchased(accountId: string, offer: Offer, now: number): boolean {
    if (offer.kind === 'pass') return this.entitlements.has(accountId, passFeature(seasonAt(now).id), now);
    if (offer.limit !== 'once') return false;
    return Boolean(
      this.sql
        .prepare("SELECT 1 FROM purchases WHERE account_id=? AND offer_id=? AND status='paid'")
        .get(accountId, offer.id),
    );
  }

  /** When a windowed offer stops being shown, or null for an offer that stays. */
  endsAt(accountId: string, offer: Offer): number | null {
    return offer.windowDays ? this.createdAt(accountId) + offer.windowDays * 86_400_000 : null;
  }

  private assertAvailable(accountId: string, offer: Offer, now: number): void {
    const ends = this.endsAt(accountId, offer);
    if (ends !== null && now > ends) throw new AuthError(410, 'This offer has ended.');
    if (this.purchased(accountId, offer, now)) throw new AuthError(409, 'You already have this.');
  }

  /** Whether this account could buy the offer right now, for a payment provider's pre-check. */
  canBuy(accountId: string, offerId: string, now: number): boolean {
    const offer = offerById(offerId);
    if (!offer) return false;
    try {
      this.assertAvailable(accountId, offer, now);
      return true;
    } catch {
      return false;
    }
  }

  view(accountId: string, now: number, payments: StoreView['payments']): StoreView {
    const owned = new Set(
      this.sql.prepare('SELECT item_id FROM inventory WHERE account_id=?').all(accountId).map((row) => String(row.item_id)),
    );
    return {
      offers: OFFERS.filter((offer) => {
        const ends = this.endsAt(accountId, offer);
        return ends === null || now <= ends;
      }).map((offer) => ({
        id: offer.id,
        kind: offer.kind,
        name: offer.name,
        description: offer.description,
        price: offer.price,
        rewards: offer.rewards,
        ...(offer.badge ? { badge: offer.badge } : {}),
        accent: offer.accent,
        purchased: this.purchased(accountId, offer, now),
        endsAt: this.endsAt(accountId, offer),
      })),
      deals: dailyDeals(dayKey(now)).map((deal) => ({ ...deal, owned: owned.has(deal.itemId) })),
      dealsResetAt: nextDayAt(now),
      payments,
    };
  }

  /**
   * Delivers an offer. Shared by every way of paying for one.
   *
   * A pass is an entitlement rather than a list of rewards; everything else is
   * rewards, paid under the order's own receipt.
   */
  private deliver(accountId: string, offer: Offer, orderId: string, now: number): Granted[] {
    ensureWallet(this.sql, accountId, now);
    if (offer.kind === 'pass') {
      const season = seasonAt(now);
      this.entitlements.grant({ accountId, feature: passFeature(season.id), source: 'gems', days: null, now });
      if (offer.id === 'season_pass_plus') {
        const moved = this.season.skipTiers(accountId, PASS_PLUS_TIERS, now);
        return moved ? [{ kind: 'pass', amount: moved.after - moved.before }] : [];
      }
      return [];
    }
    return applyRewards(this.sql, accountId, offer.rewards, `order:${orderId}`, now);
  }

  /** Buys an offer priced in coins or gems. The caller holds the transaction. */
  buyWithCurrency(accountId: string, offerId: string, now: number): { orderId: string; offer: Offer; granted: Granted[] } {
    const offer = offerById(offerId);
    if (!offer) throw new AuthError(404, 'That offer does not exist.');
    if (offer.price.currency === 'money') throw new AuthError(409, 'This one is paid for at checkout.');
    this.assertAvailable(accountId, offer, now);
    ensureWallet(this.sql, accountId, now);
    const orderId = newOrderId();
    debitCurrency(this.sql, accountId, `order:${orderId}`, offer.price.currency, offer.price.amount, now);
    const granted = this.deliver(accountId, offer, orderId, now);
    this.sql
      .prepare(
        `INSERT INTO purchases(order_id,account_id,offer_id,provider,provider_ref,amount,currency,status,granted,created_at,paid_at)
         VALUES(?,?,?,?,NULL,?,?,'paid',?,?,?)`,
      )
      .run(orderId, accountId, offer.id, offer.price.currency, offer.price.amount, offer.price.currency, JSON.stringify(granted), now, now);
    return { orderId, offer, granted };
  }

  /** Buys one of today's deals at its discounted coin price. */
  buyDeal(accountId: string, itemId: string, xp: number, now: number): Granted[] {
    const deal = dailyDeals(dayKey(now)).find((entry) => entry.itemId === itemId);
    if (!deal) throw new AuthError(410, 'That deal has rotated out. Check today\'s shelf.');
    if (owns(this.sql, accountId, itemId)) throw new AuthError(409, 'Already in your locker.');
    purchase(this.sql, accountId, itemId, xp, now, deal.price);
    return [{ kind: 'item', itemId }];
  }

  /** Opens a pending order for a real-money offer. Nothing is granted here. */
  createOrder(accountId: string, offerId: string, provider: MoneyProvider, now: number): { orderId: string; offer: Offer } {
    const offer = offerById(offerId);
    if (!offer || offer.price.currency !== 'money') throw new AuthError(404, 'That offer is not sold for money.');
    this.assertAvailable(accountId, offer, now);
    if (offer.limit === 'once') {
      const pending = this.sql.prepare("SELECT order_id, provider FROM purchases WHERE account_id=? AND offer_id=? AND status='pending' AND created_at>? ORDER BY created_at DESC LIMIT 1")
        .get(accountId, offerId, now - CHECKOUT_WINDOW_MS);
      if (pending) {
        if (pending.provider !== provider) throw new AuthError(409, 'Finish your existing checkout before opening another.');
        return { orderId: String(pending.order_id), offer };
      }
    }
    const orderId = newOrderId();
    const amount = provider === 'stripe' ? offer.price.usdCents : offer.price.stars;
    this.sql
      .prepare(
        `INSERT INTO purchases(order_id,account_id,offer_id,provider,provider_ref,amount,currency,status,created_at)
         VALUES(?,?,?,?,NULL,?,?,'pending',?)`,
      )
      .run(orderId, accountId, offer.id, provider, amount, provider === 'stripe' ? 'usd' : 'xtr', now);
    return { orderId, offer };
  }

  attachProviderRef(orderId: string, ref: string): void {
    this.sql.prepare("UPDATE purchases SET provider_ref=? WHERE order_id=? AND status='pending' AND (provider_ref IS NULL OR provider_ref=?)").run(ref, orderId, ref);
  }

  failOrder(orderId: string, providerRef?: string): void {
    this.sql.prepare("UPDATE purchases SET status='failed' WHERE order_id=? AND status='pending' AND (provider_ref IS NULL OR provider_ref=?)")
      .run(orderId, providerRef ?? null);
  }

  canPayStars(accountId: string, offerId: string, orderId: string, amount?: number, now?: number): boolean {
    const row = this.sql.prepare("SELECT amount, created_at FROM purchases WHERE order_id=? AND account_id=? AND offer_id=? AND provider='telegram_stars' AND status='pending'")
      .get(orderId, accountId, offerId);
    return Boolean(row && (amount === undefined || amount === Number(row.amount)) &&
      (now === undefined || Number(row.created_at) + CHECKOUT_WINDOW_MS > now));
  }

  /**
   * The most recent delivered order of one offer for one account. A Stars
   * payment is completed by the bot, not by the page that asked for it, so
   * this is how that page finds out what arrived.
   */
  latestPaid(accountId: string, offerId: string, since: number): { granted: Granted[]; paidAt: number } | null {
    const row = this.sql
      .prepare("SELECT granted, paid_at FROM purchases WHERE account_id=? AND offer_id=? AND status='paid' AND paid_at>=? ORDER BY paid_at DESC LIMIT 1")
      .get(accountId, offerId, since);
    return row ? { granted: JSON.parse(String(row.granted ?? '[]')) as Granted[], paidAt: Number(row.paid_at) } : null;
  }

  order(orderId: string): { accountId: string; offerId: string; status: string; granted: Granted[] } | null {
    const row = this.sql.prepare('SELECT account_id, offer_id, status, granted FROM purchases WHERE order_id=?').get(orderId);
    if (!row) return null;
    return {
      accountId: String(row.account_id),
      offerId: String(row.offer_id),
      status: String(row.status),
      granted: row.granted ? (JSON.parse(String(row.granted)) as Granted[]) : [],
    };
  }

  /**
   * Delivers a paid Stripe order. The caller holds the transaction and has
   * verified the webhook's signature.
   *
   * The amount is checked against the order rather than trusted: a session
   * that somehow charged less than the price is logged and left pending.
   */
  fulfillStripe(input: { orderId: string; sessionId: string; paymentIntent: string | null; amount: number; currency: string }, now: number): FulfilledOrder | null {
    const row = this.sql
      .prepare("SELECT account_id, offer_id, amount, status, granted, provider_ref FROM purchases WHERE order_id=? AND provider='stripe'")
      .get(input.orderId);
    if (!row) return null;
    const offer = offerById(String(row.offer_id));
    if (!offer || input.currency.toLowerCase() !== 'usd' || !Number.isSafeInteger(input.amount) || input.amount !== Number(row.amount)) return null;
    if (!input.sessionId || (row.provider_ref !== null && row.provider_ref !== input.sessionId)) return null;
    const accountId = String(row.account_id);
    if (String(row.status) === 'paid')
      return { orderId: input.orderId, accountId, offerId: offer.id, granted: JSON.parse(String(row.granted ?? '[]')) as Granted[], fresh: false };
    if (String(row.status) !== 'pending') return null;
    const refund = input.paymentIntent
      ? this.sql.prepare('SELECT amount, full FROM stripe_refunds WHERE payment_intent=?').get(input.paymentIntent)
      : undefined;
    // Webhooks may be delivered out of order: a fully refunded payment must
    // never hand over a pack when its checkout event arrives later.
    if (refund?.full === 1) {
      this.sql.prepare("UPDATE purchases SET status='refunded', paid_at=?, refunded_at=?, refunded_amount=amount, provider_ref=?, provider_payment=?, granted='[]' WHERE order_id=?")
        .run(now, now, input.sessionId, input.paymentIntent, input.orderId);
      return { orderId: input.orderId, accountId, offerId: offer.id, granted: [], fresh: false };
    }
    const granted = this.deliver(accountId, offer, input.orderId, now);
    this.sql
      .prepare("UPDATE purchases SET status='paid', paid_at=?, provider_ref=?, provider_payment=?, granted=?, refunded_amount=? WHERE order_id=?")
      .run(now, input.sessionId, input.paymentIntent, JSON.stringify(granted), Math.min(Number(row.amount), Number(refund?.amount ?? 0)), input.orderId);
    return { orderId: input.orderId, accountId, offerId: offer.id, granted, fresh: true };
  }

  /**
   * Delivers an offer paid in Telegram Stars. The charge id is the key: a
   * repeated `successful_payment` finds its row and delivers nothing twice.
   */
  fulfillStars(input: { accountId: string; offerId: string; chargeId: string; stars: number; orderId?: string }, now: number): FulfilledOrder | null {
    const offer = offerById(input.offerId);
    if (!offer || offer.price.currency !== 'money' || !Number.isSafeInteger(input.stars) || input.stars !== offer.price.stars) return null;
    const existing = this.sql
      .prepare("SELECT order_id, account_id, offer_id, status, granted FROM purchases WHERE provider='telegram_stars' AND provider_ref=?")
      .get(input.chargeId);
    if (existing) {
      if (existing.account_id !== input.accountId || existing.offer_id !== offer.id || (input.orderId && existing.order_id !== input.orderId)) return null;
      return { orderId: String(existing.order_id), accountId: input.accountId, offerId: offer.id,
        granted: existing.status === 'paid' ? JSON.parse(String(existing.granted ?? '[]')) as Granted[] : [], fresh: false };
    }
    if (input.orderId && !this.canPayStars(input.accountId, offer.id, input.orderId, input.stars)) return null;
    const orderId = input.orderId ?? newOrderId();
    const granted = this.deliver(input.accountId, offer, orderId, now);
    if (input.orderId) {
      this.sql.prepare("UPDATE purchases SET status='paid', provider_ref=?, granted=?, paid_at=? WHERE order_id=?")
        .run(input.chargeId, JSON.stringify(granted), now, orderId);
      return { orderId, accountId: input.accountId, offerId: offer.id, granted, fresh: true };
    }
    this.sql
      .prepare(
        `INSERT INTO purchases(order_id,account_id,offer_id,provider,provider_ref,amount,currency,status,granted,created_at,paid_at)
         VALUES(?,?,?,'telegram_stars',?,?,'xtr','paid',?,?,?)`,
      )
      .run(orderId, input.accountId, offer.id, input.chargeId, input.stars, JSON.stringify(granted), now, now);
    return { orderId, accountId: input.accountId, offerId: offer.id, granted, fresh: true };
  }

  /**
   * Refunds are cumulative and can precede checkout delivery. Partial refunds
   * reduce recorded revenue; content is revoked only on a full refund.
   */
  stripeRefund(paymentIntent: string, amount: number, full: boolean, now: number): { orderId: string; accountId: string } | null {
    if (!Number.isSafeInteger(amount) || amount < 0) return null;
    this.sql.prepare(`INSERT INTO stripe_refunds(payment_intent,amount,full) VALUES(?,?,?)
      ON CONFLICT(payment_intent) DO UPDATE SET amount=max(amount,excluded.amount), full=max(full,excluded.full)`)
      .run(paymentIntent, amount, Number(full));
    const recorded = this.sql.prepare('SELECT amount, full FROM stripe_refunds WHERE payment_intent=?').get(paymentIntent)!;
    this.sql.prepare('UPDATE purchases SET refunded_amount=min(amount,?) WHERE provider=\'stripe\' AND provider_payment=?')
      .run(Number(recorded.amount), paymentIntent);
    return recorded.full === 1 ? this.refund({ paymentIntent }, now) : null;
  }

  /**
   * Takes back what a refunded payment bought.
   *
   * Currency comes back as far as the wallet allows and never below zero; items
   * that arrived new leave the locker (and the loadout); a pass is revoked.
   * Duplicates were paid as coins, and those coins are what is taken back.
   */
  refund(where: { paymentIntent?: string; chargeId?: string }, now: number): { orderId: string; accountId: string } | null {
    const row = where.paymentIntent
      ? this.sql.prepare("SELECT order_id, account_id, offer_id, granted, status FROM purchases WHERE provider_payment=?").get(where.paymentIntent)
      : this.sql.prepare("SELECT order_id, account_id, offer_id, granted, status FROM purchases WHERE provider='telegram_stars' AND provider_ref=?").get(where.chargeId ?? '');
    if (!row || String(row.status) !== 'paid') return null;
    const orderId = String(row.order_id);
    const accountId = String(row.account_id);
    const granted = JSON.parse(String(row.granted ?? '[]')) as Granted[];
    const take = (currency: 'coins' | 'gems', amount: number, tag: string) => {
      if (amount <= 0) return;
      const have = Number(this.sql.prepare(`SELECT ${currency} AS n FROM wallets WHERE account_id=?`).get(accountId)?.n ?? 0);
      const taken = Math.min(have, amount);
      if (!taken) return;
      this.sql.prepare(`UPDATE wallets SET ${currency}=${currency}-? WHERE account_id=?`).run(taken, accountId);
      this.sql
        .prepare('INSERT OR IGNORE INTO economy_ledger(account_id,receipt,delta,item_id,at,currency) VALUES(?,?,?,NULL,?,?)')
        .run(accountId, `refund:${orderId}:${tag}`, -taken, now, currency);
    };
    const walk = (entries: Granted[], path: string) => entries.forEach((entry, index) => {
      const tag = `${path}${index}`;
      if (entry.kind === 'coins' || entry.kind === 'gems') take(entry.kind, entry.amount, tag);
      else if (entry.kind === 'item') {
        if (entry.duplicate) take('coins', entry.duplicate.coins, tag);
        else this.removeItem(accountId, entry.itemId);
      } else if (entry.kind === 'chest') walk(entry.contents, `${tag}.`);
    });
    walk(granted, '');
    const offer = offerById(String(row.offer_id));
    if (offer?.kind === 'pass') this.entitlements.revoke(accountId, passFeature(seasonAt(now).id));
    this.sql.prepare("UPDATE purchases SET status='refunded', refunded_at=?, refunded_amount=amount WHERE order_id=?").run(now, orderId);
    return { orderId, accountId };
  }

  private removeItem(accountId: string, itemId: string): void {
    this.sql.prepare('DELETE FROM inventory WHERE account_id=? AND item_id=?').run(accountId, itemId);
    const wallet = this.sql.prepare('SELECT loadout FROM wallets WHERE account_id=?').get(accountId);
    if (!wallet) return;
    const loadout = normalizeLoadout(JSON.parse(String(wallet.loadout)));
    const slot = cosmetic(itemId)?.slot;
    if (slot && loadout[slot] === itemId) {
      delete loadout[slot];
      this.sql.prepare('UPDATE wallets SET loadout=? WHERE account_id=?').run(JSON.stringify(normalizeLoadout(loadout)), accountId);
    }
  }
}
