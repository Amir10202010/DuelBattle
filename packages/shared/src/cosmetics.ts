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
  /** A line under your name. Worn on cards, the ladder and the versus screen. */
  'title',
  /** The plate your name sits on. Identity without touching the hero. */
  'banner',
] as const;
export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];
export type Loadout = Partial<Record<CosmeticSlot, string>>;

/** Slots that dress the player's card rather than the hero. */
export const IDENTITY_SLOTS: readonly CosmeticSlot[] = ['title', 'banner'];

export type BannerPattern = 'stripes' | 'grid' | 'rays' | 'dots' | 'waves';

export interface CosmeticItem {
  id: string;
  name: string;
  slot: CosmeticSlot;
  price: number;
  rarity: HeroRarity;
  color: string;
  /** Second colour, for banners. */
  secondary?: string;
  pattern?: BannerPattern;
  level?: number;
  heroId?: string;
  availability?: 'available' | 'coming-soon';
  /**
   * Where the item can come from when it is not simply bought for coins.
   *
   * An exclusive item has no coin price at all: the season track, an offer or
   * a membership is the only way in, and the coin shop refuses it outright.
   * Without that refusal a price of zero would read as "free".
   */
  exclusive?: 'season-1' | 'founder' | 'premium' | 'starter' | 'bundle';
  /** May turn up in a chest. Only ever cosmetics that are also cheap to buy. */
  drop?: boolean;
}

/**
 * Titles, banners and original looks.
 *
 * Every one of these is original to this game and safe to sell, which is why
 * the season track, the offers and the chests draw from this list and never
 * from the licensed-style heroes above.
 */
const IDENTITY: readonly CosmeticItem[] = [
  // -- Titles --------------------------------------------------------------
  { id: 'title-good-sport', name: 'Good Sport', slot: 'title', price: 250, rarity: 'common', color: '#9aa38a', drop: true },
  { id: 'title-trendsetter', name: 'Trendsetter', slot: 'title', price: 450, rarity: 'rare', color: '#6cb8ff', drop: true },
  { id: 'title-colour-hunter', name: 'Colour Hunter', slot: 'title', price: 400, rarity: 'rare', color: '#ff9068', drop: true },
  { id: 'title-quick-draw', name: 'Quick Draw', slot: 'title', price: 400, rarity: 'rare', color: '#d5f861', drop: true },
  { id: 'title-scavenger', name: 'Scavenger', slot: 'title', price: 0, rarity: 'rare', color: '#e8b64a', exclusive: 'season-1' },
  { id: 'title-night-owl', name: 'Night Owl', slot: 'title', price: 0, rarity: 'rare', color: '#7f8cff', exclusive: 'season-1' },
  { id: 'title-lights-on', name: 'Lights On', slot: 'title', price: 0, rarity: 'epic', color: '#ffcf5a', exclusive: 'season-1' },
  { id: 'title-room-raider', name: 'Room Raider', slot: 'title', price: 0, rarity: 'epic', color: '#ff7b5c', exclusive: 'season-1' },
  { id: 'title-showstopper', name: 'Showstopper', slot: 'title', price: 0, rarity: 'legendary', color: '#ffc247', exclusive: 'season-1' },
  { id: 'title-first-light', name: 'First Light', slot: 'title', price: 0, rarity: 'rare', color: '#d5f861', exclusive: 'starter' },
  { id: 'title-founder', name: 'Founder', slot: 'title', price: 0, rarity: 'legendary', color: '#ffc247', exclusive: 'founder' },
  { id: 'title-patron', name: 'Patron', slot: 'title', price: 0, rarity: 'epic', color: '#c39bff', exclusive: 'premium' },

  // -- Banners -------------------------------------------------------------
  { id: 'banner-citrus', name: 'Citrus', slot: 'banner', price: 350, rarity: 'common', color: '#d5f861', secondary: '#2f3525', pattern: 'stripes', drop: true },
  { id: 'banner-coral', name: 'Coral', slot: 'banner', price: 500, rarity: 'rare', color: '#ff9068', secondary: '#ffe0d2', pattern: 'dots', drop: true },
  { id: 'banner-tide', name: 'Tide', slot: 'banner', price: 500, rarity: 'rare', color: '#3f8fd8', secondary: '#bfe6ff', pattern: 'waves', drop: true },
  { id: 'banner-pinboard', name: 'Pinboard', slot: 'banner', price: 0, rarity: 'rare', color: '#c98b55', secondary: '#f3e3c3', pattern: 'grid', exclusive: 'season-1' },
  { id: 'banner-filament', name: 'Filament', slot: 'banner', price: 0, rarity: 'epic', color: '#241d0d', secondary: '#ffcf5a', pattern: 'rays', exclusive: 'season-1' },
  { id: 'banner-golden-hour', name: 'Golden Hour', slot: 'banner', price: 0, rarity: 'legendary', color: '#ff8a4c', secondary: '#ffd86b', pattern: 'waves', exclusive: 'season-1' },
  { id: 'banner-arcade', name: 'Arcade', slot: 'banner', price: 0, rarity: 'epic', color: '#2b1e5c', secondary: '#ff5fd2', pattern: 'grid', exclusive: 'bundle' },
  { id: 'banner-sunrise', name: 'Sunrise', slot: 'banner', price: 0, rarity: 'rare', color: '#ffb35c', secondary: '#fff1c9', pattern: 'rays', exclusive: 'starter' },
  { id: 'banner-founder', name: "Founder's Crest", slot: 'banner', price: 0, rarity: 'legendary', color: '#2a2140', secondary: '#ffc247', pattern: 'rays', exclusive: 'founder' },
  { id: 'banner-patron', name: 'Patron', slot: 'banner', price: 0, rarity: 'epic', color: '#1f1830', secondary: '#c39bff', pattern: 'waves', exclusive: 'premium' },

  // -- Original looks: drawn by the original hero's rig, recoloured. -------
  { id: 'mint-hoodie', name: 'Mint hoodie', slot: 'outfit', price: 180, rarity: 'rare', color: '#6fcfab', drop: true },
  { id: 'lamplighter', name: 'Lamplighter coat', slot: 'outfit', price: 0, rarity: 'epic', color: '#e0a93c', exclusive: 'season-1' },
  { id: 'night-shift', name: 'Night-shift jacket', slot: 'outfit', price: 0, rarity: 'epic', color: '#3a4679', exclusive: 'season-1' },
  { id: 'arcade-jacket', name: 'Arcade jacket', slot: 'outfit', price: 0, rarity: 'epic', color: '#8b5cf6', exclusive: 'bundle' },
  { id: 'sunrise-parka', name: 'Sunrise parka', slot: 'outfit', price: 0, rarity: 'rare', color: '#ff9f5a', exclusive: 'starter' },
  { id: 'bubblegum', name: 'Bubblegum', slot: 'hair', price: 160, rarity: 'rare', color: '#ff8fc8', drop: true },
  { id: 'neon-fringe', name: 'Neon fringe', slot: 'hair', price: 0, rarity: 'epic', color: '#62f0ff', exclusive: 'season-1' },
  { id: 'copper-curls', name: 'Copper curls', slot: 'hair', price: 0, rarity: 'rare', color: '#c46b3b', exclusive: 'season-1' },
  { id: 'static', name: 'Static', slot: 'aura', price: 260, rarity: 'rare', color: '#7fd1f5', drop: true },
  { id: 'afterglow', name: 'Afterglow', slot: 'aura', price: 0, rarity: 'epic', color: '#ffd86b', exclusive: 'season-1' },
  { id: 'pixel-storm', name: 'Pixel storm', slot: 'aura', price: 0, rarity: 'epic', color: '#ff5fd2', exclusive: 'bundle' },
];
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
    drop: true,
  },
  { id: 'tuft', name: 'Bedhead', slot: 'hair', price: 0, rarity: 'common', color: '#41465c' },
  { id: 'snow', name: 'Snow spikes', slot: 'hair', price: 140, rarity: 'rare', color: '#f0f5ff', drop: true },
  {
    id: 'visor',
    name: 'Night visor',
    slot: 'accessory',
    price: 80,
    rarity: 'rare',
    color: '#535885',
    drop: true,
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
  ...IDENTITY,
];

/** What an item is worth in coins when it arrives a second time. */
export const DUPLICATE_COINS: Record<HeroRarity, number> = {
  common: 60,
  rare: 150,
  epic: 300,
  legendary: 600,
};

/** Whether the coin shop may sell this item at all. */
export function soldForCoins(item: CosmeticItem): boolean {
  return !item.exclusive && item.availability !== 'coming-soon';
}
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
    affordable: soldForCoins(item) && economy.coins >= item.price,
    requiresHero: Boolean(item.heroId && !economy.owned.includes(item.heroId)),
    comingSoon: item.availability === 'coming-soon',
    /** Earned elsewhere — the season, an offer, a membership — never bought here. */
    exclusive: Boolean(item.exclusive),
  };
}
export interface EconomyView {
  coins: number;
  /** Premium currency. Bought, or earned slowly from weekly quests and the season. */
  gems: number;
  owned: string[];
  loadout: Loadout;
  level: number;
  dailyClaimed: boolean;
}
