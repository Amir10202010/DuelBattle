import { COSMETICS, soldForCoins, type CosmeticItem } from '../cosmetics.js';
import { keyHash } from './quests.js';
import { PASS_PLUS_PRICE_GEMS, PASS_PRICE_GEMS } from './season.js';
import { chest, coins, gems, item, type Reward } from './rewards.js';

/**
 * Everything for sale, and what each thing costs.
 *
 * The rule the whole catalogue keeps: money buys identity and convenience,
 * never an edge. Every item here is cosmetic, currency or progress on a track
 * of cosmetics; nothing changes a camera verdict, a round or a rating. Prices
 * are written out rather than derived, so what the shop shows is exactly what
 * the server charges and what a payment provider is asked for.
 */

export type OfferPrice =
  | { currency: 'coins' | 'gems'; amount: number }
  /** Real money: US cents on the web, Telegram Stars inside Telegram. */
  | { currency: 'money'; usdCents: number; stars: number };

export type OfferKind = 'gems' | 'coins' | 'bundle' | 'pass' | 'starter' | 'founder';

export interface Offer {
  /** Also the product id sent to payment providers: lowercase and underscores only. */
  id: string;
  kind: OfferKind;
  name: string;
  description: string;
  price: OfferPrice;
  rewards: Reward[];
  /** `once` per account, `season` once per season, or unlimited. */
  limit: 'once' | 'season' | null;
  /** Days after sign-up the offer stays visible. Honest urgency, not a fake timer. */
  windowDays?: number;
  badge?: 'popular' | 'best-value' | 'one-time' | 'new';
  accent: string;
}

export const OFFERS: readonly Offer[] = [
  // -- Real money ---------------------------------------------------------
  {
    id: 'starter_pack', kind: 'starter', name: 'Starter pack',
    description: 'A running start: gems, coins, an original look and a rare chest.',
    price: { currency: 'money', usdCents: 199, stars: 100 },
    rewards: [gems(300), coins(3000), item('mint-hoodie'), item('banner-citrus'), chest('rare')],
    limit: 'once', windowDays: 14, badge: 'one-time', accent: '#d5f861',
  },
  {
    id: 'gems_80', kind: 'gems', name: 'Pouch of gems', description: '80 gems.',
    price: { currency: 'money', usdCents: 99, stars: 50 }, rewards: [gems(80)], limit: null, accent: '#7fd1f5',
  },
  {
    id: 'gems_500', kind: 'gems', name: 'Sack of gems', description: '500 gems.',
    price: { currency: 'money', usdCents: 499, stars: 250 }, rewards: [gems(500)], limit: null, accent: '#7fd1f5',
  },
  {
    id: 'gems_1200', kind: 'gems', name: 'Chest of gems', description: '1,200 gems.',
    price: { currency: 'money', usdCents: 999, stars: 500 }, rewards: [gems(1200)], limit: null, badge: 'popular', accent: '#6cb8ff',
  },
  {
    id: 'gems_2600', kind: 'gems', name: 'Vault of gems', description: '2,600 gems.',
    price: { currency: 'money', usdCents: 1999, stars: 1000 }, rewards: [gems(2600)], limit: null, badge: 'best-value', accent: '#c39bff',
  },
  {
    id: 'founder_pack', kind: 'founder', name: 'Founder pack',
    description: 'For the people who were here first: the Founder title and crest, 1,500 gems and an epic chest.',
    price: { currency: 'money', usdCents: 1499, stars: 750 },
    rewards: [gems(1500), item('title-founder'), item('banner-founder'), chest('epic')],
    limit: 'once', badge: 'one-time', accent: '#ffc247',
  },

  // -- The season ----------------------------------------------------------
  {
    id: 'season_pass', kind: 'pass', name: 'Season pass',
    description: 'Unlocks the premium track for this season, including every tier you have already reached.',
    price: { currency: 'gems', amount: PASS_PRICE_GEMS }, rewards: [], limit: 'season', accent: '#ffcf5a',
  },
  {
    id: 'season_pass_plus', kind: 'pass', name: 'Season pass +10 tiers',
    description: 'The premium track and ten tiers of progress straight away.',
    price: { currency: 'gems', amount: PASS_PLUS_PRICE_GEMS }, rewards: [], limit: 'season', badge: 'best-value', accent: '#ffcf5a',
  },

  // -- Gems for things -----------------------------------------------------
  {
    id: 'bundle_arcade', kind: 'bundle', name: 'Arcade set',
    description: 'A jacket, an aura and a banner that only come together.',
    price: { currency: 'gems', amount: 450 },
    rewards: [item('arcade-jacket'), item('pixel-storm'), item('banner-arcade')],
    limit: 'once', badge: 'new', accent: '#ff5fd2',
  },
  {
    id: 'coins_1200', kind: 'coins', name: 'Stack of coins', description: '1,200 coins.',
    price: { currency: 'gems', amount: 100 }, rewards: [coins(1200)], limit: null, accent: '#ffd36d',
  },
  {
    id: 'coins_6500', kind: 'coins', name: 'Crate of coins', description: '6,500 coins.',
    price: { currency: 'gems', amount: 500 }, rewards: [coins(6500)], limit: null, accent: '#ffd36d',
  },
];

const BY_ID = new Map(OFFERS.map((offer) => [offer.id, offer]));
export const offerById = (id: string) => BY_ID.get(id);

/** Money offers, in the order a price list reads. */
export const MONEY_OFFERS = OFFERS.filter((offer) => offer.price.currency === 'money');

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Daily deals: three coin-shop items at a discount, rotating at midnight UTC.
// ---------------------------------------------------------------------------

export const DEAL_DISCOUNT = 0.25;
export const DEALS_PER_DAY = 3;

/**
 * Today's deals.
 *
 * The same three for everybody, chosen by the date alone. A shelf that
 * reshuffled around what you own would change under you the moment you bought
 * one of them, and two friends comparing deals would think the shop was broken.
 * Heroes and hero-bound forms are left out: a discount on the most expensive
 * things in the game belongs to a sale somebody announced, not to a draw.
 */
export function dailyDeals(day: string): { itemId: string; price: number; was: number }[] {
  const shelf = COSMETICS.filter(
    (entry: CosmeticItem) =>
      soldForCoins(entry) && entry.price > 0 && entry.slot !== 'body' && entry.slot !== 'skin' && !entry.level,
  ).sort((a, b) => a.id.localeCompare(b.id));
  const picked: CosmeticItem[] = [];
  let hash = keyHash(`deals:${day}`);
  while (picked.length < DEALS_PER_DAY && shelf.length) {
    picked.push(shelf.splice(hash % shelf.length, 1)[0]!);
    hash = Math.floor(hash / 3) + 101;
  }
  return picked.map((entry) => ({
    itemId: entry.id,
    was: entry.price,
    price: Math.max(1, Math.round((entry.price * (1 - DEAL_DISCOUNT)) / 10) * 10),
  }));
}

export interface OfferView {
  id: string;
  kind: OfferKind;
  name: string;
  description: string;
  price: OfferPrice;
  rewards: Reward[];
  badge?: Offer['badge'];
  accent: string;
  /** Already used up for this account (a one-time offer, or this season's pass). */
  purchased: boolean;
  /** When a windowed offer stops being shown. */
  endsAt: number | null;
}

export interface StoreView {
  offers: OfferView[];
  deals: { itemId: string; price: number; was: number; owned: boolean }[];
  dealsResetAt: number;
  /** Which ways of paying real money this server can actually take. */
  payments: { card: boolean; stars: boolean };
}
