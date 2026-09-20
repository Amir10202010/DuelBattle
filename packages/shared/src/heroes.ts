/** A hero is content; ownership and equipment always come from the server wallet. */
export type HeroRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type HeroMotion = 'swing' | 'power' | 'ninja' | 'cape' | 'mischief' | 'bounce' | 'captain' | 'force' | 'hover' | 'speed' | 'float' | 'breathe' | 'warm';
export type HeroTheme = 'web' | 'ki' | 'leaf' | 'gotham' | 'comic' | 'electric' | 'sea' | 'galaxy' | 'tech' | 'rings' | 'infinity' | 'cloud' | 'ember';
export interface HeroDefinition {
  id: string;
  name: string;
  title: string;
  description: string;
  rarity: HeroRarity;
  price: number;
  currency: 'coins';
  category: 'heroes' | 'anime' | 'legends' | 'originals';
  tags: readonly string[];
  availability: 'available' | 'coming-soon';
  visual: {
    /** Registry key. One layered rig serves portrait, thumbnail and full preview. */
    rig: string;
    accent: string;
    backdrop: string;
    ink: string;
    theme: HeroTheme;
    motion: HeroMotion;
    tempo: number;
  };
  shop: { featured?: boolean; isNew?: boolean; number: string };
}

const define = (hero: Omit<HeroDefinition, 'currency' | 'availability'> & Partial<Pick<HeroDefinition, 'availability'>>): HeroDefinition => ({ currency: 'coins', availability: 'available', ...hero });

export const HEROES: readonly HeroDefinition[] = [
  define({ id: 'spider-man', name: 'Spider-Man', title: 'Your friendly neighborhood hero', description: 'Big heart. Quick moves. Always ready to swing into the next round.', rarity: 'epic', price: 3600, category: 'heroes', tags: ['Agile', 'Friendly'], visual: { rig: 'spider-man', accent: '#ee645b', backdrop: '#f2c6b4', ink: '#562d30', theme: 'web', motion: 'swing', tempo: 4.8 }, shop: { featured: true, number: '01' } }),
  define({ id: 'goku', name: 'Goku', title: 'A little more power', description: 'An unstoppable spirit with a very big appetite. Every rival is a new friend.', rarity: 'legendary', price: 5800, category: 'anime', tags: ['Energetic', 'Fearless'], visual: { rig: 'goku', accent: '#f5ad52', backdrop: '#f3d5a2', ink: '#644322', theme: 'ki', motion: 'power', tempo: 3.8 }, shop: { number: '02' } }),
  define({ id: 'naruto', name: 'Naruto', title: 'Believe in your next move', description: 'A pocket-sized ninja with a giant dream. Never leaves a teammate behind.', rarity: 'epic', price: 3400, category: 'anime', tags: ['Determined', 'Playful'], visual: { rig: 'naruto', accent: '#eaa154', backdrop: '#eed0a9', ink: '#5d3b26', theme: 'leaf', motion: 'ninja', tempo: 4.4 }, shop: { number: '03' } }),
  define({ id: 'batman', name: 'Batman', title: 'Small hero. Dark knight.', description: 'Quiet confidence, a perfectly dramatic cape, and a plan for every round.', rarity: 'epic', price: 3800, category: 'heroes', tags: ['Calm', 'Tactical'], visual: { rig: 'batman', accent: '#b5b8de', backdrop: '#c3c5dd', ink: '#393d60', theme: 'gotham', motion: 'cape', tempo: 6.2 }, shop: { number: '04' } }),
  define({ id: 'deadpool', name: 'Deadpool', title: 'Here for the plot twist', description: 'Maximum mischief in a miniature suit. Yes, the dramatic entrance is included.', rarity: 'epic', price: 3600, category: 'heroes', tags: ['Cheeky', 'Unpredictable'], visual: { rig: 'deadpool', accent: '#ec797a', backdrop: '#edbec2', ink: '#673441', theme: 'comic', motion: 'mischief', tempo: 5.4 }, shop: { number: '05' } }),
  define({ id: 'pikachu', name: 'Pikachu', title: 'A tiny spark of trouble', description: 'Bright cheeks, boundless energy. Your own little good-luck lightning bolt.', rarity: 'rare', price: 1800, category: 'legends', tags: ['Electric', 'Joyful'], visual: { rig: 'pikachu', accent: '#e4b73e', backdrop: '#eee3a4', ink: '#62501d', theme: 'electric', motion: 'bounce', tempo: 3.6 }, shop: { featured: true, number: '06' } }),
  define({ id: 'luffy', name: 'Luffy', title: 'Adventure starts here', description: 'One straw hat, a thousand adventures. Brings a sunny grin to every duel.', rarity: 'rare', price: 2400, category: 'anime', tags: ['Sunny', 'Adventurous'], visual: { rig: 'luffy', accent: '#54b4ad', backdrop: '#bce0d6', ink: '#2d5959', theme: 'sea', motion: 'captain', tempo: 5 }, shop: { number: '07' } }),
  define({ id: 'darth-vader', name: 'Darth Vader', title: 'The adorable side of the Force', description: 'A tiny silhouette with a galactic presence. The cape does most of the talking.', rarity: 'legendary', price: 6400, category: 'legends', tags: ['Mysterious', 'Composed'], visual: { rig: 'darth-vader', accent: '#c78599', backdrop: '#d9bfce', ink: '#563449', theme: 'galaxy', motion: 'force', tempo: 6.8 }, shop: { number: '08' } }),
  define({ id: 'iron-man', name: 'Iron Man', title: 'A bright idea in every round', description: 'Pocket armor. Full-sized confidence. Powered by curiosity and a tiny arc reactor.', rarity: 'legendary', price: 5800, category: 'heroes', tags: ['Inventive', 'Confident'], visual: { rig: 'iron-man', accent: '#e69067', backdrop: '#f0cfb1', ink: '#674333', theme: 'tech', motion: 'hover', tempo: 4.2 }, shop: { number: '09' } }),
  define({ id: 'sonic', name: 'Sonic', title: 'Catch me if you can', description: 'Fast feet, a fearless grin. Turns every new round into a running start.', rarity: 'rare', price: 2200, category: 'legends', tags: ['Speedy', 'Bold'], visual: { rig: 'sonic', accent: '#629ed5', backdrop: '#bbd8e8', ink: '#2c5073', theme: 'rings', motion: 'speed', tempo: 3.2 }, shop: { number: '10' } }),
  define({ id: 'gojo', name: 'Satoru Gojo', title: 'Limitless, naturally', description: 'Effortless style. A knowing smile. Makes the impossible look like a warm-up.', rarity: 'legendary', price: 6800, category: 'anime', tags: ['Cool', 'Limitless'], visual: { rig: 'gojo', accent: '#a5a0e2', backdrop: '#d8d0ef', ink: '#51496e', theme: 'infinity', motion: 'float', tempo: 5.8 }, shop: { featured: true, isNew: true, number: '11' } }),
  define({ id: 'cloud', name: 'Cloud kid', title: 'Your first adventure', description: 'Soft as a cloud, brave at heart. Your original partner, ready for a fresh start.', rarity: 'common', price: 0, category: 'originals', tags: ['Cozy', 'Curious'], visual: { rig: 'cloud', accent: '#89bbc2', backdrop: '#c8e3df', ink: '#385959', theme: 'cloud', motion: 'breathe', tempo: 5.4 }, shop: { number: '12' } }),
  define({ id: 'ember', name: 'Little ember', title: 'A warm little wildcard', description: 'A spark of courage in a flight jacket. Small steps, surprisingly big victories.', rarity: 'rare', price: 1800, category: 'originals', tags: ['Warm', 'Brave'], visual: { rig: 'ember', accent: '#eaa080', backdrop: '#edd2bd', ink: '#674939', theme: 'ember', motion: 'warm', tempo: 4.6 }, shop: { number: '13' } }),
];

const registry = new Map(HEROES.map((hero) => [hero.id, hero]));
export const heroById = (id: string | undefined): HeroDefinition => registry.get(id ?? '') ?? registry.get('cloud')!;

export type HeroForm = 'symbiote' | 'super-saiyan' | 'kcm' | 'armored-knight' | 'weapon-xi' | 'overcharge' | 'gear-five' | 'sith-lord' | 'nanotech' | 'shadow' | 'hollow-purple';
export interface HeroSkin {
  form: HeroForm;
  id: string;
  heroId: string;
  name: string;
  color: string;
  secondary: string;
  /**
   * Which colour the form's signature effect is lit by.
   *
   * Stated rather than derived. Half the forms are built on a near-black
   * primary where the accent has to carry the light, but no single measure
   * picks correctly for all of them: relative luminance rates Vader's crimson
   * below Batman's slate, and brightness rates Iron Man's brick above his arc
   * reactor's cyan. It is an art decision, so the art says it.
   */
  glow: string;
  price: number;
  rarity: HeroRarity;
}
/** Forms change silhouette, face, costume and signature effects; IDs preserve existing ownership. */
export const HERO_SKINS: readonly HeroSkin[] = [
  { id: 'spider-noir', heroId: 'spider-man', name: 'Symbiote', color: '#262936', secondary: '#e8e4dc', glow: '#e8e4dc', price: 4200, rarity: 'legendary', form: 'symbiote' },
  { id: 'goku-sunrise', heroId: 'goku', name: 'Super Saiyan', color: '#ed9540', secondary: '#f6d55b', glow: '#ed9540', price: 6500, rarity: 'legendary', form: 'super-saiyan' },
  { id: 'naruto-sage', heroId: 'naruto', name: 'Yang KCM V2', color: '#ffe396', secondary: '#f7a333', glow: '#ffe396', price: 6200, rarity: 'legendary', form: 'kcm' },
  { id: 'batman-arctic', heroId: 'batman', name: 'Armored Knight', color: '#657579', secondary: '#b8ede3', glow: '#b8ede3', price: 4800, rarity: 'legendary', form: 'armored-knight' },
  { id: 'deadpool-ink', heroId: 'deadpool', name: 'Weapon XI', color: '#d8b8a9', secondary: '#6e575e', glow: '#d8b8a9', price: 4200, rarity: 'legendary', form: 'weapon-xi' },
  { id: 'pikachu-peach', heroId: 'pikachu', name: 'Thunderstorm', color: '#f3cf52', secondary: '#8ccfe9', glow: '#f3cf52', price: 3600, rarity: 'legendary', form: 'overcharge' },
  { id: 'luffy-ocean', heroId: 'luffy', name: 'Gear 5', color: '#f1eee2', secondary: '#c5b5dd', glow: '#f1eee2', price: 7200, rarity: 'legendary', form: 'gear-five' },
  { id: 'vader-moon', heroId: 'darth-vader', name: 'Crimson Eclipse', color: '#30303e', secondary: '#df596a', glow: '#df596a', price: 6400, rarity: 'legendary', form: 'sith-lord' },
  { id: 'iron-man-mark', heroId: 'iron-man', name: 'Nanotech Overdrive', color: '#a94d4f', secondary: '#8de3ed', glow: '#8de3ed', price: 6800, rarity: 'legendary', form: 'nanotech' },
  { id: 'sonic-mint', heroId: 'sonic', name: 'Shadow Rush', color: '#34333d', secondary: '#dd5865', glow: '#dd5865', price: 5400, rarity: 'legendary', form: 'shadow' },
  { id: 'gojo-dusk', heroId: 'gojo', name: 'Hollow Purple', color: '#363248', secondary: '#b496f1', glow: '#b496f1', price: 7800, rarity: 'legendary', form: 'hollow-purple' },
];
const skins = new Map(HERO_SKINS.map((skin) => [skin.id, skin]));
export const heroSkin = (id: string | undefined) => skins.get(id ?? '');
