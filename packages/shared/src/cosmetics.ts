export const COSMETIC_SLOTS = [
  'body',
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
  rarity: 'common' | 'rare' | 'epic';
  color: string;
  level?: number;
}
export const COSMETICS: readonly CosmeticItem[] = [
  { id: 'cloud', name: 'Cloud kid', slot: 'body', price: 0, rarity: 'common', color: '#c7e7f0' },
  { id: 'ember', name: 'Little ember', slot: 'body', price: 180, rarity: 'rare', color: '#ffac79' },
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
  {
    id: 'mitten',
    name: 'Big mitten',
    slot: 'weapon',
    price: 0,
    rarity: 'common',
    color: '#ffbd65',
  },
  { id: 'comet', name: 'Comet bat', slot: 'weapon', price: 250, rarity: 'epic', color: '#8aa6ff' },
  { id: 'wand', name: 'Cloud wand', slot: 'weapon', price: 180, rarity: 'rare', color: '#a7e7d8' },
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
export function cosmetic(id: string | undefined) {
  return COSMETICS.find((item) => item.id === id);
}
export function normalizeLoadout(value: unknown = {}): Loadout {
  const result = { ...DEFAULT_LOADOUT };
  if (!value || typeof value !== 'object') return result;
  const candidate = value as Record<string, unknown>;
  for (const slot of COSMETIC_SLOTS) {
    const id = candidate[slot];
    if (typeof id === 'string' && cosmetic(id)?.slot === slot) result[slot] = id;
  }
  return result;
}
export interface EconomyView {
  coins: number;
  owned: string[];
  loadout: Loadout;
  level: number;
  dailyClaimed: boolean;
}
