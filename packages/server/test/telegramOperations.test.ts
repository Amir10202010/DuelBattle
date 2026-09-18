import { createHmac } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The parts that run on a clock rather than on a request.
 *
 * The weekly recap, quiet hours, the admin console and account linking all
 * happen without anybody tapping anything, which is exactly why they are worth
 * pinning down: a date bug here is a message sent at three in the morning, or
 * one sent twice, and neither shows up in a click-through.
 *
 * Imported dynamically for the same reason as the other Telegram suite: the
 * configuration is read when the module loads.
 */
const BOT_TOKEN = '7000000000:AAH-ops-token-not-a-real-one_0123456789';
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
process.env.TELEGRAM_BOT_USERNAME = 'DuelBattleOpsBot';
process.env.TELEGRAM_WEBHOOK_SECRET = 'an-ops-webhook-secret-0123456789abcd';
process.env.TELEGRAM_MINI_APP_URL = 'https://duel.example';
process.env.TELEGRAM_ADMIN_IDS = '900001';

const importApp = () => import('../src/app.js');
const importDatabase = () => import('../src/database.js');
const importAuth = () => import('../src/auth.js');
const importAdmin = () => import('../src/telegram/admin.js');
const importRecap = () => import('../src/telegram/recap.js');

interface Modules {
  createApp: Awaited<ReturnType<typeof importApp>>['createApp'];
  Database: Awaited<ReturnType<typeof importDatabase>>['Database'];
  AuthService: Awaited<ReturnType<typeof importAuth>>['AuthService'];
  AdminConsole: Awaited<ReturnType<typeof importAdmin>>['AdminConsole'];
  weekOf: Awaited<ReturnType<typeof importRecap>>['weekOf'];
  isoWeek: Awaited<ReturnType<typeof importRecap>>['isoWeek'];
}

let modules: Modules;
beforeAll(async () => {
  const [app, database, auth, admin, recap] = await Promise.all([
    importApp(),
    importDatabase(),
    importAuth(),
    importAdmin(),
    importRecap(),
  ]);
  modules = {
    createApp: app.createApp,
    Database: database.Database,
    AuthService: auth.AuthService,
    AdminConsole: admin.AdminConsole,
    weekOf: recap.weekOf,
    isoWeek: recap.isoWeek,
  };
});

function initData(id: number, at = Date.now()): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(at / 1000)),
    user: JSON.stringify({ id, first_name: `P${id}`, allows_write_to_pm: true }),
  };
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secret).update(check).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

let app: ReturnType<Modules['createApp']>;
afterEach(async () => {
  if (app) await app.close();
});

async function setup() {
  const db = new modules.Database(':memory:');
  const auth = new modules.AuthService(db);
  app = modules.createApp({ profiles: db, auth });
  const port = await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;
  const telegram = app.telegram!;

  const signIn = (id: number) => {
    const result = telegram.authenticate(initData(id), Date.now());
    if (!result.ok) throw new Error(result.error);
    return { token: result.result.token, accountId: telegram.identities.byTelegramId(id)!.accountId };
  };

  const post = (path: string, token: string, body: unknown = {}) =>
    fetch(`${url}/api/telegram/${path}`, {
      method: 'POST',
      headers: {
        origin: url,
        'content-type': 'application/json',
        'x-battle-request': '1',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

  const get = (path: string, token: string) =>
    fetch(`${url}/api/telegram/${path}`, { headers: { authorization: `Bearer ${token}` } });

  const webhook = (update: unknown) =>
    fetch(`${url}/api/telegram/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': process.env.TELEGRAM_WEBHOOK_SECRET!,
      },
      body: JSON.stringify(update),
    });

  const allOn = {
    matches: true,
    challenges: true,
    achievements: true,
    social: true,
    digest: true,
    quietFrom: null,
    quietTo: null,
    utcOffsetMinutes: 0,
  };

  return { db, telegram, signIn, post, get, webhook, allOn };
}

/** A finished match, in the shape the stored history uses. */
function record(at: number, result: 'win' | 'loss', before: number, after: number, xp: number) {
  return {
    at,
    opponentName: 'Opponent',
    result,
    ratingBefore: before,
    ratingAfter: after,
    yourScore: result === 'win' ? 3 : 1,
    theirScore: result === 'win' ? 1 : 3,
    xp,
  };
}

const MONDAY_9AM_UTC = Date.UTC(2026, 0, 5, 9, 30);
const DAY = 86_400_000;

describe('the weekly recap', () => {
  it('adds up only the last seven days', () => {
    const profile = {
      history: [
        record(MONDAY_9AM_UTC - DAY, 'win', 1000, 1024, 120),
        record(MONDAY_9AM_UTC - 2 * DAY, 'loss', 1014, 1000, 40),
        record(MONDAY_9AM_UTC - 3 * DAY, 'win', 990, 1014, 110),
        // Nine days ago: outside the window, and must not be counted.
        record(MONDAY_9AM_UTC - 9 * DAY, 'win', 900, 990, 500),
      ],
    } as never;
    const week = modules.weekOf(profile, MONDAY_9AM_UTC);
    expect(week.played).toBe(3);
    expect(week.wins).toBe(2);
    expect(week.losses).toBe(1);
    expect(week.xp).toBe(270);
    expect(week.ratingChange).toBe(24 - 14 + 24);
  });

  it('finds the longest run inside the week, not the current one', () => {
    const profile = {
      history: [
        record(MONDAY_9AM_UTC - DAY, 'loss', 1050, 1030, 40),
        record(MONDAY_9AM_UTC - 2 * DAY, 'win', 1030, 1050, 120),
        record(MONDAY_9AM_UTC - 3 * DAY, 'win', 1010, 1030, 120),
        record(MONDAY_9AM_UTC - 4 * DAY, 'win', 990, 1010, 120),
      ],
    } as never;
    expect(modules.weekOf(profile, MONDAY_9AM_UTC).bestStreak).toBe(3);
  });

  it('numbers a week the same way twice', () => {
    expect(modules.isoWeek(new Date(Date.UTC(2026, 0, 5)))).toBe(
      modules.isoWeek(new Date(Date.UTC(2026, 0, 8))),
    );
    expect(modules.isoWeek(new Date(Date.UTC(2026, 0, 5)))).not.toBe(
      modules.isoWeek(new Date(Date.UTC(2026, 0, 12))),
    );
  });

  it('sends nothing to somebody who did not play', async () => {
    const { signIn, telegram, db } = await setup();
    const { accountId } = signIn(1300);
    db.sql
      .prepare('UPDATE telegram_identities SET last_seen_at=? WHERE account_id=?')
      .run(MONDAY_9AM_UTC, accountId);
    expect(telegram.recap.run(MONDAY_9AM_UTC)).toBe(0);
  });

  it('sends one on a Monday morning, and only one', async () => {
    const { signIn, telegram, db } = await setup();
    const { accountId } = signIn(1310);
    const profile = db.get(accountId)!;
    db.save({
      ...profile,
      matchesPlayed: 2,
      wins: 1,
      losses: 1,
      history: [
        record(MONDAY_9AM_UTC - DAY, 'win', 1000, 1024, 120),
        record(MONDAY_9AM_UTC - 2 * DAY, 'loss', 1014, 1000, 40),
      ],
    });
    db.sql
      .prepare('UPDATE telegram_identities SET last_seen_at=? WHERE account_id=?')
      .run(MONDAY_9AM_UTC, accountId);

    expect(telegram.recap.run(MONDAY_9AM_UTC)).toBe(1);
    // A second pass in the same hour, or after a restart, adds nothing.
    expect(telegram.recap.run(MONDAY_9AM_UTC + 60_000)).toBe(0);

    const row = db.sql
      .prepare("SELECT payload FROM notification_outbox WHERE kind='weekly-recap'")
      .get()!;
    const text = (JSON.parse(String(row.payload)) as { text: string }).text;
    expect(text).toContain('Duels      2');
    expect(text).toContain('Won        1 (50%)');
    expect(text).toContain('+10');
  });

  it('does nothing on any other day', async () => {
    const { signIn, telegram, db } = await setup();
    const { accountId } = signIn(1320);
    const tuesday = MONDAY_9AM_UTC + DAY;
    db.sql
      .prepare('UPDATE telegram_identities SET last_seen_at=? WHERE account_id=?')
      .run(tuesday, accountId);
    expect(telegram.recap.run(tuesday)).toBe(0);
  });

  it('respects the digest toggle', async () => {
    const { signIn, telegram, db, post, allOn } = await setup();
    const { accountId, token } = signIn(1330);
    await post('notifications', token, { ...allOn, digest: false });
    const profile = db.get(accountId)!;
    db.save({ ...profile, history: [record(MONDAY_9AM_UTC - DAY, 'win', 1000, 1024, 120)] });
    db.sql
      .prepare('UPDATE telegram_identities SET last_seen_at=? WHERE account_id=?')
      .run(MONDAY_9AM_UTC, accountId);
    expect(telegram.recap.run(MONDAY_9AM_UTC)).toBe(0);
  });
});

describe('quiet hours', () => {
  const night = Date.UTC(2026, 0, 6, 1, 0);

  it('holds a recap until the window ends', async () => {
    const { signIn, telegram, db, post, allOn } = await setup();
    const { accountId, token } = signIn(1400);
    await post('notifications', token, { ...allOn, quietFrom: 23, quietTo: 9 });

    telegram.notifications.notify(
      { accountId, kind: 'weekly-recap', dedupeKey: 'recap:test', message: { text: 'later' } },
      night,
    );
    const notBefore = Number(
      db.sql.prepare('SELECT not_before FROM notification_outbox ORDER BY id DESC').get()!.not_before,
    );
    expect(new Date(notBefore).getUTCHours()).toBe(9);
    expect(notBefore).toBeGreaterThan(night);
  });

  it('holds every kind, with no important-message exception', async () => {
    const { signIn, telegram, db, post, allOn } = await setup();
    const { accountId, token } = signIn(1410);
    await post('notifications', token, { ...allOn, quietFrom: 23, quietTo: 9 });

    for (const kind of ['challenge-received', 'match-result', 'achievement'] as const) {
      telegram.notifications.notify(
        { accountId, kind, dedupeKey: `quiet:${kind}`, message: { text: 'held' } },
        night,
      );
    }
    const rows = db.sql
      .prepare('SELECT not_before FROM notification_outbox')
      .all()
      .map((row) => new Date(Number(row.not_before)).getUTCHours());
    expect(rows).toHaveLength(3);
    expect(rows.every((hour) => hour === 9)).toBe(true);
  });

  it('delivers at once outside the window', async () => {
    const { signIn, telegram, db, post, allOn } = await setup();
    const { accountId, token } = signIn(1430);
    await post('notifications', token, { ...allOn, quietFrom: 23, quietTo: 9 });
    const midday = Date.UTC(2026, 0, 6, 12, 0);

    telegram.notifications.notify(
      { accountId, kind: 'challenge-received', dedupeKey: 'duel:day', message: { text: 'now' } },
      midday,
    );
    const notBefore = Number(
      db.sql.prepare('SELECT not_before FROM notification_outbox ORDER BY id DESC').get()!.not_before,
    );
    expect(notBefore).toBe(midday);
  });

  it('is off when the two hours are the same', async () => {
    const { signIn, telegram, db, post, allOn } = await setup();
    const { accountId, token } = signIn(1420);
    await post('notifications', token, { ...allOn, quietFrom: 9, quietTo: 9 });
    telegram.notifications.notify(
      { accountId, kind: 'weekly-recap', dedupeKey: 'recap:none', message: { text: 'x' } },
      night,
    );
    const notBefore = Number(
      db.sql.prepare('SELECT not_before FROM notification_outbox ORDER BY id DESC').get()!.not_before,
    );
    expect(notBefore).toBeLessThanOrEqual(night + 1_000);
  });
});

describe('admin', () => {
  it('answers /admin only for an allow-listed Telegram id', async () => {
    const { webhook, telegram } = await setup();
    const sent: string[] = [];
    const original = telegram.api.sendMessage.bind(telegram.api);
    telegram.api.sendMessage = (options) => {
      sent.push(options.text);
      return Promise.resolve({ ok: true as const, result: { message_id: 1, chat: { id: 1 } } });
    };

    const message = (id: number, updateId: number) => ({
      update_id: updateId,
      message: {
        message_id: updateId,
        from: { id, first_name: 'Person' },
        chat: { id, type: 'private' },
        text: '/admin',
      },
    });
    await webhook(message(900001, 900));
    await webhook(message(900002, 901));
    telegram.api.sendMessage = original;

    expect(sent[0]).toContain('ADMIN');
    expect(sent[1]).not.toContain('ADMIN');
  });

  it('writes an audit row before acting, even when the action fails', async () => {
    const { telegram, db } = await setup();
    const console_ = new modules.AdminConsole(telegram);
    const card = await console_.refund(900001, 'no-such-charge 12345', Date.now());
    expect(card.text).toContain('refused');
    const audit = db.sql
      .prepare("SELECT action, target FROM admin_audit WHERE action='payment.refund'")
      .get();
    expect(audit).toBeTruthy();
    expect(String(audit!.target)).toBe('no-such-charge');
  });

  it('explains itself rather than guessing at a malformed refund', async () => {
    const { telegram } = await setup();
    const console_ = new modules.AdminConsole(telegram);
    const card = await console_.refund(900001, 'only-a-charge-id', Date.now());
    expect(card.text).toContain('Usage');
  });
});

describe('account linking from the browser', () => {
  it('issues a code over POST and not over GET', async () => {
    const { signIn, get, post } = await setup();
    const { token } = signIn(1500);
    expect((await get('link', token)).status).toBe(404);

    const issued = await post('link', token);
    expect(issued.status).toBe(200);
    const body = (await issued.json()) as { code: string; expiresInMs: number; botLink: string };
    expect(body.code).toMatch(/^TG-[A-Z0-9]{6}$/);
    expect(body.expiresInMs).toBe(10 * 60_000);
    expect(body.botLink).toContain('?start=link_TG-');
  });

  it('stops issuing after three outstanding codes', async () => {
    const { signIn, post } = await setup();
    const { token } = signIn(1510);
    for (let i = 0; i < 3; i++) expect((await post('link', token)).status).toBe(200);
    expect((await post('link', token)).status).toBe(429);
  });
});
