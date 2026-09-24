import { createHmac } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

/**
 * The Telegram side, end to end, through the real HTTP server.
 *
 * The configuration is read from the environment when the module loads, so
 * everything under test is imported *dynamically* after these are set. A static
 * import would evaluate `telegramConfig` first and the whole subsystem would
 * switch itself off.
 */
const BOT_TOKEN = '7000000000:AAH-test-token-not-a-real-one_0123456789';
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_BOT_USERNAME = 'DuelBattleTestBot';
process.env.TELEGRAM_WEBHOOK_SECRET = 'a-webhook-secret-for-tests-0123456789';
process.env.TELEGRAM_MINI_APP_URL = 'https://duel.example';
process.env.TELEGRAM_ADMIN_IDS = '900001';
process.env.TELEGRAM_PREMIUM_STARS = '250';
process.env.TELEGRAM_PREMIUM_DAYS = '30';

type AppModule = Awaited<ReturnType<typeof importApp>>;
type DatabaseModule = Awaited<ReturnType<typeof importDatabase>>;
type AuthModule = Awaited<ReturnType<typeof importAuth>>;
type IdentityModule = Awaited<ReturnType<typeof importIdentity>>;

const importApp = () => import('../src/app.js');
const importDatabase = () => import('../src/database.js');
const importAuth = () => import('../src/auth.js');
const importIdentity = () => import('../src/identity.js');

interface Modules {
  createApp: AppModule['createApp'];
  Database: DatabaseModule['Database'];
  AuthService: AuthModule['AuthService'];
  Identities: IdentityModule['Identities'];
}

let modules: Modules;
beforeAll(async () => {
  const [app, database, auth, identity] = await Promise.all([
    importApp(),
    importDatabase(),
    importAuth(),
    importIdentity(),
  ]);
  modules = {
    createApp: app.createApp,
    Database: database.Database,
    AuthService: auth.AuthService,
    Identities: identity.Identities,
  };
});

/** Signs a launch payload exactly as Telegram does. */
function initData(
  user: { id: number; first_name?: string; username?: string; allows_write_to_pm?: boolean },
  extra: Record<string, string> = {},
  token = BOT_TOKEN,
  at = Date.now(),
): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(at / 1000)),
    user: JSON.stringify({ first_name: 'Player', allows_write_to_pm: true, ...user }),
    ...extra,
  };
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let app: Awaited<ReturnType<Modules['createApp']>>;
afterEach(async () => {
  if (app) await app.close();
});

async function setup() {
  const db = new modules.Database(':memory:');
  const auth = new modules.AuthService(db);
  app = modules.createApp({
    profiles: db,
    auth,
    identities: new modules.Identities(Buffer.from('a-test-secret-that-is-long-enough')),
  });
  const port = await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;

  const call = (
    path: string,
    options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
  ) =>
    fetch(`${url}/api/telegram/${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        origin: url,
        ...(options.body === undefined
          ? {}
          : { 'content-type': 'application/json', 'x-battle-request': '1' }),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

  /** Signs in a Telegram user and returns their session plus a bound caller. */
  const signIn = async (id: number, extra: Record<string, string> = {}) => {
    const response = await call('auth', {
      body: { initData: initData({ id, first_name: `Player${id}` }, extra) },
    });
    expect(response.status).toBe(200);
    const session = (await response.json()) as {
      token: string;
      intent: { kind: string; accepted?: boolean; code?: string };
      home: { me: { name: string; referralCode: string; rating: number } };
    };
    return {
      ...session,
      get: (path: string) => call(path, { token: session.token }),
      post: (path: string, body: unknown = {}) =>
        call(path, { token: session.token, body, method: 'POST' }),
    };
  };

  const webhook = (update: unknown, secret = process.env.TELEGRAM_WEBHOOK_SECRET!) =>
    fetch(`${url}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': secret,
      },
      body: JSON.stringify(update),
    });

  /**
   * Materialises a wallet the way the game does, so a coin assertion measures
   * the grant under test rather than the welcome bonus that comes with the
   * first wallet. It also proves the bearer token works on the pre-existing
   * economy route, not only on the Telegram ones.
   */
  const economy = (token: string) =>
    fetch(`${url}/api/economy`, { headers: { authorization: `Bearer ${token}` } });

  return { db, auth, url, port, call, signIn, webhook, economy, telegram: app.telegram! };
}

describe('telegram authentication', () => {
  it('creates one player for a Telegram user and reuses it', async () => {
    const { signIn, db } = await setup();
    const first = await signIn(4242);
    expect(first.home.me.name).toBe('Player4242');
    expect(first.intent).toEqual({ kind: 'home' });

    const second = await signIn(4242);
    expect(second.token).not.toBe(first.token);
    expect(db.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n).toBe(1);
    expect(db.sql.prepare('SELECT count(*) AS n FROM telegram_identities').get()!.n).toBe(1);
  });

  it('refuses a forged signature and creates nothing', async () => {
    const { call, db } = await setup();
    const forged = initData({ id: 5 }, {}, '7000000000:AAH-some-other-bot-token_0123456789');
    const response = await call('auth', { body: { initData: forged } });
    expect(response.status).toBe(401);
    expect(db.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n).toBe(0);
  });

  it('refuses a launch older than the window', async () => {
    const { call } = await setup();
    const stale = initData({ id: 6 }, {}, BOT_TOKEN, Date.now() - 48 * 3_600_000);
    expect((await call('auth', { body: { initData: stale } })).status).toBe(401);
  });

  it('refuses a user id edited after signing', async () => {
    const { call } = await setup();
    const signed = new URLSearchParams(initData({ id: 7 }));
    signed.set('user', JSON.stringify({ id: 999, first_name: 'Mallory' }));
    expect((await call('auth', { body: { initData: signed.toString() } })).status).toBe(401);
  });

  it('will not serve a session route without a token', async () => {
    const { call } = await setup();
    expect((await call('home')).status).toBe(401);
    expect((await call('me')).status).toBe(401);
  });

  it('will not accept a bearer token it never issued', async () => {
    const { call } = await setup();
    expect((await call('home', { token: 'f'.repeat(64) })).status).toBe(401);
  });

  it('refuses a cross-site POST even with a valid token', async () => {
    const { signIn, url } = await setup();
    const me = await signIn(8);
    const response = await fetch(`${url}/api/telegram/quests/claim`, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
        'x-battle-request': '1',
        authorization: `Bearer ${me.token}`,
      },
      body: JSON.stringify({ questId: 'play-1' }),
    });
    expect(response.status).toBe(403);
  });
});

describe('referrals', () => {
  it('records an inviter once and never rewrites it', async () => {
    const { signIn } = await setup();
    const alice = await signIn(100);
    const bob = await signIn(101);
    const code = alice.home.me.referralCode;

    const joined = await signIn(102, { start_param: `ref_${code}` });
    expect(joined.intent).toEqual({ kind: 'referral', accepted: true });

    // A second link, from somebody else, changes nothing.
    const again = await signIn(102, { start_param: `ref_${bob.home.me.referralCode}` });
    expect(again.intent).toEqual({ kind: 'referral', accepted: false });

    const stats = await (await alice.get('me')).json();
    expect(stats.referrals.joined).toBe(1);
  });

  it('refuses a self-referral', async () => {
    const { signIn } = await setup();
    const alice = await signIn(110);
    const again = await signIn(110, { start_param: `ref_${alice.home.me.referralCode}` });
    expect(again.intent).toEqual({ kind: 'referral', accepted: false });
  });

  it('ignores an unknown code without failing the launch', async () => {
    const { signIn } = await setup();
    const joined = await signIn(120, { start_param: 'ref_ZZZZZZZ' });
    expect(joined.intent).toEqual({ kind: 'referral', accepted: false });
  });

  it('pays both sides once, when the invited player finishes a match', async () => {
    const { signIn, telegram, db, economy } = await setup();
    const alice = await signIn(130);
    const bob = await signIn(131, { start_param: `ref_${alice.home.me.referralCode}` });
    expect((await economy(alice.token)).status).toBe(200);
    expect((await economy(bob.token)).status).toBe(200);

    const inviter = telegram.identities.byTelegramId(130)!.accountId;
    const invitee = telegram.identities.byTelegramId(131)!.accountId;

    const before = Number(
      db.sql.prepare('SELECT coins FROM wallets WHERE account_id=?').get(inviter)?.coins ?? 0,
    );
    const first = telegram.referrals.activate(invitee, Date.now());
    expect(first?.inviterAccountId).toBe(inviter);
    // Running the same activation again pays nothing: the ledger receipt holds.
    expect(telegram.referrals.activate(invitee, Date.now())).toBeNull();

    const after = Number(
      db.sql.prepare('SELECT coins FROM wallets WHERE account_id=?').get(inviter)!.coins,
    );
    expect(after).toBe(before + 150);
    expect(telegram.referrals.stats(inviter).rewarded).toBe(1);
  });
});

describe('friend challenges', () => {
  it('runs the full create, accept and room flow', async () => {
    const { signIn } = await setup();
    const host = await signIn(200);
    const guest = await signIn(201);

    const created = (await (await host.post('challenges')).json()) as {
      code: string;
      link: string;
      status: string;
    };
    expect(created.status).toBe('pending');
    expect(created.link).toContain('startapp=duel_');

    const accepted = await guest.post(`challenges/${created.code}/accept`);
    expect(accepted.status).toBe(200);

    const hostRoom = (await (await host.post(`challenges/${created.code}/room`)).json()) as {
      roomCode: string;
    };
    const guestRoom = (await (await guest.post(`challenges/${created.code}/room`)).json()) as {
      roomCode: string;
    };
    // Both are sent into the same room, and only one room was ever opened.
    expect(guestRoom.roomCode).toBe(hostRoom.roomCode);
  });

  it('refuses a second acceptance of the same challenge', async () => {
    const { signIn } = await setup();
    const host = await signIn(210);
    const first = await signIn(211);
    const second = await signIn(212);
    const created = (await (await host.post('challenges')).json()) as { code: string };

    expect((await first.post(`challenges/${created.code}/accept`)).status).toBe(200);
    expect((await second.post(`challenges/${created.code}/accept`)).status).toBe(409);
  });

  it('refuses the host accepting their own challenge', async () => {
    const { signIn } = await setup();
    const host = await signIn(220);
    const created = (await (await host.post('challenges')).json()) as { code: string };
    expect((await host.post(`challenges/${created.code}/accept`)).status).toBe(409);
  });

  it('will not open a room for somebody who is not in the challenge', async () => {
    const { signIn } = await setup();
    const host = await signIn(230);
    const guest = await signIn(231);
    const stranger = await signIn(232);
    const created = (await (await host.post('challenges')).json()) as { code: string };
    await guest.post(`challenges/${created.code}/accept`);
    expect((await stranger.post(`challenges/${created.code}/room`)).status).toBe(409);
  });

  it('restricts the room itself to the two players', async () => {
    const { signIn, telegram } = await setup();
    const host = await signIn(240);
    const guest = await signIn(241);
    const stranger = await signIn(242);
    expect(stranger.token).toBeTruthy();
    const created = (await (await host.post('challenges')).json()) as { code: string };
    await guest.post(`challenges/${created.code}/accept`);
    const { roomCode } = (await (await host.post(`challenges/${created.code}/room`)).json()) as {
      roomCode: string;
    };

    const room = app.rooms.get(roomCode)!;
    const hostId = telegram.identities.byTelegramId(240)!.accountId;
    const guestId = telegram.identities.byTelegramId(241)!.accountId;
    const strangerId = telegram.identities.byTelegramId(242)!.accountId;

    expect(room.mayJoin(hostId)).toBe(true);
    expect(room.mayJoin(guestId)).toBe(true);
    expect(room.mayJoin(strangerId)).toBe(false);
    // Even a signed-out browser that guessed the code is refused.
    expect(room.mayJoin(null)).toBe(false);
  });

  it('refuses a challenge between two players who have blocked each other', async () => {
    const { signIn } = await setup();
    const host = await signIn(250);
    const guest = await signIn(251);
    const guestCard = (await (await host.get('social')).json()) as unknown;
    expect(guestCard).toBeTruthy();

    const created = (await (await host.post('challenges')).json()) as { code: string };
    // The guest blocks the host using the ref from the challenge card.
    const view = (await (await guest.get(`challenges/${created.code}`)).json()) as {
      host: { ref: string };
    };
    await guest.post('social/block', { ref: view.host.ref, action: 'block' });
    expect((await guest.post(`challenges/${created.code}/accept`)).status).toBe(409);
  });
});

describe('daily quests', () => {
  it('records progress from a settled match and pays a claim once', async () => {
    const { signIn, telegram, db, economy } = await setup();
    const me = await signIn(300);
    expect((await economy(me.token)).status).toBe(200);
    const accountId = telegram.identities.byTelegramId(300)!.accountId;
    const now = Date.now();

    const board = telegram.quests.board(accountId, now);
    expect(board.quests).toHaveLength(3);
    const playQuest = board.quests[0]!;

    for (let i = 0; i < playQuest.target; i++) {
      telegram.quests.record(
        accountId,
        {
          result: 'win',
          roundsWon: 3,
          streak: i + 1,
          opponentRating: 1200,
          ratingBefore: 1000,
          fromChallenge: false,
          ranked: true,
        },
        now,
      );
    }
    const done = telegram.quests.board(accountId, now).quests[0]!;
    expect(done.done).toBe(true);

    const before = Number(
      db.sql.prepare('SELECT coins FROM wallets WHERE account_id=?').get(accountId)?.coins ?? 0,
    );
    const claimed = await me.post('quests/claim', { questId: playQuest.id });
    expect(claimed.status).toBe(200);
    // A second claim is refused rather than silently paying again.
    expect((await me.post('quests/claim', { questId: playQuest.id })).status).toBe(409);
    const after = Number(
      db.sql.prepare('SELECT coins FROM wallets WHERE account_id=?').get(accountId)!.coins,
    );
    expect(after).toBe(before + playQuest.reward);
  });

  it('refuses a claim for a quest that is not finished', async () => {
    const { signIn, telegram } = await setup();
    const me = await signIn(310);
    const accountId = telegram.identities.byTelegramId(310)!.accountId;
    const board = telegram.quests.board(accountId, Date.now());
    expect((await me.post('quests/claim', { questId: board.quests[0]!.id })).status).toBe(409);
  });

  it('refuses a quest id that is not on the board', async () => {
    const { signIn } = await setup();
    const me = await signIn(320);
    expect((await me.post('quests/claim', { questId: 'not-a-quest' })).status).toBe(409);
  });
});

describe('daily streaks', () => {
  it('counts consecutive days and resets after a gap', async () => {
    const { signIn, telegram } = await setup();
    await signIn(400);
    const accountId = telegram.identities.byTelegramId(400)!.accountId;
    const day = 86_400_000;
    const monday = Date.UTC(2026, 0, 5, 12);

    expect(telegram.streaks.record(accountId, monday).streak.current).toBe(1);
    // Twice in one day is still day one.
    expect(telegram.streaks.record(accountId, monday + 3_600_000).extended).toBe(false);
    expect(telegram.streaks.record(accountId, monday + day).streak.current).toBe(2);
    expect(telegram.streaks.record(accountId, monday + 2 * day).streak.current).toBe(3);
    // A missed day starts over, but the best is remembered.
    const afterGap = telegram.streaks.record(accountId, monday + 5 * day).streak;
    expect(afterGap.current).toBe(1);
    expect(afterGap.best).toBe(3);
  });
});

describe('entitlements and payments', () => {
  it('grants premium exactly once per charge', async () => {
    const { signIn, telegram } = await setup();
    await signIn(500);
    const accountId = telegram.identities.byTelegramId(500)!.accountId;
    const now = Date.now();
    const payload = `premium:${accountId}:${'ab'.repeat(6)}`;

    const first = telegram.payments.settle({ chargeId: 'charge-1', payload, stars: 250, now });
    expect(first?.fresh).toBe(true);
    expect(telegram.entitlements.has(accountId, 'premium', now)).toBe(true);

    const replay = telegram.payments.settle({ chargeId: 'charge-1', payload, stars: 250, now });
    expect(replay?.fresh).toBe(false);
    expect(replay?.until).toBe(first?.until);
  });

  it('extends from the existing expiry rather than restarting it', async () => {
    const { signIn, telegram } = await setup();
    await signIn(510);
    const accountId = telegram.identities.byTelegramId(510)!.accountId;
    const now = Date.now();
    const payload = `premium:${accountId}:${'cd'.repeat(6)}`;

    const first = telegram.payments.settle({ chargeId: 'c1', payload, stars: 250, now })!;
    const second = telegram.payments.settle({ chargeId: 'c2', payload, stars: 250, now })!;
    expect(second.until! - first.until!).toBe(30 * 86_400_000);
  });

  it('refuses a pre-checkout for a payload that is not ours', async () => {
    const { telegram } = await setup();
    expect(telegram.payments.approvePreCheckout('give-me-premium').ok).toBe(false);
    expect(telegram.payments.approvePreCheckout(`premium:${'0'.repeat(32)}:abcabcabcabc`).ok).toBe(
      false,
    );
  });

  it('never grants premium from a client claim', async () => {
    const { signIn, telegram } = await setup();
    const me = await signIn(520);
    const accountId = telegram.identities.byTelegramId(520)!.accountId;
    // There is no route that takes a premium flag; the closest is the invoice,
    // which only ever returns a link.
    await me.post('premium/invoice');
    expect(telegram.entitlements.has(accountId, 'premium', Date.now())).toBe(false);
  });
});

describe('the webhook', () => {
  it('lets Telegram retry a payment when its transaction failed', async () => {
    const { signIn, telegram, webhook, db } = await setup();
    await signIn(5050);
    const accountId = telegram.identities.byTelegramId(5050)!.accountId;
    const settlement = vi.spyOn(telegram.payments, 'settle').mockImplementationOnce(() => { throw new Error('Temporary database failure'); });
    const update = { update_id: 5050, message: {
      message_id: 1, from: { id: 5050 }, chat: { id: 5050, type: 'private' },
      successful_payment: { telegram_payment_charge_id: 'retry-charge', invoice_payload: `premium:${accountId}:${'ab'.repeat(6)}`, total_amount: 250, currency: 'XTR' },
    } };
    expect((await webhook(update)).status).toBe(500);
    expect(db.sql.prepare('SELECT 1 FROM telegram_updates WHERE update_id=5050').get()).toBeUndefined();
    expect((await webhook(update)).status).toBe(200);
    expect(telegram.entitlements.has(accountId, 'premium', Date.now())).toBe(true);
    expect(settlement).toHaveBeenCalledTimes(2);
    expect((await webhook(update)).status).toBe(200);
    expect(settlement).toHaveBeenCalledTimes(2);
  });

  it('rejects a delivery with the wrong secret, and says nothing about why', async () => {
    const { webhook } = await setup();
    const response = await webhook({ update_id: 1 }, 'not-the-secret');
    expect(response.status).toBe(404);
  });

  it('rejects a delivery with no secret at all', async () => {
    const { url } = await setup();
    const response = await fetch(`${url}/api/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ update_id: 2 }),
    });
    expect(response.status).toBe(404);
  });

  it('handles each update id exactly once', async () => {
    const { webhook, db } = await setup();
    const update = {
      update_id: 55,
      message: {
        message_id: 1,
        from: { id: 600, first_name: 'Ada' },
        chat: { id: 600, type: 'private' },
        text: '/start',
      },
    };
    expect((await webhook(update)).status).toBe(200);
    expect((await webhook(update)).status).toBe(200);
    expect(db.sql.prepare('SELECT count(*) AS n FROM telegram_updates').get()!.n).toBe(1);
    // The player was created once, by the first delivery.
    expect(db.sql.prepare('SELECT count(*) AS n FROM telegram_identities').get()!.n).toBe(1);
  });

  it('ignores updates from group chats', async () => {
    const { webhook, db } = await setup();
    await webhook({
      update_id: 56,
      message: {
        message_id: 1,
        from: { id: 601, first_name: 'Ada' },
        chat: { id: -100, type: 'supergroup' },
        text: '/start',
      },
    });
    expect(db.sql.prepare('SELECT count(*) AS n FROM telegram_identities').get()!.n).toBe(0);
  });
});

describe('account linking', () => {
  it('moves an empty Telegram shell onto an existing web account', async () => {
    const { signIn, telegram, db, auth } = await setup();
    // A web player, created the ordinary way.
    const registered = await auth.register({
      username: 'webplayer',
      password: 'a-long-enough-password',
      name: 'Web Player',
    });
    const webAccount = auth.resolve(registered.token)!;

    // The same person opens the bot, which creates a shell for their Telegram id.
    await signIn(700);
    const shell = telegram.identities.byTelegramId(700)!.accountId;
    expect(shell).not.toBe(webAccount.id);

    const code = telegram.links.issue(webAccount.id, Date.now())!;
    const linked = telegram.linkWithCode(700, `TG-${code}`, Date.now());
    expect(linked).toEqual({ ok: true, accountId: webAccount.id });
    expect(telegram.identities.byTelegramId(700)!.accountId).toBe(webAccount.id);
    // The shell is gone rather than left behind as an orphan.
    expect(db.sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(shell)).toBeUndefined();
  });

  it('spends a code once', async () => {
    const { telegram, auth } = await setup();
    const registered = await auth.register({
      username: 'oncewebplayer',
      password: 'a-long-enough-password',
      name: 'Once',
    });
    const account = auth.resolve(registered.token)!;
    const code = telegram.links.issue(account.id, Date.now())!;
    expect(telegram.links.redeem(`TG-${code}`, Date.now())).toBe(account.id);
    expect(telegram.links.redeem(`TG-${code}`, Date.now())).toBeNull();
  });

  it('expires a code', async () => {
    const { telegram, auth } = await setup();
    const registered = await auth.register({
      username: 'expirywebplayer',
      password: 'a-long-enough-password',
      name: 'Expiry',
    });
    const account = auth.resolve(registered.token)!;
    const code = telegram.links.issue(account.id, Date.now())!;
    expect(telegram.links.redeem(`TG-${code}`, Date.now() + 11 * 60_000)).toBeNull();
  });

  it('refuses to merge a Telegram account that has a real record', async () => {
    const { signIn, telegram, auth, db } = await setup();
    await signIn(710);
    const played = telegram.identities.byTelegramId(710)!.accountId;
    const profile = db.get(played)!;
    db.save({ ...profile, matchesPlayed: 4, wins: 2 });

    const registered = await auth.register({
      username: 'otherwebplayer',
      password: 'a-long-enough-password',
      name: 'Other',
    });
    const account = auth.resolve(registered.token)!;
    const code = telegram.links.issue(account.id, Date.now())!;
    const result = telegram.linkWithCode(710, `TG-${code}`, Date.now());
    expect(result.ok).toBe(false);
    expect(telegram.identities.byTelegramId(710)!.accountId).toBe(played);
  });

  it('refuses to unlink when Telegram is the only way in', async () => {
    const { signIn, telegram } = await setup();
    await signIn(720);
    const accountId = telegram.identities.byTelegramId(720)!.accountId;
    const result = telegram.unlink(accountId);
    expect(result.ok).toBe(false);
    expect(telegram.identities.byAccount(accountId)).not.toBeNull();
  });
});

describe('social and moderation', () => {
  it('adds a friend, blocks, and drops the friendship when blocked', async () => {
    const { signIn } = await setup();
    const me = await signIn(800);
    const them = await signIn(801);
    await them.get('me');

    const themRef = (
      (await (await me.get('social')).json()) as { recentOpponents: unknown[] }
    ) as unknown;
    expect(themRef).toBeTruthy();

    // Reach the other player's card through a challenge, which is how the app
    // hands out a ref in practice.
    const created = (await (await them.post('challenges')).json()) as { code: string };
    const view = (await (await me.get(`challenges/${created.code}`)).json()) as {
      host: { ref: string };
    };

    const friends = (await (await me.post('social/friend', {
      ref: view.host.ref,
      action: 'add',
    })).json()) as { friends: { ref: string }[] };
    expect(friends.friends.map((f) => f.ref)).toContain(view.host.ref);

    const blocked = (await (await me.post('social/block', {
      ref: view.host.ref,
      action: 'block',
    })).json()) as { friends: unknown[]; blocked: { ref: string }[] };
    expect(blocked.friends).toHaveLength(0);
    expect(blocked.blocked.map((b) => b.ref)).toContain(view.host.ref);
  });

  it('files a report once and never bans anybody automatically', async () => {
    const { signIn, telegram } = await setup();
    const me = await signIn(810);
    const them = await signIn(811);
    const created = (await (await them.post('challenges')).json()) as { code: string };
    const view = (await (await me.get(`challenges/${created.code}`)).json()) as {
      host: { ref: string };
    };

    const first = (await (await me.post('social/report', {
      ref: view.host.ref,
      reason: 'cheating',
      note: 'held the same object twice',
    })).json()) as { filed: boolean };
    expect(first.filed).toBe(true);

    const second = (await (await me.post('social/report', {
      ref: view.host.ref,
      reason: 'cheating',
    })).json()) as { duplicate: boolean };
    expect(second.duplicate).toBe(true);
    expect(telegram.social.openReports()).toHaveLength(1);
  });

  it('refuses an unknown player reference', async () => {
    const { signIn } = await setup();
    const me = await signIn(820);
    expect(
      (await me.post('social/friend', { ref: 'uAAAAAAAAAAAA', action: 'add' })).status,
    ).toBe(404);
  });
});

describe('notifications', () => {
  it('queues one message per event and drops the duplicate', async () => {
    const { signIn, telegram, db } = await setup();
    await signIn(900);
    const accountId = telegram.identities.byTelegramId(900)!.accountId;
    const now = Date.now();

    const message = { text: 'Victory' };
    expect(
      telegram.notifications.notify(
        { accountId, kind: 'match-result', dedupeKey: 'match:1', message },
        now,
      ),
    ).toBe(true);
    expect(
      telegram.notifications.notify(
        { accountId, kind: 'match-result', dedupeKey: 'match:1', message },
        now,
      ),
    ).toBe(false);
    expect(db.sql.prepare('SELECT count(*) AS n FROM notification_outbox').get()!.n).toBe(1);
  });

  it('will not queue a kind the player switched off', async () => {
    const { signIn, telegram } = await setup();
    const me = await signIn(910);
    const accountId = telegram.identities.byTelegramId(910)!.accountId;
    await me.post('notifications', {
      matches: false,
      challenges: true,
      achievements: true,
      social: true,
      digest: true,
      quietFrom: null,
      quietTo: null,
      utcOffsetMinutes: 0,
    });
    expect(
      telegram.notifications.notify(
        { accountId, kind: 'match-result', dedupeKey: 'match:2', message: { text: 'x' } },
        Date.now(),
      ),
    ).toBe(false);
  });

  it('will not write to somebody who never allowed it', async () => {
    const { call, telegram } = await setup();
    await call('auth', {
      body: {
        initData: initData({ id: 920, first_name: 'Quiet', allows_write_to_pm: false }),
      },
    });
    const accountId = telegram.identities.byTelegramId(920)!.accountId;
    expect(
      telegram.notifications.notify(
        { accountId, kind: 'match-result', dedupeKey: 'match:3', message: { text: 'x' } },
        Date.now(),
      ),
    ).toBe(false);
  });
});

describe('the settlement hook', () => {
  it('turns a finished match into quests, streaks and a queued message', async () => {
    const { signIn, telegram, db } = await setup();
    await signIn(1000);
    await signIn(1001);
    const winner = telegram.identities.byTelegramId(1000)!.accountId;
    const loser = telegram.identities.byTelegramId(1001)!.accountId;
    const now = Date.now();

    telegram.onSettled({
      matchId: 'ROOMA:1:r1',
      roomCode: 'ROOMA',
      ranked: true,
      friendRoom: false,
      at: now,
      players: [
        {
          accountId: winner,
          name: 'Winner',
          score: 3,
          result: 'win',
          ratingBefore: 1000,
          ratingAfter: 1024,
          ratingChange: 24,
          streak: 1,
          rewards: { xp: 120, levelBefore: 1, levelAfter: 2, unlocked: [], rankMove: null },
          validAnswers: 2,
          fastestWinMs: null,
          rewarded: true,
        },
        {
          accountId: loser,
          name: 'Loser',
          score: 1,
          result: 'loss',
          ratingBefore: 1000,
          ratingAfter: 976,
          ratingChange: -24,
          streak: 0,
          rewards: { xp: 40, levelBefore: 1, levelAfter: 1, unlocked: [], rankMove: null },
          validAnswers: 2,
          fastestWinMs: null,
          rewarded: true,
        },
      ],
    });

    expect(telegram.streaks.read(winner, now).current).toBe(1);
    expect(telegram.social.recentOpponents(winner)).toEqual([loser]);
    const queued = db.sql
      .prepare("SELECT account_id FROM notification_outbox WHERE kind='match-result'")
      .all()
      .map((row) => String(row.account_id));
    expect(queued.sort()).toEqual([winner, loser].sort());
  });

  it('ignores a casual match entirely', async () => {
    const { signIn, telegram, db } = await setup();
    await signIn(1010);
    await signIn(1011);
    const a = telegram.identities.byTelegramId(1010)!.accountId;
    const b = telegram.identities.byTelegramId(1011)!.accountId;

    telegram.onSettled({
      matchId: 'ROOMB:1:r1',
      roomCode: 'ROOMB',
      ranked: false,
      friendRoom: true,
      at: Date.now(),
      players: [
        {
          accountId: a,
          name: 'A',
          score: 3,
          result: 'win',
          ratingBefore: 1000,
          ratingAfter: 1000,
          ratingChange: 0,
          streak: 1,
          rewards: { xp: 0, levelBefore: 1, levelAfter: 1, unlocked: [], rankMove: null },
          validAnswers: 2,
          fastestWinMs: null,
          rewarded: true,
        },
        {
          accountId: b,
          name: 'B',
          score: 0,
          result: 'loss',
          ratingBefore: 1000,
          ratingAfter: 1000,
          ratingChange: 0,
          streak: 0,
          rewards: { xp: 0, levelBefore: 1, levelAfter: 1, unlocked: [], rankMove: null },
          validAnswers: 2,
          fastestWinMs: null,
          rewarded: true,
        },
      ],
    });
    expect(db.sql.prepare('SELECT count(*) AS n FROM notification_outbox').get()!.n).toBe(0);
  });
});

describe('the mini app document', () => {
  it('lets Telegram frame /tg, and still forbids framing everywhere else', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const clientDir = mkdtempSync(join(tmpdir(), 'duel-client-'));
    writeFileSync(join(clientDir, 'index.html'), '<!doctype html><div id="root"></div>');

    const db = new modules.Database(':memory:');
    app = modules.createApp({ profiles: db, auth: new modules.AuthService(db), clientDir });
    const port = await app.listen(0, '127.0.0.1');

    const headersFor = async (path: string) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      expect(response.status).toBe(200);
      return {
        csp: response.headers.get('content-security-policy') ?? '',
        xfo: response.headers.get('x-frame-options'),
      };
    };

    const ordinary = await headersFor('/');
    expect(ordinary.csp).toContain("frame-ancestors 'none'");
    expect(ordinary.xfo).toBe('DENY');
    expect(ordinary.csp).not.toContain('telegram.org');

    for (const path of ['/tg', '/tg/rank', '/tg/duel']) {
      const telegram = await headersFor(path);
      expect(telegram.csp).toContain('frame-ancestors https://web.telegram.org');
      // X-Frame-Options has no allow-list, so it must be absent entirely or it
      // would override the directive above and blank the Mini App.
      expect(telegram.xfo).toBeNull();
      expect(telegram.csp).toContain("script-src 'self' 'wasm-unsafe-eval' https://telegram.org");
      // Everything else stays locked down.
      expect(telegram.csp).toContain("default-src 'self'");
      expect(telegram.csp).toContain("object-src 'none'");
      expect(telegram.csp).toContain("connect-src 'self'");
    }

    // A path that merely starts with the same letters is not the Mini App.
    const lookalike = await headersFor('/tgx');
    expect(lookalike.csp).toContain("frame-ancestors 'none'");
    expect(lookalike.xfo).toBe('DENY');
  });
});

describe('leaderboard and profile payloads', () => {
  it('never carries an account id or a Telegram id', async () => {
    const { signIn } = await setup();
    const me = await signIn(1100);
    const body = await (await me.get('home')).text();
    expect(body).not.toContain('accountId');
    expect(body).not.toContain('"1100"');
    expect(body).not.toMatch(/"[a-f0-9]{32}"/);
  });

  it('shows your own position even when you are off the visible page', async () => {
    const { signIn, telegram, db } = await setup();
    const me = await signIn(1110);
    const accountId = telegram.identities.byTelegramId(1110)!.accountId;
    const profile = db.get(accountId)!;
    db.save({ ...profile, matchesPlayed: 10, rating: 700 });
    for (let i = 0; i < 6; i++) {
      const other = await signIn(1200 + i);
      const otherId = telegram.identities.byTelegramId(1200 + i)!.accountId;
      const p = db.get(otherId)!;
      db.save({ ...p, matchesPlayed: 10, rating: 1500 + i });
      expect(other.token).toBeTruthy();
    }
    const board = (await (await me.get('leaderboard?board=rating&offset=0')).json()) as {
      you: { position: number } | null;
      rows: { position: number }[];
    };
    expect(board.you?.position).toBe(7);
  });
});
