import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../src/database.js';
import { blankProfile } from '../src/profiles.js';
import { ensureWallet, economyView, purchase, equip, dailyCoins } from '../src/economy.js';
import { plainSummary, recordMatch } from '../src/standings.js';
let db: Database;
const now = Date.UTC(2026, 8, 15);
const view = (id = 'a') => economyView(db.sql, id, db.get(id)!.xp, now);
beforeEach(() => {
  db = new Database(':memory:');
  for (const id of ['a', 'b']) {
    db.save(blankProfile(id, now));
    db.sql
      .prepare(
        'INSERT INTO accounts(id,username,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?)',
      )
      .run(id, id, 'test-hash', 'test-recovery', now);
    db.transaction(() => ensureWallet(db.sql, id, now));
  }
});
afterEach(() => db.close());
describe('server-owned cosmetics economy', () => {
  it('grants the starter wallet once, including after a reload', () => {
    db.transaction(() => ensureWallet(db.sql, 'a', now));
    expect(view().coins).toBe(160);
    expect(view().owned).toContain('cloud');
    expect(() => ensureWallet(db.sql, 'guest', now)).toThrow('Sign in');
  });
  it('debits one purchase once and does not allow a negative balance', () => {
    db.transaction(() => purchase(db.sql, 'a', 'visor', 0, now));
    db.transaction(() => purchase(db.sql, 'a', 'visor', 0, now));
    expect(view().coins).toBe(80);
    expect(() => db.transaction(() => purchase(db.sql, 'a', 'comet', 0, now))).toThrow(
      'Not enough',
    );
    expect(view().coins).toBe(80);
  });
  it('rolls back a debit if the remaining purchase transaction fails', () => {
    expect(() =>
      db.transaction(() => {
        purchase(db.sql, 'a', 'visor', 0, now);
        throw new Error('write failed');
      }),
    ).toThrow();
    expect(view().coins).toBe(160);
    expect(view().owned).not.toContain('visor');
  });
  it('requires ownership and keeps opponents’ loadouts separate', () => {
    expect(() => equip(db.sql, 'a', 'comet')).toThrow('Unlock');
    db.transaction(() => {
      purchase(db.sql, 'a', 'visor', 0, now);
      equip(db.sql, 'a', 'visor');
    });
    expect(db.get('a')!.loadout.accessory).toBe('visor');
    expect(db.get('b')!.loadout.accessory).toBeUndefined();
  });
  it('gates level items and makes daily rewards idempotent in UTC', () => {
    expect(() => purchase(db.sql, 'a', 'stardust', 0, now)).toThrow('level');
    expect(db.transaction(() => dailyCoins(db.sql, 'a', now))).toBe(30);
    expect(db.transaction(() => dailyCoins(db.sql, 'a', now + 1000))).toBe(0);
    expect(db.transaction(() => dailyCoins(db.sql, 'a', now + 86400000))).toBe(30);
    expect(view().dailyClaimed).toBe(true);
  });
  it('commits battle rewards with the result and rejects replayed receipts', () => {
    const a = { id: 'a', name: 'A', score: 3, summary: { ...plainSummary(), validAnswers: 3 } };
    const b = { id: 'b', name: 'B', score: 1, summary: { ...plainSummary(), validAnswers: 1 } };
    const result = recordMatch(db, a, b, now, 'match-one');
    expect(result.a!.rewards.coins).toBeGreaterThan(0);
    const balance = view().coins;
    expect(balance).toBe(160 + result.a!.rewards.coins!);
    expect(recordMatch(db, a, b, now, 'match-one')).toEqual({});
    expect(view().coins).toBe(balance);
  });
});
