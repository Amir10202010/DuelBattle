import type { DatabaseSync } from 'node:sqlite';
import {
  COSMETICS,
  DEFAULT_LOADOUT,
  STARTER_ITEMS,
  cosmetic,
  levelFor,
  normalizeLoadout,
  type CosmeticSlot,
  type EconomyView,
  type MatchRewards,
} from '@battle/shared';
import { AuthError } from './auth.js';

export function migrateEconomy(sql: DatabaseSync) {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      coins INTEGER NOT NULL DEFAULT 0 CHECK(coins >= 0 AND coins <= 100000000),
      loadout TEXT NOT NULL CHECK(json_valid(loadout))
    );
    CREATE TABLE IF NOT EXISTS inventory (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL, acquired_at INTEGER NOT NULL, PRIMARY KEY(account_id,item_id)
    );
    CREATE TABLE IF NOT EXISTS economy_ledger (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      receipt TEXT NOT NULL, delta INTEGER NOT NULL, item_id TEXT, at INTEGER NOT NULL,
      PRIMARY KEY(account_id,receipt)
    );
    CREATE INDEX IF NOT EXISTS economy_history ON economy_ledger(account_id,at DESC);
    INSERT OR IGNORE INTO migrations VALUES(3, unixepoch()*1000);
  `);
}

export function ensureWallet(sql: DatabaseSync, id: string, now: number) {
  if (!sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(id))
    throw new AuthError(401, 'Sign in to continue.');
  sql
    .prepare('INSERT OR IGNORE INTO wallets VALUES(?,?,?)')
    .run(id, 0, JSON.stringify(DEFAULT_LOADOUT));
  for (const item of STARTER_ITEMS)
    sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(id, item, now);
  credit(sql, id, 'welcome', 160, now);
}

/**
 * Pays coins once, and only once, for a named reason.
 *
 * The ledger's primary key is (account, receipt), so a caller that hands over
 * the same receipt twice — a retried webhook, a duplicated settlement, a
 * referral reward evaluated on two paths — pays nothing the second time. That
 * is the whole idempotency story for the economy, and every new grant in the
 * product goes through it rather than touching `wallets` directly.
 */
export function grantCoins(
  sql: DatabaseSync,
  id: string,
  receipt: string,
  amount: number,
  now: number,
): number {
  if (!sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(id)) return 0;
  ensureWallet(sql, id, now);
  return credit(sql, id, receipt, amount, now);
}

function credit(
  sql: DatabaseSync,
  id: string,
  receipt: string,
  amount: number,
  now: number,
): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10000)
    throw new Error('Invalid coin grant');
  const inserted = sql
    .prepare('INSERT OR IGNORE INTO economy_ledger VALUES(?,?,?,NULL,?)')
    .run(id, receipt, amount, now);
  if (!inserted.changes) return 0;
  sql.prepare('UPDATE wallets SET coins=coins+? WHERE account_id=?').run(amount, id);
  return amount;
}

export function economyView(sql: DatabaseSync, id: string, xp: number, now: number): EconomyView {
  const wallet = sql.prepare('SELECT coins,loadout FROM wallets WHERE account_id=?').get(id)!;
  return {
    coins: Number(wallet.coins),
    level: levelFor(xp).level,
    loadout: normalizeLoadout(JSON.parse(String(wallet.loadout))),
    owned: sql
      .prepare('SELECT item_id FROM inventory WHERE account_id=? ORDER BY acquired_at,item_id')
      .all(id)
      .map((r) => String(r.item_id)),
    dailyClaimed: Boolean(
      sql
        .prepare('SELECT 1 FROM economy_ledger WHERE account_id=? AND receipt=?')
        .get(id, `daily:${new Date(now).toISOString().slice(0, 10)}`),
    ),
  };
}

/** Caller holds BEGIN IMMEDIATE for the entire debit + ownership write. */
export function purchase(sql: DatabaseSync, id: string, itemId: string, xp: number, now: number) {
  const item = cosmetic(itemId);
  if (!item) throw new AuthError(404, 'Item not found.');
  if (item.availability === 'coming-soon') throw new AuthError(409, 'This hero is coming soon.');
  if (item.heroId && !sql.prepare('SELECT 1 FROM inventory WHERE account_id=? AND item_id=?').get(id, item.heroId))
    throw new AuthError(409, 'Unlock the hero before this style.');
  if (sql.prepare('SELECT 1 FROM inventory WHERE account_id=? AND item_id=?').get(id, item.id))
    return;
  if (levelFor(xp).level < (item.level ?? 1))
    throw new AuthError(409, 'Reach the required level first.');
  if (
    !sql
      .prepare('UPDATE wallets SET coins=coins-? WHERE account_id=? AND coins>=?')
      .run(item.price, id, item.price).changes
  )
    throw new AuthError(409, 'Not enough Battle coins.');
  sql.prepare('INSERT INTO inventory VALUES(?,?,?)').run(id, item.id, now);
  sql
    .prepare('INSERT INTO economy_ledger VALUES(?,?,?,?,?)')
    .run(id, `purchase:${item.id}`, -item.price, item.id, now);
}

export function equip(sql: DatabaseSync, id: string, itemId: string) {
  const item = cosmetic(itemId);
  if (
    !item ||
    !sql.prepare('SELECT 1 FROM inventory WHERE account_id=? AND item_id=?').get(id, itemId)
  )
    throw new AuthError(403, 'Unlock this item first.');
  const row = sql.prepare('SELECT loadout FROM wallets WHERE account_id=?').get(id)!;
  const loadout = normalizeLoadout(JSON.parse(String(row.loadout)));
  if (item.heroId) {
    if (!sql.prepare('SELECT 1 FROM inventory WHERE account_id=? AND item_id=?').get(id, item.heroId))
      throw new AuthError(403, 'Unlock the hero before this style.');
    // A saved look equips its owner atomically, so the preview is exactly the result.
    loadout.body = item.heroId;
  }
  loadout[item.slot] = item.id;
  sql.prepare('UPDATE wallets SET loadout=? WHERE account_id=?').run(JSON.stringify(normalizeLoadout(loadout)), id);
}

export function dailyCoins(sql: DatabaseSync, id: string, now: number) {
  return credit(sql, id, `daily:${new Date(now).toISOString().slice(0, 10)}`, 30, now);
}

export function unequip(sql: DatabaseSync, id: string, slot: CosmeticSlot) {
  const row = sql.prepare('SELECT loadout FROM wallets WHERE account_id=?').get(id)!;
  const loadout = normalizeLoadout(JSON.parse(String(row.loadout)));
  delete loadout[slot];
  sql
    .prepare('UPDATE wallets SET loadout=? WHERE account_id=?')
    .run(JSON.stringify(normalizeLoadout(loadout)), id);
}

export function matchCoins(
  sql: DatabaseSync,
  id: string,
  receipt: string,
  reward: MatchRewards,
  now: number,
) {
  if (!sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(id) || reward.xp <= 0) return 0;
  ensureWallet(sql, id, now);
  const profile = sql.prepare('SELECT payload FROM profiles WHERE id=?').get(id)!;
  const { streak = 0 } = JSON.parse(String(profile.payload)) as { streak: number };
  const amount =
    20 +
    Math.min(streak, 4) * 5 +
    (reward.dailyBonus ? 30 : 0) +
    (reward.levelAfter - reward.levelBefore) * 40 +
    reward.unlocked.length * 20;
  const coins = credit(sql, id, `battle:${receipt}`, amount, now);
  for (const item of COSMETICS.filter(
    (item) => item.level && item.level <= reward.levelAfter && item.price === 0,
  ))
    sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(id, item.id, now);
  return coins;
}
