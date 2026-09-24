import { COSMETICS, DUPLICATE_COINS, type CosmeticItem } from '../cosmetics.js';
import type { HeroRarity } from '../heroes.js';
import type { ChestId, Granted } from './rewards.js';

/**
 * Chests: earned from quests, the calendar and the season, or included in
 * bundles. Purchase confirmations disclose these probabilities before payment.
 * The roll happens on the server, once, when the reward is granted; the client
 * only replays what was decided. An exhausted item pool pays coins instead.
 */
export interface ChestDefinition {
  id: ChestId;
  name: string;
  rarity: HeroRarity;
  coins: readonly [number, number];
  gems: { chance: number; range: readonly [number, number] };
  item: { chance: number; rarities: readonly HeroRarity[] };
}

export const CHESTS: Record<ChestId, ChestDefinition> = {
  battle: {
    id: 'battle',
    name: 'Battle chest',
    rarity: 'common',
    coins: [60, 140],
    gems: { chance: 0.25, range: [4, 10] },
    item: { chance: 0.2, rarities: ['common', 'rare'] },
  },
  rare: {
    id: 'rare',
    name: 'Rare chest',
    rarity: 'rare',
    coins: [150, 300],
    gems: { chance: 0.5, range: [10, 25] },
    item: { chance: 0.45, rarities: ['common', 'rare', 'epic'] },
  },
  epic: {
    id: 'epic',
    name: 'Epic chest',
    rarity: 'epic',
    coins: [300, 600],
    gems: { chance: 1, range: [20, 40] },
    item: { chance: 0.8, rarities: ['rare', 'epic'] },
  },
};

/** Coins paid instead when the item roll finds nothing left to give. */
const EMPTY_POOL_COINS = 150;

/** The disclosure printed on every chest, in the order a player would ask. */
export function chestOdds(id: ChestId): { label: string; chance: number }[] {
  const chest = CHESTS[id];
  return [
    { label: `${chest.coins[0]}–${chest.coins[1]} coins`, chance: 1 },
    { label: `${chest.gems.range[0]}–${chest.gems.range[1]} gems`, chance: chest.gems.chance },
    { label: 'A cosmetic you do not own yet', chance: chest.item.chance },
  ];
}

/** Items a chest may contain for this player: droppable, of the right rarity, not owned. */
export function chestPool(id: ChestId, owned: readonly string[]): CosmeticItem[] {
  const have = new Set(owned);
  const rarities = new Set(CHESTS[id].item.rarities);
  return COSMETICS.filter((item) => item.drop && rarities.has(item.rarity) && !have.has(item.id));
}

const between = (random: () => number, [low, high]: readonly [number, number]) =>
  low + Math.floor(random() * (high - low + 1));

/**
 * Decides what is inside. Pure: the server passes a cryptographic source, the
 * tests pass a seeded one, and both get exactly this arithmetic.
 */
export function rollChest(id: ChestId, owned: readonly string[], random: () => number): Granted[] {
  const chest = CHESTS[id];
  const contents: Granted[] = [{ kind: 'coins', amount: between(random, chest.coins) }];
  if (random() < chest.gems.chance) contents.push({ kind: 'gems', amount: between(random, chest.gems.range) });
  if (random() < chest.item.chance) {
    const pool = chestPool(id, owned);
    const picked = pool[Math.floor(random() * pool.length)];
    // A player who owns everything droppable is paid, not told "nothing".
    contents.push(picked ? { kind: 'item', itemId: picked.id } : { kind: 'coins', amount: EMPTY_POOL_COINS });
  }
  return contents;
}

/** What a second copy of an item turns into. */
export function duplicateValue(item: CosmeticItem | undefined): number {
  return item ? DUPLICATE_COINS[item.rarity] : DUPLICATE_COINS.common;
}
