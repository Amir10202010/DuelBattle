import type { DatabaseSync } from 'node:sqlite';
import {
  COSMETICS,
  DEFAULT_LOADOUT,
  STARTER_ITEMS,
  cosmetic,
  dayKey,
  levelFor,
  normalizeLoadout,
  soldForCoins,
  type CosmeticSlot,
  type Currency,
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

/** The single largest amount any one grant may pay, in either currency. */
const MAX_GRANT = 10_000;

export function ensureWallet(sql: DatabaseSync, id: string, now: number) {
  const account = sql.prepare('SELECT email FROM accounts WHERE id=?').get(id);
  if (!account) throw new AuthError(401, 'Sign in to continue.');
  sql
    .prepare('INSERT OR IGNORE INTO wallets(account_id,coins,loadout) VALUES(?,?,?)')
    .run(id, 0, JSON.stringify(DEFAULT_LOADOUT));
  for (const item of STARTER_ITEMS)
    sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(id, item, now);
  credit(sql, id, 'welcome', 160, now);

  // Account emails are verified by Google or an email code. Never match a display name.
  if (
    typeof account.email === 'string' &&
    account.email.toLowerCase() === 'sagindiktar@gmail.com' &&
    credit(sql, id, 'account-bonus:2026-09-21', 10000, now)
  ) {
    for (const item of COSMETICS.filter((item) => item.availability !== 'coming-soon'))
      sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(id, item.id, now);
  }
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
  return creditCurrency(sql, id, receipt, 'coins', amount, now);
}

/**
 * The same promise as `grantCoins`, for either currency.
 *
 * Coins and gems share one ledger and one receipt space, so a receipt names a
 * payment, not a currency: the same reason can never pay twice in two
 * different currencies either. The caller holds the transaction and has made
 * sure the wallet exists.
 */
export function creditCurrency(
  sql: DatabaseSync,
  id: string,
  receipt: string,
  currency: Currency,
  amount: number,
  now: number,
): number {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_GRANT)
    throw new Error('Invalid currency grant');
  const inserted = sql
    .prepare('INSERT OR IGNORE INTO economy_ledger(account_id,receipt,delta,item_id,at,currency) VALUES(?,?,?,NULL,?,?)')
    .run(id, receipt, amount, now, currency);
  if (!inserted.changes) return 0;
  sql.prepare(`UPDATE wallets SET ${currency === 'gems' ? 'gems=gems+?' : 'coins=coins+?'} WHERE account_id=?`).run(amount, id);
  return amount;
}

/**
 * Takes a price, or refuses. Never goes below zero, never charges twice for
 * the same receipt. The caller holds the transaction around this and whatever
 * the money bought, so a refusal leaves nothing half-done.
 */
export function debitCurrency(
  sql: DatabaseSync,
  id: string,
  receipt: string,
  currency: Currency,
  amount: number,
  now: number,
  itemId: string | null = null,
): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Invalid price');
  if (sql.prepare('SELECT 1 FROM economy_ledger WHERE account_id=? AND receipt=?').get(id, receipt))
    throw new AuthError(409, 'That purchase has already gone through.');
  const column = currency === 'gems' ? 'gems' : 'coins';
  const debited = sql
    .prepare(`UPDATE wallets SET ${column}=${column}-? WHERE account_id=? AND ${column}>=?`)
    .run(amount, id, amount).changes;
  if (!debited)
    throw new AuthError(409, currency === 'gems' ? 'Not enough gems.' : 'Not enough Battle coins.');
  sql
    .prepare('INSERT INTO economy_ledger(account_id,receipt,delta,item_id,at,currency) VALUES(?,?,?,?,?,?)')
    .run(id, receipt, -amount, itemId, now, currency);
}

/** Today's calendar square has been collected. The legacy flat gift counts too. */
export function claimedToday(sql: DatabaseSync, id: string, now: number): boolean {
  const day = dayKey(now);
  return Boolean(
    sql.prepare('SELECT 1 FROM calendar_claims WHERE account_id=? AND day=?').get(id, day) ??
      sql.prepare('SELECT 1 FROM economy_ledger WHERE account_id=? AND receipt=?').get(id, `daily:${day}`),
  );
}

export function economyView(sql: DatabaseSync, id: string, xp: number, now: number): EconomyView {
  const wallet = sql.prepare('SELECT coins,gems,loadout FROM wallets WHERE account_id=?').get(id)!;
  return {
    coins: Number(wallet.coins),
    gems: Number(wallet.gems ?? 0),
    level: levelFor(xp).level,
    loadout: normalizeLoadout(JSON.parse(String(wallet.loadout))),
    owned: sql
      .prepare('SELECT item_id FROM inventory WHERE account_id=? ORDER BY acquired_at,item_id')
      .all(id)
      .map((r) => String(r.item_id)),
    dailyClaimed: claimedToday(sql, id, now),
  };
}

export function owns(sql: DatabaseSync, id: string, itemId: string): boolean {
  return Boolean(sql.prepare('SELECT 1 FROM inventory WHERE account_id=? AND item_id=?').get(id, itemId));
}

/** Caller holds BEGIN IMMEDIATE for the entire debit + ownership write. */
export function purchase(
  sql: DatabaseSync,
  id: string,
  itemId: string,
  xp: number,
  now: number,
  price?: number,
) {
  const item = cosmetic(itemId);
  if (!item) throw new AuthError(404, 'Item not found.');
  if (item.availability === 'coming-soon') throw new AuthError(409, 'This hero is coming soon.');
  // An exclusive has no coin price: a zero here would otherwise read as "free".
  if (!soldForCoins(item)) throw new AuthError(409, 'This one is earned, not bought. Check the season track and the store offers.');
  if (item.heroId && !owns(sql, id, item.heroId))
    throw new AuthError(409, 'Unlock the hero before this style.');
  if (owns(sql, id, item.id)) return;
  if (levelFor(xp).level < (item.level ?? 1))
    throw new AuthError(409, 'Reach the required level first.');
  const cost = price ?? item.price;
  if (cost > 0) debitCurrency(sql, id, `purchase:${item.id}`, 'coins', cost, now, item.id);
  else sql.prepare('INSERT OR IGNORE INTO economy_ledger(account_id,receipt,delta,item_id,at,currency) VALUES(?,?,0,?,?,?)').run(id, `purchase:${item.id}`, item.id, now, 'coins');
  sql.prepare('INSERT INTO inventory VALUES(?,?,?)').run(id, item.id, now);
}

export function equip(sql: DatabaseSync, id: string, itemId: string) {
  const item = cosmetic(itemId);
  if (!item || !owns(sql, id, itemId)) throw new AuthError(403, 'Unlock this item first.');
  const row = sql.prepare('SELECT loadout FROM wallets WHERE account_id=?').get(id)!;
  const loadout = normalizeLoadout(JSON.parse(String(row.loadout)));
  if (item.heroId) {
    if (!owns(sql, id, item.heroId)) throw new AuthError(403, 'Unlock the hero before this style.');
    // A saved look equips its owner atomically, so the preview is exactly the result.
    loadout.body = item.heroId;
  }
  loadout[item.slot] = item.id;
  sql.prepare('UPDATE wallets SET loadout=? WHERE account_id=?').run(JSON.stringify(normalizeLoadout(loadout)), id);
}

export function unequip(sql: DatabaseSync, id: string, slot: CosmeticSlot) {
  const row = sql.prepare('SELECT loadout FROM wallets WHERE account_id=?').get(id)!;
  const loadout = normalizeLoadout(JSON.parse(String(row.loadout)));
  delete loadout[slot];
  sql
    .prepare('UPDATE wallets SET loadout=? WHERE account_id=?')
    .run(JSON.stringify(normalizeLoadout(loadout)), id);
}

/** Level rewards that cost nothing are simply handed over when the level is reached. */
function grantLevelItems(sql: DatabaseSync, id: string, level: number, now: number) {
  for (const item of COSMETICS.filter(
    (item) => item.level && item.level <= level && item.price === 0 && !item.exclusive,
  ))
    sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(id, item.id, now);
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
  grantLevelItems(sql, id, reward.levelAfter, now);
  return coins;
}

/** Rewarded casual matches per account per UTC day. Past it, a match still counts for quests. */
export const CASUAL_DAILY_CAP = 12;

/**
 * Coins for a casual match: less than ranked, more than nothing.
 *
 * Ten for finishing and ten more for winning. The daily ceiling lives with the
 * caller, which decides whether this match was rewarded at all.
 */
export function casualCoins(
  sql: DatabaseSync,
  id: string,
  receipt: string,
  reward: MatchRewards,
  won: boolean,
  now: number,
) {
  if (!sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(id) || reward.xp <= 0) return 0;
  ensureWallet(sql, id, now);
  const amount = 10 + (won ? 10 : 0) + (reward.levelAfter - reward.levelBefore) * 40;
  const coins = credit(sql, id, `casual:${receipt}`, amount, now);
  grantLevelItems(sql, id, reward.levelAfter, now);
  return coins;
}

/** How many casual matches have paid out today. */
export function casualRewardsToday(sql: DatabaseSync, id: string, now: number): number {
  const start = Date.parse(`${dayKey(now)}T00:00:00Z`);
  return Number(
    sql
      .prepare("SELECT count(*) AS n FROM economy_ledger WHERE account_id=? AND receipt LIKE 'casual:%' AND at>=?")
      .get(id, start)!.n,
  );
}
