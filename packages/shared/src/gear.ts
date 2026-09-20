import type { HeroRarity } from './heroes.js';
export interface GearDefinition {
  id: string;
  name: string;
  description: string;
  price: number;
  rarity: HeroRarity;
  color: string;
  strike: 'punch' | 'orbit' | 'lightning' | 'slash' | 'pulse' | 'crescent';
}
export const GEAR: readonly GearDefinition[] = [
  { id: 'mitten', name: 'Big mitten', description: 'A soft glove with a surprisingly satisfying punch.', price: 0, rarity: 'common', color: '#efbc73', strike: 'punch' },
  { id: 'comet', name: 'Orbit Breaker', description: 'A miniature planet on a gravity handle. Sends a spinning comet across the arena.', price: 2800, rarity: 'epic', color: '#ada5ee', strike: 'orbit' },
  { id: 'wand', name: 'Stormcaller', description: 'A bottled storm, a crystal core, and one beautifully timed lightning strike.', price: 2400, rarity: 'epic', color: '#80dace', strike: 'lightning' },
  { id: 'prism-saber', name: 'Prism Saber', description: 'A weightless crystal blade that leaves a clean ribbon of light in its wake.', price: 4200, rarity: 'legendary', color: '#92d9ec', strike: 'slash' },
  { id: 'nova-gauntlet', name: 'Nova Gauntlet', description: 'A tiny stellar engine. Charge, punch, and watch the shockwave ripple out.', price: 4600, rarity: 'legendary', color: '#e9ac80', strike: 'pulse' },
  { id: 'moon-scythe', name: 'Moon Reaper', description: 'A crescent of dark silver that carves a violet arc through the air.', price: 5200, rarity: 'legendary', color: '#b59ade', strike: 'crescent' },
];
const registry = new Map(GEAR.map((gear) => [gear.id, gear]));
export const gearById = (id: string | undefined) => registry.get(id ?? 'mitten') ?? GEAR[0]!;
