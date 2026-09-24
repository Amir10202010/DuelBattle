import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Read by the config module at import, so it has to exist before anything loads it.
vi.hoisted(() => {
  process.env.ADMIN_EMAILS = 'boss@example.test';
});

import {
  CHALLENGES,
  DAILY_CALENDAR,
  POINTS_PER_TIER,
  STARTER_QUESTS,
  dailyBoard,
  dayKey,
  getChallenge,
  offerById,
  type PublicMatchState,
  type ServerMessage,
} from '@battle/shared';
import { Database } from '../src/database.js';
import { blankProfile } from '../src/profiles.js';
import { ensureWallet, economyView, grantCoins, creditCurrency } from '../src/economy.js';
import { MetaService } from '../src/meta/service.js';
import { StripeGateway, signStripePayload } from '../src/meta/stripe.js';
import { Payments } from '../src/telegram/payments.js';
import { Entitlements, passFeature } from '../src/entitlements.js';
import { Room } from '../src/room.js';
import { AuthService } from '../src/auth.js';
import { createApp, type App } from '../src/app.js';
import { emptyRoomFrame, failingFrameFor, passingFrameFor } from './helpers.js';
import type { TelegramBotApi } from '../src/telegram/api.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 23, 12);
let db: Database;
let meta: MetaService;

function account(id: string, email?: string, createdAt = NOW) {
  db.save({ ...blankProfile(id, createdAt), name: id.toUpperCase() });
  db.sql
    .prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,onboarded,created_at,email) VALUES(?,?,?,?,?,?,?)')
    .run(id, id, 'fixture', 'fixture', 1, createdAt, email ?? null);
  db.transaction(() => ensureWallet(db.sql, id, createdAt));
}

function gems(id: string, amount: number, receipt = `test-gems-${amount}`) {
  db.transaction(() => creditCurrency(db.sql, id, receipt, 'gems', amount, NOW));
}

const wallet = (id: string, at = NOW) => economyView(db.sql, id, db.get(id)!.xp, at);

beforeEach(() => {
  db = new Database(':memory:');
  meta = new MetaService(db, { adminEmails: ['boss@example.test'] });
  account('a');
  account('b');
});
afterEach(() => {
  // Closing an app closes its database too; the HTTP tests get there first.
  try {
    db.close();
  } catch {
    /* already closed */
  }
});

/** Plays a whole casual match through a real room: seat a wins every round. */
function casualMatch(at: number, options: { friend?: boolean } = {}) {
  const room = new Room(`CAS${Math.floor(at / 1000) % 100}`, at, {
    profiles: db,
    ranked: false,
    matchmade: !options.friend,
    meta: (match) => meta.settle(match),
    pool: CHALLENGES.filter((c) => c.judging === 'auto'),
  });
  const messages: ServerMessage[][] = [[], []];
  const seats = ['a', 'b'].map((identity, i) => {
    const joined = room.join(identity.toUpperCase(), at);
    room.attach(joined.playerId!, (m) => messages[i]!.push(m), at);
    room.identify(joined.playerId!, identity, at);
    room.handle(joined.playerId!, { t: 'cameraReady', ready: true }, at);
    return joined;
  });
  const state = (): PublicMatchState =>
    ([...messages[0]!].reverse().find((m) => m.t === 'state') as Extract<ServerMessage, { t: 'state' }>).state;
  if (options.friend) for (const seat of seats) room.handle(seat.playerId!, { t: 'ready', ready: true }, at);
  for (let i = 1; i < 200; i++) {
    const now = at + i * 1000;
    for (const seat of seats) room.handle(seat.playerId!, { t: 'frame', image: emptyRoomFrame(), seq: i }, now);
    room.tick(now);
    const current = state();
    if (current.phase === 'matchResult') break;
    if (current.phase !== 'challenge' || !current.round || current.players[seats[0]!.playerId!]?.submitted) continue;
    const detector = getChallenge(current.round.challengeId)!.detector!;
    room.handle(seats[0]!.playerId!, { t: 'submit', roundId: current.round.id, image: passingFrameFor(detector) }, now + 100);
    room.handle(seats[1]!.playerId!, { t: 'submit', roundId: current.round.id, image: failingFrameFor(detector) }, now + 200);
  }
  expect(state().phase).toBe('matchResult');
  const standings = (i: number) =>
    [...messages[i]!].reverse().find((m) => m.t === 'standings') as Extract<ServerMessage, { t: 'standings' }>;
  return { room, seats, state, standings };
}

describe('casual matches', () => {
  it('start themselves in a queue-made room once both cameras are on', () => {
    const room = new Room('AUTO1', NOW, { profiles: db, matchmade: true });
    const seats = ['a', 'b'].map((identity) => {
      const joined = room.join(identity, NOW);
      room.attach(joined.playerId!, () => undefined, NOW);
      return joined;
    });
    room.handle(seats[0]!.playerId!, { t: 'cameraReady', ready: true }, NOW);
    expect(room.phase).toBe('lobby');
    room.handle(seats[1]!.playerId!, { t: 'cameraReady', ready: true }, NOW);
    expect(room.phase).toBe('countdown');
  });

  it('keep the ready button in a friend room', () => {
    const room = new Room('FRND1', NOW, { profiles: db });
    const seats = ['a', 'b'].map((identity) => {
      const joined = room.join(identity, NOW);
      room.attach(joined.playerId!, () => undefined, NOW);
      room.handle(joined.playerId!, { t: 'cameraReady', ready: true }, NOW);
      return joined;
    });
    expect(room.phase).toBe('lobby');
    for (const seat of seats) room.handle(seat.playerId!, { t: 'ready', ready: true }, NOW);
    expect(room.phase).toBe('countdown');
  });

  it('pay XP, coins, pass points and quest progress without touching the rating', () => {
    const { seats, standings } = casualMatch(NOW);
    const winner = db.get('a')!;
    expect(winner.rating).toBe(1000);
    expect(winner.matchesPlayed).toBe(0);
    expect(winner.casualPlayed).toBe(1);
    expect(winner.casualWins).toBe(1);
    expect(winner.xp).toBeGreaterThan(0);
    expect(winner.history[0]).toMatchObject({ mode: 'casual', result: 'win', ratingBefore: 1000, ratingAfter: 1000 });

    const rewards = standings(0).rewards!;
    expect(rewards.casual).toBe(true);
    expect(rewards.coins).toBe(20);
    expect(rewards.meta!.pass!.points).toBeGreaterThan(0);
    expect(rewards.meta!.quests.some((q) => q.id === 'st-first-duel' && q.done)).toBe(true);
    expect(standings(0).lastMatch).toBeNull();
    // The loser still gets something for turning up.
    expect(standings(1).rewards!.xp).toBeGreaterThan(0);
    expect(standings(1).rewards!.coins).toBe(10);
    expect(seats).toHaveLength(2);
    expect(wallet('a').coins).toBe(160 + 20);
  }, 20000);

  it('stop paying after five matches between the same pair in a day', () => {
    for (let i = 0; i < 6; i++) casualMatch(NOW + i * 300_000);
    const payouts = db.sql
      .prepare("SELECT count(*) AS n FROM economy_ledger WHERE account_id='a' AND receipt LIKE 'casual:%'")
      .get()!.n;
    expect(payouts).toBe(5);
    // The sixth still happened: it is in the record, and it moved the quests.
    expect(db.get('a')!.casualPlayed).toBe(6);
  }, 60000);

  it('mark a friend-room match so friend quests can see it', () => {
    const settled = vi.spyOn(meta, 'settle');
    casualMatch(NOW, { friend: true });
    expect(settled.mock.calls[0]![0].friendRoom).toBe(true);
  }, 20000);
});

describe('quests', () => {
  it('pay coins and season points once when claimed', () => {
    const quest = meta.quests.view('a', NOW).starter[0]!;
    expect(quest.id).toBe('st-first-duel');
    expect(() => meta.claimQuest('a', quest.id, NOW)).toThrow('Finish the quest first');
    db.transaction(() => meta.quests.record('a', { type: 'match', result: 'loss', roundsWon: 0, validAnswers: 0, streak: 0, ranked: false, friendRoom: false, upset: false, fastestWinMs: null, firstOfDay: true }, NOW));
    const claimed = meta.claimQuest('a', quest.id, NOW);
    expect(claimed.granted).toEqual([{ kind: 'coins', amount: 150 }, { kind: 'pass', amount: 100 }]);
    expect(claimed.view.season.points).toBe(100);
    expect(() => meta.claimQuest('a', quest.id, NOW)).toThrow('Already collected');
    expect(wallet('a').coins).toBe(160 + 150);
  });

  it('hand over the starter items and drop the chain once it is done', () => {
    const event = { type: 'match' as const, result: 'win' as const, roundsWon: 3, validAnswers: 3, streak: 1, ranked: true, friendRoom: false, upset: false, fastestWinMs: 4000, firstOfDay: true };
    db.transaction(() => {
      meta.quests.record('a', event, NOW);
      meta.quests.record('a', { type: 'equip' }, NOW);
      meta.quests.record('a', { type: 'daily' }, NOW);
    });
    for (const quest of STARTER_QUESTS) meta.claimQuest('a', quest.id, NOW);
    const owned = wallet('a').owned;
    expect(owned).toEqual(expect.arrayContaining(['title-first-light', 'sunrise-parka', 'banner-sunrise']));
    expect(meta.quests.view('a', NOW).starter).toEqual([]);
    // The ranked step pays a chest, opened on the spot and recorded.
    expect(db.sql.prepare("SELECT count(*) AS n FROM chest_openings WHERE account_id='a'").get()!.n).toBe(1);
  });

  it('reset the daily board at midnight UTC but keep the weekly one', () => {
    const board = dailyBoard(dayKey(NOW));
    expect(meta.quests.view('a', NOW).daily.map((q) => q.id)).toEqual(board.map((q) => q.id));
    const monday = Date.UTC(2026, 8, 28, 1);
    expect(meta.quests.view('a', NOW + DAY).weekly.map((q) => q.id)).toEqual(meta.quests.view('a', NOW).weekly.map((q) => q.id));
    expect(meta.quests.view('a', monday).weeklyResetsAt).toBeGreaterThan(monday);
  });
});

describe('the season pass', () => {
  it('opens the premium track only with the pass, and opens every tier already reached', () => {
    db.transaction(() => meta.season.skipTiers('a', 3, NOW));
    expect(meta.claimTier('a', 1, 'free', NOW).granted).toEqual([{ kind: 'coins', amount: 100 }]);
    expect(() => meta.claimTier('a', 1, 'free', NOW)).toThrow('Already collected');
    expect(() => meta.claimTier('a', 4, 'free', NOW)).toThrow('Reach this tier first');
    expect(() => meta.claimTier('a', 1, 'premium', NOW)).toThrow('premium track');

    expect(() => meta.buy('a', 'season_pass', NOW)).toThrow('Not enough gems');
    gems('a', 600);
    meta.buy('a', 'season_pass', NOW);
    expect(wallet('a').gems).toBe(0);
    const tier1 = meta.claimTier('a', 1, 'premium', NOW).granted;
    expect(tier1).toEqual([{ kind: 'item', itemId: 'lamplighter' }, { kind: 'item', itemId: 'title-lights-on' }]);
    expect(() => meta.buy('a', 'season_pass', NOW)).toThrow('already have');
  });

  it('claims everything waiting at once', () => {
    gems('a', 1000);
    meta.buy('a', 'season_pass_plus', NOW);
    const view = meta.view('a', NOW).season;
    expect(view.tier).toBe(10);
    const all = meta.claimAllTiers('a', NOW);
    // Ten tiers, both tracks.
    expect(all.view.season.tiers.filter((t) => t.freeClaimed && t.premiumClaimed)).toHaveLength(10);
    expect(meta.season.claimable('a', NOW)).toEqual([]);
  });

  it('includes the premium track with an active membership', () => {
    new Entitlements(db).grant({ accountId: 'a', feature: 'premium', source: 'grant', days: 30, now: NOW });
    db.transaction(() => meta.season.skipTiers('a', 1, NOW));
    const view = meta.view('a', NOW).season;
    expect(view.premium).toBe(true);
    expect(view.premiumViaMembership).toBe(true);
    expect(meta.claimTier('a', 1, 'premium', NOW).granted.length).toBeGreaterThan(0);
  });

  it('never moves on a replayed receipt', () => {
    db.transaction(() => meta.season.skipTiers('a', 2, NOW));
    db.transaction(() => meta.season.skipTiers('a', 2, NOW));
    expect(meta.view('a', NOW).season.points).toBe(2 * POINTS_PER_TIER);
  });
});

describe('the daily calendar', () => {
  it('walks seven squares, one per day, and opens a chest on the seventh', () => {
    const granted = [];
    for (let day = 0; day < 7; day++) granted.push(meta.claimDaily('a', NOW + day * DAY).granted);
    expect(granted[0]).toEqual([{ kind: 'coins', amount: 40 }]);
    expect(granted[2]).toEqual([{ kind: 'gems', amount: 5 }]);
    const chest = granted[6]!.find((g) => g.kind === 'chest');
    expect(chest).toMatchObject({ kind: 'chest', chestId: 'battle' });
    expect(meta.view('a', NOW + 7 * DAY).calendar.index).toBe(0);
    expect(DAILY_CALENDAR).toHaveLength(7);
  });

  it('refuses a second claim on the same day', () => {
    meta.claimDaily('a', NOW);
    expect(() => meta.claimDaily('a', NOW + 60_000)).toThrow('Already collected today');
  });
});

describe('the shop', () => {
  it('sells gem-priced offers, once where the offer says once', () => {
    expect(() => meta.buy('a', 'coins_1200', NOW)).toThrow('Not enough gems');
    gems('a', 1000);
    meta.buy('a', 'coins_1200', NOW);
    meta.buy('a', 'coins_1200', NOW);
    expect(wallet('a')).toMatchObject({ gems: 800, coins: 160 + 2400 });
    meta.buy('a', 'bundle_arcade', NOW);
    expect(wallet('a').owned).toEqual(expect.arrayContaining(['arcade-jacket', 'pixel-storm', 'banner-arcade']));
    expect(() => meta.buy('a', 'bundle_arcade', NOW)).toThrow('already have');
    expect(wallet('a').gems).toBe(350);
  });

  it('refuses money offers at the gem counter', () => {
    gems('a', 5000);
    expect(() => meta.buy('a', 'gems_500', NOW)).toThrow('checkout');
  });

  it('sells today\'s deals at their discount and only today', () => {
    const deal = meta.view('a', NOW).store.deals[0]!;
    db.transaction(() => grantCoins(db.sql, 'a', 'deal-money', 9000, NOW));
    const before = wallet('a').coins;
    meta.buyDeal('a', deal.itemId, NOW);
    expect(before - wallet('a').coins).toBe(deal.price);
    expect(() => meta.buyDeal('a', deal.itemId, NOW)).toThrow();
    const tomorrow = meta.view('a', NOW + DAY).store.deals.map((d) => d.itemId);
    const notToday = meta.view('a', NOW).store.deals.find((d) => !tomorrow.includes(d.itemId));
    if (notToday) expect(() => meta.buyDeal('b', notToday.itemId, NOW + DAY)).toThrow('rotated out');
  });

  it('shows the starter pack for the first two weeks only', () => {
    account('late', undefined, NOW - 20 * DAY);
    expect(meta.view('a', NOW).store.offers.some((o) => o.id === 'starter_pack')).toBe(true);
    expect(meta.view('late', NOW).store.offers.some((o) => o.id === 'starter_pack')).toBe(false);
  });
});

describe('card payments', () => {
  const secret = 'whsec_test_secret';
  function stripeWith(response: object) {
    const calls: { url: string; body: string }[] = [];
    const fetchImpl = (async (url: string, init: { body: URLSearchParams }) => {
      calls.push({ url, body: String(init.body) });
      return { ok: true, status: 200, json: async () => response } as Response;
    }) as unknown as typeof fetch;
    return { gateway: new StripeGateway('sk_test_key', secret, fetchImpl), calls };
  }
  const event = (object: object, type = 'checkout.session.completed') =>
    JSON.stringify({ id: 'evt_1', type, data: { object } });

  it('accepts only events signed with the secret, recently', () => {
    const { gateway } = stripeWith({});
    const body = event({ id: 'cs_1' });
    const t = Math.floor(NOW / 1000);
    expect(gateway.verify(body, signStripePayload(secret, body, t), NOW)).not.toBeNull();
    expect(gateway.verify(body, signStripePayload('whsec_wrong', body, t), NOW)).toBeNull();
    expect(gateway.verify(body.replace('cs_1', 'cs_2'), signStripePayload(secret, body, t), NOW)).toBeNull();
    expect(gateway.verify(body, signStripePayload(secret, body, t - 3600), NOW)).toBeNull();
    expect(gateway.verify(body, undefined, NOW)).toBeNull();
  });

  it('delivers a paid order exactly once, and takes it back on refund', async () => {
    const { gateway, calls } = stripeWith({ id: 'cs_live', url: 'https://checkout.stripe.test/cs_live' });
    const shop = new MetaService(db, { stripe: gateway });
    const { url, orderId } = await shop.checkout('a', 'gems_500', 'https://game.test', NOW);
    expect(url).toContain('checkout.stripe.test');
    expect(calls[0]!.body).toContain('unit_amount%5D=499');
    expect(calls[0]!.body).toContain(`order_id%5D=${orderId}`);
    expect(wallet('a').gems).toBe(0);

    const paid = { id: 'cs_live', payment_status: 'paid', amount_total: 499, currency: 'usd', payment_intent: 'pi_1', metadata: { order_id: orderId } };
    shop.handleStripeEvent(JSON.parse(event(paid)), NOW);
    shop.handleStripeEvent(JSON.parse(event(paid)), NOW);
    expect(wallet('a').gems).toBe(500);
    expect(shop.orderStatus('a', orderId)).toMatchObject({ status: 'paid', granted: [{ kind: 'gems', amount: 500 }] });
    expect(shop.orderStatus('b', orderId)).toBeNull();

    shop.handleStripeEvent(JSON.parse(event({ payment_intent: 'pi_1', refunded: true }, 'charge.refunded')), NOW + 1000);
    expect(wallet('a').gems).toBe(0);
    expect(shop.orderStatus('a', orderId)!.status).toBe('refunded');
  });

  it('refuses a session that paid less than the price', async () => {
    const { gateway } = stripeWith({ id: 'cs_cheap', url: 'https://checkout.stripe.test/cs_cheap' });
    const shop = new MetaService(db, { stripe: gateway });
    const { orderId } = await shop.checkout('a', 'gems_2600', 'https://game.test', NOW);
    shop.handleStripeEvent(JSON.parse(event({ id: 'cs_cheap', payment_status: 'paid', amount_total: 99, currency: 'usd', metadata: { order_id: orderId } })), NOW);
    expect(wallet('a').gems).toBe(0);
  });

  it('is unavailable without keys, and says so', async () => {
    await expect(meta.checkout('a', 'gems_80', 'https://game.test', NOW)).rejects.toThrow('not available');
    expect(meta.view('a', NOW).store.payments).toEqual({ card: false, stars: false });
  });
});

describe('Telegram Stars offers', () => {
  const api = { configured: true } as unknown as TelegramBotApi;

  it('delivers a store offer once per charge, and refunds it', () => {
    const payments = new Payments(db, api, new Entitlements(db), meta.starOffers());
    const payload = `gems_1200:${'a'.repeat(32)}:${'b'.repeat(12)}`;
    account('a'.repeat(32));
    const id = 'a'.repeat(32);
    expect(payments.approvePreCheckout(payload, NOW).ok).toBe(true);
    const first = payments.settle({ chargeId: 'charge-1', payload, stars: 500, now: NOW })!;
    const again = payments.settle({ chargeId: 'charge-1', payload, stars: 500, now: NOW })!;
    expect(first).toMatchObject({ product: 'gems_1200', fresh: true, granted: [{ kind: 'gems', amount: 1200 }] });
    expect(again.fresh).toBe(false);
    expect(wallet(id).gems).toBe(1200);
  });

  it('keeps Premium honest: badge, the season track and the Patron items', () => {
    const payments = new Payments(db, api, new Entitlements(db), meta.starOffers());
    const id = 'c'.repeat(32);
    account(id);
    payments.settle({ chargeId: 'charge-p', payload: `premium:${id}:${'d'.repeat(12)}`, stars: 250, now: NOW });
    expect(wallet(id).owned).toEqual(expect.arrayContaining(['title-patron', 'banner-patron']));
    expect(meta.view(id, NOW).season.premiumViaMembership).toBe(true);
  });

  it('turns away an offer the account already has', () => {
    const payments = new Payments(db, api, new Entitlements(db), meta.starOffers());
    const id = 'e'.repeat(32);
    account(id);
    payments.settle({ chargeId: 'charge-s', payload: `starter_pack:${id}:${'f'.repeat(12)}`, stars: 100, now: NOW });
    expect(payments.approvePreCheckout(`starter_pack:${id}:${'1'.repeat(12)}`, NOW).ok).toBe(false);
    expect(offerById('starter_pack')!.limit).toBe('once');
  });
});

describe('the dashboard', () => {
  it('computes every figure from rows, empty or not', () => {
    const empty = meta.kpis(NOW);
    expect(empty.audience.accounts).toBe(2);
    expect(empty.monetization.revenue30dCents).toBe(0);

    account('old', undefined, NOW - 3 * DAY);
    meta.analytics.track('session_start', 'old', {}, NOW - 2 * DAY + 1000, 'sess0001');
    meta.analytics.track('session_ping', 'old', {}, NOW - 2 * DAY + 61_000, 'sess0001');
    const report = meta.kpis(NOW);
    expect(report.retention.cohortSizes.d1).toBeGreaterThanOrEqual(1);
    expect(report.retention.d1).toBeGreaterThan(0);
    expect(report.engagement.avgSessionMinutes).toBeGreaterThan(0);
    expect(report.funnel[0]!.step).toContain('Accounts');
  });

  it('is only for listed operators', () => {
    account('boss', 'boss@example.test');
    expect(meta.isAdmin('boss')).toBe(true);
    expect(meta.isAdmin('a')).toBe(false);
    expect(passFeature('s1')).toBe('pass:s1');
  });
});

describe('the lobby API over HTTP', () => {
  let app: App;
  afterEach(async () => app?.close());

  async function serve(stripe?: StripeGateway) {
    const auth = new AuthService(db);
    app = createApp({ profiles: db, auth, ...(stripe ? { stripe } : {}) });
    const port = await app.listen(0, '127.0.0.1');
    const url = `http://127.0.0.1:${port}`;
    const cookie = (id: string) => `battle_session=${auth.session(id)}`;
    const post = (path: string, body: unknown, id = 'a', headers: Record<string, string> = {}) =>
      fetch(`${url}${path}`, {
        method: 'POST',
        headers: { origin: url, 'x-battle-request': '1', 'content-type': 'application/json', cookie: cookie(id), ...headers },
        body: JSON.stringify(body),
      });
    return { url, cookie, post };
  }

  it('reads, claims and refuses what it should', async () => {
    const { url, cookie, post } = await serve();
    expect((await fetch(`${url}/api/meta`)).status).toBe(401);
    const view = await (await fetch(`${url}/api/meta`, { headers: { cookie: cookie('a') } })).json();
    expect(view).toMatchObject({ wallet: { coins: 160, gems: 0 }, admin: false });
    expect(view.claimable).toBeGreaterThan(0);

    // Same-origin and the custom header, as for every other write.
    expect((await post('/api/meta/daily', {}, 'a', { origin: 'https://evil.test' })).status).toBe(403);
    expect((await post('/api/meta/daily', {}, 'a', { 'x-battle-request': '0' })).status).toBe(403);
    const claimed = await post('/api/meta/daily', {});
    expect(claimed.status).toBe(200);
    expect((await claimed.json()).granted).toEqual([{ kind: 'coins', amount: 40 }]);
    expect((await post('/api/meta/daily', {})).status).toBe(409);
    expect((await post('/api/meta/buy', { offerId: 'season_pass' })).status).toBe(409);
    expect((await post('/api/meta/buy', { offerId: 'nope', price: 0 })).status).toBe(400);
    expect((await post('/api/meta/season/claim', { tier: 1, track: 'premium' })).status).toBe(409);
    expect((await post('/api/meta/checkout', { offerId: 'gems_80' })).status).toBe(503);
  });

  it('takes analytics beacons, from this site, for allowed names only', async () => {
    const { url, post } = await serve();
    const beacon = (origin: string) => fetch(`${url}/api/analytics`, {
      method: 'POST',
      headers: { origin, 'content-type': 'text/plain' },
      body: JSON.stringify({ session: 'abcdef123456', events: [{ name: 'store_opened', props: { from: 'home' } }, { name: 'purchase_completed' }, { name: 'store_opened', props: { note: 'free text here' } }] }),
    });
    expect((await beacon('https://evil.test')).status).toBe(403);
    const accepted = await beacon(url);
    expect(accepted.status).toBe(202);
    expect(await accepted.json()).toEqual({ kept: 2 });
    const rows = db.sql.prepare("SELECT name, props, session_id FROM analytics_events WHERE name='store_opened'").all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => String(r.props))).toEqual(['{"from":"home"}', '{}']);
    expect(db.sql.prepare("SELECT count(*) AS n FROM analytics_events WHERE name='purchase_completed'").get()!.n).toBe(0);
    void post;
  });

  it('opens the dashboard to operators only', async () => {
    account('boss', 'boss@example.test');
    const { url, cookie } = await serve();
    expect((await fetch(`${url}/api/admin/kpis`, { headers: { cookie: cookie('a') } })).status).toBe(403);
    const report = await fetch(`${url}/api/admin/kpis`, { headers: { cookie: cookie('boss') } });
    expect(report.status).toBe(200);
    expect(await report.json()).toHaveProperty('monetization.arpuCents');
  });

  it('believes a Stripe webhook only when it is signed', async () => {
    const secret = 'whsec_http_test';
    const stripe = new StripeGateway('sk_test_key', secret, (async () => ({
      ok: true, status: 200, json: async () => ({ id: 'cs_http', url: 'https://checkout.stripe.test/cs_http' }),
    })) as unknown as typeof fetch);
    const { url, cookie, post } = await serve(stripe);
    const { orderId } = await (await post('/api/meta/checkout', { offerId: 'gems_80' })).json();
    const body = JSON.stringify({ id: 'evt_h', type: 'checkout.session.completed', data: { object: { id: 'cs_http', payment_status: 'paid', amount_total: 99, currency: 'usd', metadata: { order_id: orderId } } } });
    const hook = (signature: string) => fetch(`${url}/api/pay/stripe/webhook`, { method: 'POST', headers: { 'stripe-signature': signature, 'content-type': 'application/json' }, body });
    expect((await hook('t=1,v1=' + '0'.repeat(64))).status).toBe(400);
    expect((await hook(signStripePayload(secret, body, Math.floor(Date.now() / 1000)))).status).toBe(200);
    const order = await (await fetch(`${url}/api/meta/orders/${orderId}`, { headers: { cookie: cookie('a') } })).json();
    expect(order).toMatchObject({ status: 'paid', granted: [{ kind: 'gems', amount: 80 }] });
  });
});
