import { getRandomValues } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { cosmetic, duplicateValue, rollChest, type ChestId, type Granted, type Reward } from '@battle/shared';
import { creditCurrency, ensureWallet } from '../economy.js';
import { addPassPoints } from './season.js';

/** Chest rolls come from the CSPRNG: a predictable chest is a chest somebody farms. */
export const secureRandom = () => getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

function owned(sql: DatabaseSync, accountId: string): string[] {
  return sql.prepare('SELECT item_id FROM inventory WHERE account_id=?').all(accountId).map((row) => String(row.item_id));
}

/** Hands over an item, or its value in coins when it is already in the locker. */
function grantItem(sql: DatabaseSync, accountId: string, itemId: string, receipt: string, now: number): Granted {
  const inserted = sql.prepare('INSERT OR IGNORE INTO inventory VALUES(?,?,?)').run(accountId, itemId, now);
  if (inserted.changes) return { kind: 'item', itemId };
  const value = duplicateValue(cosmetic(itemId));
  creditCurrency(sql, accountId, `${receipt}:dup`, 'coins', value, now);
  return { kind: 'item', itemId, duplicate: { coins: value } };
}

/**
 * Opens a chest, or reopens the one already opened under this receipt.
 *
 * The contents are decided once and written down before anything is paid, so
 * a retried request — a double tap, a replayed webhook — shows the same chest
 * again rather than rolling a second time.
 */
function openChest(
  sql: DatabaseSync,
  accountId: string,
  chestId: ChestId,
  receipt: string,
  now: number,
  random: () => number,
): Granted {
  const stored = sql
    .prepare('SELECT contents FROM chest_openings WHERE account_id=? AND receipt=?')
    .get(accountId, receipt);
  if (stored) return { kind: 'chest', chestId, contents: JSON.parse(String(stored.contents)) as Granted[] };
  const rolled = rollChest(chestId, owned(sql, accountId), random);
  const contents = rolled.map((entry, index): Granted => {
    const at = `${receipt}:${index}`;
    if (entry.kind === 'coins' || entry.kind === 'gems') {
      creditCurrency(sql, accountId, at, entry.kind, entry.amount, now);
      return entry;
    }
    if (entry.kind === 'item') return grantItem(sql, accountId, entry.itemId, at, now);
    return entry;
  });
  sql
    .prepare('INSERT INTO chest_openings(account_id,receipt,chest_id,contents,at) VALUES(?,?,?,?,?)')
    .run(accountId, receipt, chestId, JSON.stringify(contents), now);
  return { kind: 'chest', chestId, contents };
}

/**
 * Pays a list of rewards under one receipt.
 *
 * The only function in the product that turns a `Reward` into rows. Each entry
 * gets its own sub-receipt, so a quest that pays coins twice over, or a pack
 * with two chests, is two payments rather than one swallowed by the other.
 * The caller holds the transaction.
 */
export function applyRewards(
  sql: DatabaseSync,
  accountId: string,
  rewards: readonly Reward[],
  receipt: string,
  now: number,
  random: () => number = secureRandom,
): Granted[] {
  const prior = sql.prepare('SELECT granted FROM reward_grants WHERE account_id=? AND receipt=?').get(accountId, receipt);
  if (prior) return JSON.parse(String(prior.granted)) as Granted[];
  ensureWallet(sql, accountId, now);
  const granted = rewards.map((reward, index): Granted => {
    const at = `${receipt}:${index}`;
    switch (reward.kind) {
      case 'coins':
      case 'gems':
        return { kind: reward.kind, amount: creditCurrency(sql, accountId, at, reward.kind, reward.amount, now) };
      case 'pass': {
        const moved = addPassPoints(sql, accountId, at, reward.amount, now);
        return { kind: 'pass', amount: moved ? reward.amount : 0 };
      }
      case 'item':
        return grantItem(sql, accountId, reward.itemId, at, now);
      case 'chest':
        return openChest(sql, accountId, reward.chestId, at, now, random);
    }
  });
  sql.prepare('INSERT INTO reward_grants(account_id,receipt,granted) VALUES(?,?,?)')
    .run(accountId, receipt, JSON.stringify(granted));
  return granted;
}
