/**
 * What the game can hand a player, in one vocabulary.
 *
 * A quest, a season tier, a daily claim, a chest and a purchase all end the
 * same way — something lands in a wallet or a locker — so they all describe it
 * the same way. The server is the only thing that turns one of these into a
 * row; the client only ever draws them.
 */

export type Currency = 'coins' | 'gems';

export type ChestId = 'battle' | 'rare' | 'epic';

export type Reward =
  | { kind: 'coins'; amount: number }
  | { kind: 'gems'; amount: number }
  /** Season pass points. They move the pass and nothing else. */
  | { kind: 'pass'; amount: number }
  | { kind: 'item'; itemId: string }
  | { kind: 'chest'; chestId: ChestId };

/**
 * A reward after the server has applied it.
 *
 * Two things only become known at that moment: what was inside a chest, and
 * whether an item was already owned. A duplicate is never silently dropped —
 * it turns into coins, and says so.
 */
export type Granted =
  | { kind: 'coins'; amount: number }
  | { kind: 'gems'; amount: number }
  | { kind: 'pass'; amount: number }
  | { kind: 'item'; itemId: string; duplicate?: { coins: number } }
  | { kind: 'chest'; chestId: ChestId; contents: Granted[] };

export const coins = (amount: number): Reward => ({ kind: 'coins', amount });
export const gems = (amount: number): Reward => ({ kind: 'gems', amount });
export const passPoints = (amount: number): Reward => ({ kind: 'pass', amount });
export const item = (itemId: string): Reward => ({ kind: 'item', itemId });
export const chest = (chestId: ChestId): Reward => ({ kind: 'chest', chestId });

/**
 * Totals of every currency in a list, chest contents included.
 *
 * What a results line or a toast says: "+120 coins, +10 gems" reads better
 * than six chips, and it is the same arithmetic the wallet did.
 */
export function totals(list: readonly (Reward | Granted)[]): {
  coins: number;
  gems: number;
  pass: number;
  items: string[];
} {
  const sum = { coins: 0, gems: 0, pass: 0, items: [] as string[] };
  const walk = (entries: readonly (Reward | Granted)[]) => {
    for (const entry of entries) {
      if (entry.kind === 'coins') sum.coins += entry.amount;
      else if (entry.kind === 'gems') sum.gems += entry.amount;
      else if (entry.kind === 'pass') sum.pass += entry.amount;
      else if (entry.kind === 'item') {
        if ('duplicate' in entry && entry.duplicate) sum.coins += entry.duplicate.coins;
        else sum.items.push(entry.itemId);
      } else if ('contents' in entry) walk(entry.contents);
    }
  };
  walk(list);
  return sum;
}

/** Whether a reward is worth a reveal moment, rather than a quiet counter tick. */
export function isSpectacular(list: readonly (Reward | Granted)[]): boolean {
  return list.some((entry) => entry.kind === 'chest' || entry.kind === 'item' ||
    (entry.kind === 'gems' && entry.amount >= 50));
}
