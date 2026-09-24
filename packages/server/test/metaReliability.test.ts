import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../src/database.js';
import { blankProfile } from '../src/profiles.js';
import { economyView, ensureWallet } from '../src/economy.js';
import { plainSummary, recordCasual } from '../src/standings.js';
import { MetaService } from '../src/meta/service.js';
import { applyRewards } from '../src/meta/grants.js';
import { sweepMeta } from '../src/meta/schema.js';
import type { SettledMatch } from '../src/settlement.js';
import { Payments } from '../src/telegram/payments.js';
import { StripeGateway, signStripePayload, type StripeEvent } from '../src/meta/stripe.js';
import type { TelegramBotApi } from '../src/telegram/api.js';

const NOW = Date.UTC(2026, 8, 23, 12);
let db: Database;
let meta: MetaService;
beforeEach(() => {
  db = new Database(':memory:');
  meta = new MetaService(db);
  for (const id of ['a', 'b']) {
    db.save({ ...blankProfile(id, NOW), name: id });
    db.sql.prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)')
      .run(id, id, 'fixture', 'fixture', NOW);
    db.transaction(() => ensureWallet(db.sql, id, NOW));
  }
});
afterEach(() => db.close());

const contestant = (id: string, score: number, forfeited = false) => ({
  id, name: id, score, summary: { ...plainSummary(), validAnswers: 2, forfeited },
});

describe('durable match settlement', () => {
  it('uses the engine winner when the leading player forfeits', () => {
    const updates = recordCasual(db, contestant('a', 2, true), contestant('b', 1), NOW, 'forfeit', 'b');
    expect(updates.a).toMatchObject({ result: 'loss', rewarded: false, rewards: { xp: 0 } });
    expect(updates.b).toMatchObject({ result: 'win', rewarded: true, rewards: { coins: 20 } });
    expect(db.get('a')!.casualWins).toBe(0);
    expect(db.get('b')!.casualWins).toBe(1);
  });

  it('records capped matches exactly once, even after housekeeping', () => {
    for (let i = 0; i < 6; i++) recordCasual(db, contestant('a', 3), contestant('b', 0), NOW, `match-${i}`);
    const profile = db.get('a');
    expect(profile!.casualPlayed).toBe(6);
    expect(profile!.history[0]!.xp).toBe(0);
    expect(db.sql.prepare('SELECT count(*) AS n FROM casual_receipts').get()!.n).toBe(6);
    sweepMeta(db.sql, NOW + 10 * 86_400_000);
    for (const id of ['match-0', 'match-5'])
      expect(recordCasual(db, contestant('a', 3), contestant('b', 0), NOW, id)).toEqual({});
    expect(db.get('a')).toEqual(profile);
  });

  it('applies quests, analytics and pass points only once per player and match', () => {
    const updates = recordCasual(db, contestant('a', 3), contestant('b', 0), NOW, 'once');
    const match: SettledMatch = {
      matchId: 'once', roomCode: 'ROOM1', ranked: false, friendRoom: false, at: NOW,
      players: ['a', 'b'].map((id) => ({
        accountId: id, name: id, score: id === 'a' ? 3 : 0,
        result: updates[id]!.result, ratingBefore: 1000, ratingAfter: 1000, ratingChange: 0,
        streak: 0, rewards: updates[id]!.rewards, validAnswers: 2, fastestWinMs: null, rewarded: true,
      })) as SettledMatch['players'],
    };
    const first = meta.settle(match);
    const view = meta.view('a', NOW);
    expect(meta.settle(match)).toEqual(first);
    expect(meta.view('a', NOW)).toEqual(view);
    expect(meta.analytics.count('match_completed', NOW)).toBe(2);
    expect(meta.kpis(NOW).engagement.casualToday).toBe(1);
  });

  it('pays at most twelve casual matches per account per UTC day', () => {
    for (let i = 0; i < 13; i++) {
      const id = `opponent-${i}`;
      db.save(blankProfile(id, NOW));
      db.sql.prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)')
        .run(id, id, 'fixture', 'fixture', NOW);
      const result = recordCasual(db, contestant('a', 3), contestant(id, 1), NOW, `cap-${i}`);
      expect(result.a!.rewarded).toBe(i < 12);
    }
    expect(db.get('a')!.casualPlayed).toBe(13);
  });
});

describe('reward receipts', () => {
  it('replays the original item without inventing duplicate compensation', () => {
    const grant = () => db.transaction(() => applyRewards(db.sql, 'a', [
      { kind: 'item', itemId: 'title-first-light' }, { kind: 'coins', amount: 100 },
    ], 'one-reward', NOW));
    const first = grant();
    const before = economyView(db.sql, 'a', 0, NOW);
    expect(grant()).toEqual(first);
    expect(economyView(db.sql, 'a', 0, NOW)).toEqual(before);
    const duplicate = db.transaction(() => applyRewards(db.sql, 'a', [
      { kind: 'item', itemId: 'title-first-light' },
    ], 'different-reward', NOW));
    expect(duplicate[0]).toHaveProperty('duplicate');
  });
});

describe('payment delivery boundaries', () => {
  const paidEvent = (orderId: string, sessionId = 'cs_bound', amount = 499): StripeEvent => ({
    id: 'evt_payment', type: 'checkout.session.completed',
    data: { object: { id: sessionId, payment_status: 'paid', amount_total: amount,
      currency: 'usd', payment_intent: 'pi_bound', metadata: { order_id: orderId } } },
  });
  const refundEvent = (amount: number, full = false): StripeEvent => ({
    id: 'evt_refund', type: 'charge.refunded',
    data: { object: { payment_intent: 'pi_bound', refunded: full, amount_refunded: amount } },
  });
  const order = (offerId = 'gems_500') => {
    const { orderId } = db.transaction(() => meta.shop.createOrder('a', offerId, 'stripe', NOW));
    meta.shop.attachProviderRef(orderId, 'cs_bound');
    return orderId;
  };

  it('requires the attached checkout session and the exact price', () => {
    const id = order();
    meta.handleStripeEvent(paidEvent(id, 'cs_wrong'), NOW);
    meta.handleStripeEvent(paidEvent(id, 'cs_bound', 500), NOW);
    meta.handleStripeEvent(paidEvent(id, 'cs_bound', NaN), NOW);
    expect(meta.orderStatus('a', id)!.status).toBe('pending');
    expect(economyView(db.sql, 'a', 0, NOW).gems).toBe(0);
    meta.handleStripeEvent(paidEvent(id), NOW);
    expect(economyView(db.sql, 'a', 0, NOW).gems).toBe(500);
  });

  it('reuses the pending checkout for a one-time pack', () => {
    const first = order('starter_pack');
    const again = db.transaction(() => meta.shop.createOrder('a', 'starter_pack', 'stripe', NOW));
    expect(again.orderId).toBe(first);
    meta.shop.failOrder(first, 'cs_wrong');
    expect(meta.orderStatus('a', first)!.status).toBe('pending');
    meta.shop.failOrder(first, 'cs_bound');
    const retry = db.transaction(() => meta.shop.createOrder('a', 'starter_pack', 'stripe', NOW));
    expect(retry.orderId).not.toBe(first);
    // An abandoned invoice cannot reserve the offer indefinitely or prevent
    // the player from changing payment rails tomorrow.
    const later = db.transaction(() => meta.shop.createOrder('a', 'starter_pack', 'telegram_stars', NOW + 86_400_001));
    expect(later.orderId).not.toBe(retry.orderId);
    expect(meta.shop.canPayStars('a', 'starter_pack', later.orderId, 100, NOW + 2 * 86_400_000 + 2)).toBe(false);
  });

  it('accounts for cumulative partial refunds without revoking a whole pack', () => {
    const id = order();
    meta.handleStripeEvent(paidEvent(id), NOW);
    meta.handleStripeEvent(refundEvent(200), NOW);
    meta.handleStripeEvent(refundEvent(100), NOW); // Older webhook arrives last.
    expect(meta.kpis(NOW).monetization.cardRevenue30dCents).toBe(299);
    expect(economyView(db.sql, 'a', 0, NOW).gems).toBe(500);
    meta.handleStripeEvent(refundEvent(499, true), NOW);
    meta.handleStripeEvent(paidEvent(id), NOW);
    expect(meta.orderStatus('a', id)!.status).toBe('refunded');
    expect(economyView(db.sql, 'a', 0, NOW).gems).toBe(0);
    expect(meta.kpis(NOW).monetization.cardRevenue30dCents).toBe(0);
  });

  it('never grants a pack when the full refund arrived before checkout completion', () => {
    const id = order();
    meta.handleStripeEvent(refundEvent(499, true), NOW);
    meta.handleStripeEvent(paidEvent(id), NOW);
    expect(meta.orderStatus('a', id)).toEqual({ status: 'refunded', granted: [] });
    expect(economyView(db.sql, 'a', 0, NOW).gems).toBe(0);
  });

  it('rejects a signed but malformed webhook body', () => {
    const gateway = new StripeGateway('test', 'secret');
    for (const object of [null, [], 'invalid']) {
      const body = JSON.stringify({ id: 'evt', type: 'checkout.session.completed', data: { object } });
      expect(gateway.verify(body, signStripePayload('secret', body, NOW / 1000), NOW)).toBeNull();
    }
  });

  it('binds Stars delivery to the invoice order and validates the charged currency and amount', async () => {
    const id = 'a'.repeat(32);
    db.save(blankProfile(id, NOW));
    db.sql.prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)')
      .run(id, id, 'fixture', 'fixture', NOW);
    let payload = '';
    const api = {
      configured: true,
      createInvoiceLink: async (input: { payload: string }) => { payload = input.payload; return { ok: true, result: 'https://t.me/invoice' }; },
    } as unknown as TelegramBotApi;
    const payments = new Payments(db, api, meta.entitlements, meta.starOffers());
    const invoice = await payments.invoiceForOffer(id, 'gems_500', NOW);
    expect(invoice).toHaveProperty('orderId');
    if (!('orderId' in invoice)) throw new Error('Invoice failed');
    expect(payload.endsWith(invoice.orderId)).toBe(true);
    expect(meta.orderStatus(id, invoice.orderId)!.status).toBe('pending');
    const charge = { payload, chargeId: 'tg_charge', stars: 250, currency: 'XTR', now: NOW };
    expect(payments.approvePreCheckout(payload, NOW, { amount: 250, currency: 'USD' }).ok).toBe(false);
    expect(payments.settle({ ...charge, stars: 249 })).toBeNull();
    expect(payments.settle({ ...charge, currency: 'USD' })).toBeNull();
    expect(db.sql.prepare('SELECT count(*) AS n FROM telegram_payments').get()!.n).toBe(0);
    expect(payments.settle(charge)!.fresh).toBe(true);
    expect(meta.orderStatus(id, invoice.orderId)).toMatchObject({ status: 'paid', granted: [{ kind: 'gems', amount: 500 }] });
    expect(payments.settle(charge)!.fresh).toBe(false);
    expect(economyView(db.sql, id, 0, NOW).gems).toBe(500);
    expect(payments.approvePreCheckout(payload, NOW, { amount: 250, currency: 'XTR' }).ok).toBe(false);
  });
});
