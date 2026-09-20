import { afterEach, describe, expect, it, vi } from 'vitest';
import { Database } from '../src/database.js';
import { AuthService, registrationSchema, sessionCookie } from '../src/auth.js';
import { blankProfile } from '../src/profiles.js';
import { recordMatch, plainSummary } from '../src/standings.js';
import { buildBoard } from '../src/leaderboard.js';

let db: Database;
afterEach(() => db?.close());
const player = (id: string, score: number) => ({
  id,
  name: id,
  score,
  summary: plainSummary({ yourScore: score, theirScore: 3 - score }),
});
function database() {
  db = new Database(':memory:');
  for (const id of ['a', 'b']) db.save(blankProfile(id, Date.now()));
  return db;
}

describe('atomic progression', () => {
  it('settles both players once, including XP and daily rewards', () => {
    database();
    const at = Date.UTC(2026, 8, 13, 12);
    const result = recordMatch(db, player('a', 3), player('b', 0), at, 'match-1');
    expect(result.a!.change + result.b!.change).toBe(0);
    expect(result.a!.rewards.dailyBonus).toBe(75);
    expect(result.b!.rewards.dailyBonus).toBe(75);
    expect(result.a!.rewards.unlocked).toContain('opening-night');
    const snapshot = db.all();
    expect(recordMatch(db, player('a', 3), player('b', 0), at, 'match-1')).toEqual({});
    expect(db.all()).toEqual(snapshot);
    const second = recordMatch(db, player('a', 3), player('b', 0), at + 1000, 'match-2');
    expect(second.a!.rewards.dailyBonus).toBe(0);
    expect(second.b!.rewards.dailyBonus).toBe(0);
  });
  it('rolls back both ratings and the receipt when the second write fails', () => {
    database();
    const save = db.save.bind(db);
    let writes = 0;
    const spy = vi.spyOn(db, 'save').mockImplementation((p) => {
      if (++writes === 2) throw new Error('disk');
      save(p);
    });
    expect(() => recordMatch(db, player('a', 3), player('b', 0), Date.now(), 'failed')).toThrow(
      'disk',
    );
    expect(db.get('a')!.matchesPlayed).toBe(0);
    expect(db.get('b')!.xp).toBe(0);
    expect(db.sql.prepare('SELECT count(*) n FROM match_receipts').get()!.n).toBe(0);
    spy.mockRestore();
    expect(
      recordMatch(db, player('a', 3), player('b', 0), Date.now(), 'failed').a!.profile.wins,
    ).toBe(1);
  });
  it('caps repeated rivals across rooms, and resets the rolling window', () => {
    database();
    const at = Date.now();
    for (let i = 0; i < 3; i++)
      expect(recordMatch(db, player('a', 3), player('b', 0), at + i, `m${i}`).a).toBeDefined();
    expect(recordMatch(db, player('b', 3), player('a', 0), at + 3, 'm3')).toEqual({});
    expect(recordMatch(db, player('a', 3), player('b', 0), at + 86_400_100, 'm4').a).toBeDefined();
  });
  it('rejects self matches and forged numeric results', () => {
    database();
    expect(() => recordMatch(db, player('a', 3), player('a', 0), Date.now(), 'self')).toThrow();
    expect(() => recordMatch(db, player('a', NaN), player('b', 0), Date.now(), 'nan')).toThrow();
    expect(() =>
      recordMatch(db, player('a', -2), player('b', 0), Date.now(), 'negative'),
    ).toThrow();
  });
});

describe('accounts and sessions', () => {
  it('hashes secrets, restores a player, revokes sessions and consumes recovery keys once', async () => {
    database();
    const auth = new AuthService(db);
    const input = registrationSchema.parse({
      username: 'QA_Player',
      name: 'Test Player',
      password: 'local-test-password-2026',
    });
    const registered = await auth.register(input);
    const account = auth.resolve(registered.token)!;
    expect(account.username).toBe('qa_player');
    expect(auth.view(account).profile.name).toBe('Test Player');
    expect(auth.view(account).profile.history).toEqual([]);
    const row = db.sql.prepare('SELECT * FROM accounts WHERE id=?').get(account.id)!;
    expect(row.password_hash).not.toContain(input.password);
    expect(row.recovery_hash).not.toBe(registered.recovery);
    expect(db.sql.prepare('SELECT token_hash FROM sessions').get()!.token_hash).not.toBe(
      registered.token,
    );
    await expect(auth.login({ ...input, password: 'wrong-password-123' })).rejects.toMatchObject({
      status: 401,
    });
    const login = await auth.login(input);
    expect(auth.resolve(login)!.id).toBe(account.id);
    const recovery = await auth.recover(
      input.username,
      registered.recovery,
      'replacement-test-password',
    );
    expect(auth.resolve(login)).toBeNull();
    expect(auth.resolve(registered.token)).toBeNull();
    await expect(
      auth.recover(input.username, registered.recovery, 'another-test-password'),
    ).rejects.toMatchObject({ status: 401 });
    expect(recovery).not.toBe(registered.recovery);
    await expect(auth.login({ ...input, password: 'replacement-test-password' })).resolves.toMatch(
      /^[a-f0-9]{64}$/,
    );
  }, 15000);
  it('enforces unique player IDs and safe credential fields', async () => {
    database();
    const auth = new AuthService(db);
    const input = registrationSchema.parse({
      username: 'someone',
      name: 'Someone',
      password: 'test-password-for-local',
    });
    await auth.register(input);
    await expect(auth.register(input)).rejects.toMatchObject({ status: 409 });
    expect(db.sql.prepare('SELECT count(*) n FROM accounts').get()!.n).toBe(1);
    expect(registrationSchema.safeParse({ ...input, rating: 9999 }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...input, password: 'short' }).success).toBe(false);
    // Lax, because Google's redirect into our callback is a cross-site
    // navigation and a Strict cookie would sit out the hop to `/home`.
    expect(sessionCookie('test', true)).toContain('HttpOnly; SameSite=Lax');
    expect(sessionCookie('test', true)).toContain('; Secure');
    expect(sessionCookie('', true)).toContain('Max-Age=0');
  }, 10000);
  it('does not resolve an expired or invented token', () => {
    database();
    const auth = new AuthService(db);
    db.sql
      .prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,onboarded,created_at) VALUES(?,?,?,?,?,?)')
      .run('a', 'player', 'hash', 'recovery', 1, Date.now());
    const token = auth.session('a');
    db.sql.exec('UPDATE sessions SET expires_at=1');
    expect(auth.resolve(token)).toBeNull();
    expect(auth.resolve('f'.repeat(64))).toBeNull();
  });
});

describe('database leaderboard', () => {
  it('pages real accounts, excludes guests and placement, projects only public fields', () => {
    database();
    for (let i = 0; i < 60; i++) {
      const id = `p${i.toString().padStart(2, '0')}`;
      db.save({
        ...blankProfile(id, Date.now()),
        name: id,
        rating: 1500 - i,
        matchesPlayed: i === 59 ? 4 : 5,
        wins: 5,
      });
      db.sql
        .prepare('INSERT INTO accounts(id,username,password_hash,recovery_hash,onboarded,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, id, 'hash', 'recovery', 1, Date.now());
    }
    db.save({
      ...blankProfile('guest', Date.now()),
      name: 'Guest',
      rating: 9999,
      matchesPlayed: 100,
    });
    const board = buildBoard(db, 'rating', 'p50', 25, 25);
    expect(board.total).toBe(59);
    expect(board.entries).toHaveLength(25);
    expect(board.entries[0]!.position).toBe(26);
    expect(board.you!.position).toBe(51);
    expect(board.entries[0]).not.toHaveProperty('id');
    expect(board.entries[0]).not.toHaveProperty('history');
    expect(board.entries[0]).not.toHaveProperty('password_hash');
    expect(db.sql.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok');
    expect(db.sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });
});

it('links a verified legacy record only once and never accepts a forged identity', async () => {
  database();
  const { Identities } = await import('../src/identity.js');
  const identities = new Identities(Buffer.alloc(32, 7));
  const proof = identities.issue();
  const oldId = identities.verify(proof)!;
  db.save({
    ...blankProfile(oldId, 0),
    name: 'Legacy',
    rating: 1350,
    peakRating: 1400,
    xp: 2345,
    matchesPlayed: 50,
    wins: 30,
  });
  const auth = new AuthService(db, identities);
  const registered = await auth.register(
    registrationSchema.parse({
      username: 'legacy_player',
      name: 'Player',
      password: 'local-migration-password',
      legacyIdentity: proof,
    }),
  );
  expect(auth.resolve(registered.token)!.id).toBe(oldId);
  expect(db.get(oldId)!.rating).toBe(1350);
  expect(db.get(oldId)!.xp).toBe(2345);
  await expect(
    auth.register(
      registrationSchema.parse({
        username: 'duplicate_player',
        name: 'Duplicate',
        password: 'local-migration-password',
        legacyIdentity: proof,
      }),
    ),
  ).rejects.toMatchObject({ status: 409 });
  const forged = await auth.register(
    registrationSchema.parse({
      username: 'forged_player',
      name: 'Fresh',
      password: 'local-migration-password',
      legacyIdentity: proof + 'wrong',
    }),
  );
  expect(auth.resolve(forged.token)!.id).not.toBe(oldId);
  expect(auth.view(auth.resolve(forged.token)!).profile.rating).toBe(1000);
}, 15000);
