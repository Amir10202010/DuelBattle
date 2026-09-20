import { HEROES, HERO_SKINS, heroSkin, type HeroRarity } from './heroes.js';
import { GEAR } from './gear.js';

export const COSMETIC_SLOTS = [
  'body',
  'skin',
  'outfit',
  'hair',
  'accessory',
  'weapon',
  'aura',
  'finisher',
] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];
export type Loadout = Partial<Record<CosmeticSlot, string>>;
export interface CosmeticItem {
  id: string;
  name: string;
  slot: CosmeticSlot;
  price: number;
  rarity: HeroRarity;
  color: string;
  level?: number;
  heroId?: string;
  availability?: 'available' | 'coming-soon';
}
export const COSMETICS: readonly CosmeticItem[] = [
  ...HEROES.map((hero): CosmeticItem => ({ id: hero.id, name: hero.name, slot: 'body', price: hero.price, rarity: hero.rarity, color: hero.visual.accent, availability: hero.availability })),
  ...HERO_SKINS.map((skin): CosmeticItem => ({ id: skin.id, name: skin.name, slot: 'skin', price: skin.price, rarity: skin.rarity, color: skin.color, heroId: skin.heroId })),
  ...GEAR.map((gear): CosmeticItem => ({ ...gear, slot: 'weapon' })),
  {
    id: 'pilot',
    name: 'Flight jacket',
    slot: 'outfit',
    price: 0,
    rarity: 'common',
    color: '#697ccc',
  },
  {
    id: 'midnight',
    name: 'Midnight coat',
    slot: 'outfit',
    price: 220,
    rarity: 'epic',
    color: '#383d69',
  },
  {
    id: 'varsity',
    name: 'Varsity jacket',
    slot: 'outfit',
    price: 120,
    rarity: 'rare',
    color: '#e46772',
  },
  { id: 'tuft', name: 'Bedhead', slot: 'hair', price: 0, rarity: 'common', color: '#41465c' },
  { id: 'snow', name: 'Snow spikes', slot: 'hair', price: 140, rarity: 'rare', color: '#f0f5ff' },
  {
    id: 'visor',
    name: 'Night visor',
    slot: 'accessory',
    price: 80,
    rarity: 'rare',
    color: '#535885',
  },
  { id: 'orbit', name: 'Mini orbit', slot: 'aura', price: 200, rarity: 'epic', color: '#baa4ff' },
  {
    id: 'stardust',
    name: 'Stardust',
    slot: 'aura',
    price: 0,
    level: 3,
    rarity: 'rare',
    color: '#ffce79',
  },
  {
    id: 'supernova',
    name: 'Pocket supernova',
    slot: 'finisher',
    price: 300,
    rarity: 'epic',
    color: '#f7b0cc',
  },
];
export const DEFAULT_LOADOUT: Loadout = {
  body: 'cloud',
  outfit: 'pilot',
  hair: 'tuft',
  weapon: 'mitten',
};
export const STARTER_ITEMS = Object.values(DEFAULT_LOADOUT);
const items = new Map(COSMETICS.map((item) => [item.id, item]));
export const cosmetic = (id: string | undefined) => items.get(id ?? '');
export function normalizeLoadout(value: unknown = {}): Loadout {
  const result = { ...DEFAULT_LOADOUT };
  if (!value || typeof value !== 'object') return result;
  const candidate = value as Record<string, unknown>;
  for (const slot of COSMETIC_SLOTS) {
    const id = candidate[slot];
    if (typeof id === 'string' && cosmetic(id)?.slot === slot) result[slot] = id;
  }
  if (result.skin && heroSkin(result.skin)?.heroId !== result.body) delete result.skin;
  return result;
}

/** Pure preview: never writes to the wallet or implies ownership. */
export function previewItem(loadout: Loadout, item: CosmeticItem): Loadout {
  const body = item.slot === 'body' ? item.id : item.heroId ?? loadout.body;
  // A different character starts from their own signature look, never another
  // hero's unsaved skin, hair, face accessory or weapon.
  const base = body === loadout.body ? loadout : { ...DEFAULT_LOADOUT, body };
  return normalizeLoadout({ ...base, ...(item.slot === 'body' ? { skin: undefined } : {}), [item.slot]: item.id });
}

export function cosmeticState(item: CosmeticItem, economy: EconomyView) {
  const owned = economy.owned.includes(item.id);
  return {
    owned,
    equipped: economy.loadout[item.slot] === item.id,
    locked: economy.level < (item.level ?? 1),
    affordable: economy.coins >= item.price,
    requiresHero: Boolean(item.heroId && !economy.owned.includes(item.heroId)),
    comingSoon: item.availability === 'coming-soon',
  };
}
export interface EconomyView {
  coins: number;
  owned: string[];
  loadout: Loadout;
  level: number;
  dailyClaimed: boolean;
}
