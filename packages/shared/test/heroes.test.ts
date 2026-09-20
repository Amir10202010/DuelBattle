import { describe, expect, it } from 'vitest';
import { COSMETICS, DEFAULT_LOADOUT, HEROES, HERO_SKINS, cosmetic, cosmeticState, heroById, normalizeLoadout, previewItem } from '../src/index.js';

describe('hero content and loadout compatibility', () => {
  it('keeps stable, unique purchasable IDs and a rig for every hero', () => {
    expect(new Set(COSMETICS.map((item) => item.id)).size).toBe(COSMETICS.length);
    expect(HEROES).toHaveLength(12);
    for (const hero of HEROES) {
      expect(hero.visual.rig).toBeTruthy();
      expect(cosmetic(hero.id)).toMatchObject({ slot: 'body', price: hero.price, rarity: hero.rarity });
      expect(hero.id.length).toBeLessThanOrEqual(40);
    }
    for (const skin of HERO_SKINS) {
      expect(HEROES.some((hero) => hero.id === skin.heroId)).toBe(true);
      expect(cosmetic(skin.id)?.slot).toBe('skin');
    }
  });
  it('preserves old inventory IDs and normalizes legacy or corrupt saves', () => {
    expect(normalizeLoadout()).toEqual(DEFAULT_LOADOUT);
    expect(normalizeLoadout({ body: 'cloud', outfit: 'varsity', aura: 'orbit' })).toMatchObject({ body: 'cloud', outfit: 'varsity', aura: 'orbit' });
    // A save naming a retired hero keeps everything else it was wearing and
    // falls back to the starter body rather than to an empty locker.
    expect(normalizeLoadout({ body: 'ember', outfit: 'varsity', aura: 'orbit' })).toMatchObject({ body: DEFAULT_LOADOUT.body, outfit: 'varsity', aura: 'orbit' });
    expect(normalizeLoadout({ body: 'no-such-hero', skin: 'spider-noir', weapon: 'pikachu' })).toEqual(DEFAULT_LOADOUT);
    expect(heroById('missing').id).toBe('cloud');
  });
  it('retains compatible skins and clears mismatched ones when switching heroes', () => {
    expect(normalizeLoadout({ body: 'spider-man', skin: 'spider-noir' }).skin).toBe('spider-noir');
    expect(normalizeLoadout({ body: 'pikachu', skin: 'spider-noir' }).skin).toBeUndefined();
    const kit = { body: 'spider-man', skin: 'spider-noir', aura: 'orbit' };
    expect(previewItem(kit, cosmetic('pikachu')!)).toMatchObject({ body: 'pikachu' });
    expect(previewItem(kit, cosmetic('pikachu')!).aura).toBeUndefined();
    expect(previewItem(kit, cosmetic('pikachu')!).skin).toBeUndefined();
    expect(kit.skin).toBe('spider-noir');
  });
  it('previews a skin on its owning hero without mutating the equipped loadout', () => {
    const kit = { body: 'cloud', weapon: 'comet' };
    expect(previewItem(kit, cosmetic('gojo-dusk')!)).toMatchObject({ body: 'gojo', skin: 'gojo-dusk', weapon: 'mitten' });
    expect(kit.body).toBe('cloud');
  });
  it('separates ownership, funds, level gates and upcoming content', () => {
    const state = { coins: 100, level: 1, owned: ['cloud'], loadout: DEFAULT_LOADOUT, dailyClaimed: false };
    expect(cosmeticState(cosmetic('cloud')!, state)).toMatchObject({ owned: true, equipped: true });
    expect(cosmeticState(cosmetic('pikachu')!, state)).toMatchObject({ affordable: false, owned: false, locked: false });
    expect(cosmeticState(cosmetic('stardust')!, state).locked).toBe(true);
    expect(cosmeticState(cosmetic('gojo-dusk')!, state).requiresHero).toBe(true);
    expect(cosmeticState({ ...cosmetic('pikachu')!, availability: 'coming-soon' }, state).comingSoon).toBe(true);
  });
});
