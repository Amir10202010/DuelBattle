import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Database } from '../src/database.js';
import { blankProfile } from '../src/profiles.js';
import { ensureWallet, economyView, purchase, equip, grantCoins, unequip } from '../src/economy.js';
import { MetaService } from '../src/meta/service.js';
import { plainSummary, recordMatch } from '../src/standings.js';
import { COSMETICS } from '@battle/shared';
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
  it('grants the email account bonus once without replacing its balance or equipped items', () => {
    db.transaction(() => {
      purchase(db.sql, 'a', 'visor', 0, now);
      equip(db.sql, 'a', 'visor');
    });
    db.sql.prepare('UPDATE accounts SET email=? WHERE id=?').run('Sagindiktar@Gmail.com', 'a');
    db.transaction(() => ensureWallet(db.sql, 'a', now));
    expect(view().coins).toBe(10080);
    expect(view().owned.sort()).toEqual(
      COSMETICS.filter((item) => item.availability !== 'coming-soon').map((item) => item.id).sort(),
    );
    expect(view().loadout.accessory).toBe('visor');
    new MetaService(db).claimDaily('a', now);
    db.transaction(() => ensureWallet(db.sql, 'a', now + 86400000));
    // The first square of the daily calendar pays forty.
    expect(view().coins).toBe(10120);
    expect(view('b').coins).toBe(160);
    expect(view('b').owned).not.toContain('pikachu');
  });
  it('does not grant the bonus for an unverified username or a different email', () => {
    db.sql.prepare('UPDATE accounts SET username=? WHERE id=?').run('sagindiktar@gmail.com', 'a');
    db.transaction(() => ensureWallet(db.sql, 'a', now));
    expect(view().coins).toBe(160);
    db.sql.prepare('UPDATE accounts SET email=? WHERE id=?').run('someone-else@gmail.com', 'a');
    db.transaction(() => ensureWallet(db.sql, 'a', now));
    expect(view().coins).toBe(160);
    expect(view().owned).not.toContain('pikachu');
  });
  it('rolls back the entire bonus on failure and can retry it', () => {
    db.sql.prepare('UPDATE accounts SET email=? WHERE id=?').run('sagindiktar@gmail.com', 'a');
    db.sql.exec(`CREATE TEMP TRIGGER fail_bonus BEFORE INSERT ON inventory
      WHEN NEW.item_id='pikachu' BEGIN SELECT RAISE(ABORT, 'inventory unavailable'); END;`);
    expect(() => db.transaction(() => ensureWallet(db.sql, 'a', now))).toThrow('inventory unavailable');
    expect(view().coins).toBe(160);
    expect(view().owned).not.toContain('spider-man');
    db.sql.exec('DROP TRIGGER fail_bonus');
    db.transaction(() => ensureWallet(db.sql, 'a', now));
    expect(view().coins).toBe(10160);
    expect(view().owned).toContain('pikachu');
  });
  it('purchases heroes once and rejects skin purchases before owning their hero', () => {
    expect(() => db.transaction(() => purchase(db.sql, 'a', 'pikachu-peach', 0, now))).toThrow('hero');
    expect(view().coins).toBe(160);
    db.transaction(() => grantCoins(db.sql, 'a', 'test-hero', 1800, now));
    db.transaction(() => purchase(db.sql, 'a', 'pikachu', 0, now));
    db.transaction(() => purchase(db.sql, 'a', 'pikachu', 0, now));
    expect(view().coins).toBe(160);
    expect(view().owned.filter((id) => id === 'pikachu')).toHaveLength(1);
    expect(() => equip(db.sql, 'a', 'pikachu-peach')).toThrow('Unlock');
    expect(view().loadout.body).toBe('cloud');
  });
  it('equips a complete skin atomically and clears it when changing heroes', () => {
    db.transaction(() => {
      grantCoins(db.sql, 'a', 'test-skins', 6000, now);
      purchase(db.sql, 'a', 'pikachu', 0, now);
      purchase(db.sql, 'a', 'pikachu-peach', 0, now);
      equip(db.sql, 'a', 'pikachu-peach');
    });
    expect(view().loadout).toMatchObject({ body: 'pikachu', skin: 'pikachu-peach' });
    expect(view('b').loadout.body).toBe('cloud');
    db.transaction(() => equip(db.sql, 'a', 'cloud'));
    expect(view().loadout.skin).toBeUndefined();
    expect(view().owned).toContain('pikachu-peach');
    db.transaction(() => equip(db.sql, 'a', 'pikachu-peach'));
    db.transaction(() => unequip(db.sql, 'a', 'skin'));
    expect(view().loadout).toMatchObject({ body: 'pikachu' });
    expect(view().loadout.skin).toBeUndefined();
  });
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
    const meta = new MetaService(db);
    expect(meta.claimDaily('a', now).granted).toEqual([{ kind: 'coins', amount: 40 }]);
    expect(() => meta.claimDaily('a', now + 1000)).toThrow('Already collected');
    // The next day is the next square, not the first one again.
    expect(meta.claimDaily('a', now + 86400000).granted).toEqual([{ kind: 'coins', amount: 60 }]);
    expect(economyView(db.sql, 'a', 0, now + 86400000).dailyClaimed).toBe(true);
  });
  it('never sells an exclusive for coins, even at a price of zero', () => {
    db.transaction(() => grantCoins(db.sql, 'a', 'rich', 9000, now));
    expect(() => db.transaction(() => purchase(db.sql, 'a', 'lamplighter', 0, now))).toThrow('earned, not bought');
    expect(() => db.transaction(() => purchase(db.sql, 'a', 'title-founder', 0, now))).toThrow('earned, not bought');
    expect(view().owned).not.toContain('lamplighter');
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
