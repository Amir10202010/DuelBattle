// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_LOADOUT, HEROES, HERO_SKINS, cosmetic, type EconomyView } from '@battle/shared';
import { Customization } from '../src/components/avatar/Customization.js';
import { HeroPreview } from '../src/components/avatar/HeroPreview.js';
import { Hero } from '../src/components/avatar/Hero.js';
import { CHARACTER_ART } from '../src/components/avatar/CharacterArt.js';
import { setPreferences } from '../src/i18n/preferences.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const cleanups: Array<() => void> = [];
const action = vi.fn(async () => true);
let data: EconomyView;
let error = '';
let loading = false;
let missing = false;
let busy = false;
const refresh = vi.fn();
vi.mock('../src/hooks/useEconomy.js', () => ({ useEconomy: () => ({ data: missing ? null : data, loading, busy, error, feedback: null, act: action, refresh }) }));

function render(content: ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(content));
  cleanups.push(() => { act(() => root.unmount()); container.remove(); });
  return container;
}

const button = (view: HTMLElement, name: string) => [...view.querySelectorAll('button')].find((el) => el.textContent?.replace(/\s+/g, ' ').trim() === name)!;

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  setPreferences({ language: 'en' });
  data = { coins: 160, owned: ['cloud', 'pilot', 'tuft', 'mitten'], loadout: { ...DEFAULT_LOADOUT }, level: 1, dailyClaimed: false };
  error = ''; missing = false; loading = false; busy = false;
  action.mockClear(); refresh.mockClear();
});
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); vi.unstubAllGlobals(); });

describe('the playable collection', () => {
  it('renders every registered character in every pose without remote assets or duplicate SVG ids', () => {
    const art = HEROES.map((hero) => {
      expect(CHARACTER_ART[hero.visual.rig]).toBeTypeOf('function');
      return renderToStaticMarkup(<Hero loadout={{ body: hero.id }} animated={false} />);
    });
    expect(new Set(art).size).toBe(HEROES.length);
    expect(art.join('')).not.toMatch(/<image|<img|https?:|id="/);
    for (const skin of HERO_SKINS) {
      const form = renderToStaticMarkup(<Hero loadout={{ body: skin.heroId, skin: skin.id }} animated={false} />);
      expect(form).toContain(`hero-form--${skin.form}`);
      expect(form).not.toMatch(/NaN|undefined|<image|https?:/);
    }
    for (const pose of ['idle', 'select', 'unlock', 'victory', 'hit', 'attack', 'defeated', 'celebrate'] as const)
      expect(renderToStaticMarkup(<Hero loadout={{ body: 'pikachu' }} pose={pose} label="Pikachu" />)).toContain('aria-label="Pikachu"');
  });
  it('selects a hero for preview without charging or equipping it', () => {
    data.coins = 2000;
    const view = render(<Customization shop />);
    const pikachu = view.querySelector<HTMLButtonElement>('[aria-label="Pikachu, rare, 1800 Battle coins"]')!;
    act(() => pikachu.click());
    expect(view.querySelector('.hero-preview h2')?.textContent).toBe('Pikachu');
    expect(data.loadout.body).toBe('cloud');
    expect(action).not.toHaveBeenCalled();
    act(() => button(view, 'Unlock1800').click());
    expect(action).toHaveBeenCalledWith('buy', 'pikachu');
  });
  it('keeps unaffordable heroes previewable and explains the missing coins', () => {
    const view = render(<HeroPreview item={cosmetic('gojo')!} onSelect={vi.fn()} />);
    expect(button(view, 'Unlock6800').disabled).toBe(true);
    expect(view.textContent).toContain('6640 more coins to unlock');
    expect(view.querySelector('a')?.getAttribute('href')).toBe('/play');
    expect(action).not.toHaveBeenCalled();
  });
  it('supports reverting an equipped skin through the Classic option', () => {
    data.loadout = { ...DEFAULT_LOADOUT, body: 'pikachu', skin: 'pikachu-peach' };
    data.owned.push('pikachu', 'pikachu-peach');
    const view = render(<HeroPreview item={cosmetic('pikachu')!} onSelect={vi.fn()} />);
    expect(button(view, 'Equip look').disabled).toBe(false);
    act(() => button(view, 'Equip look').click());
    expect(action).toHaveBeenCalledWith('unequip', 'skin');
  });
  it('isolates form browsing from gear, and filters and sorts the real catalog', () => {
    const view = render(<Customization shop />);
    act(() => button(view, 'Forms').click());
    expect(view.querySelectorAll('.cosmetic-tile')).toHaveLength(11);
    act(() => (view.querySelector('.cosmetic-tile') as HTMLButtonElement).click());
    expect(view.querySelector('.hero-preview .hero-avatar--form-symbiote')).not.toBeNull();
    act(() => button(view, 'Gear').click());
    expect(view.querySelectorAll('.cosmetic-tile .hero-avatar')).toHaveLength(0);
    expect(view.querySelectorAll('.gear-art')).toHaveLength(6);
    act(() => (view.querySelectorAll('.cosmetic-tile')[1] as HTMLButtonElement).click());
    expect(view.querySelector('.hero-preview .hero-avatar--form-symbiote')).toBeNull();
    expect(view.querySelector('.hero-preview h2')?.textContent).toBe('Orbit Breaker');
    act(() => button(view, 'Heroes').click());
    const sorting = view.querySelectorAll('select')[1]!;
    act(() => { sorting.value = 'price-down'; sorting.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(view.querySelector('.collection-grid .hero-card')?.getAttribute('aria-label')).toContain('Satoru Gojo');
    act(() => button(view.querySelector('.collection-filters') as HTMLElement, 'Can unlock').click());
    expect(view.querySelectorAll('.collection-grid .hero-card')).toHaveLength(0);
    expect(action).not.toHaveBeenCalled();
  });
  it('does not allow a skin or level reward to bypass unlock requirements', () => {
    const skin = render(<HeroPreview item={cosmetic('gojo-dusk')!} onSelect={vi.fn()} />);
    expect(button(skin, 'Hero required').disabled).toBe(true);
    const aura = render(<HeroPreview item={cosmetic('stardust')!} onSelect={vi.fn()} />);
    expect(button(aura, 'Unlocks at level 3').disabled).toBe(true);
  });
  it('filters the owned collection and recovers from an empty selection', () => {
    const view = render(<Customization shop />);
    const filters = view.querySelector('.collection-filters') as HTMLElement;
    act(() => button(filters, 'Owned').click());
    expect(view.querySelectorAll('.collection-grid .hero-card')).toHaveLength(1);
    data.owned = [];
    act(() => button(filters, 'New').click());
    act(() => button(filters, 'Owned').click());
    expect(view.querySelector('.collection-empty')?.textContent).toContain('No heroes here yet');
    act(() => button(view, 'Explore all heroes').click());
    expect(view.querySelectorAll('.collection-grid .hero-card')).toHaveLength(13);
  });
  it('shows loading and recoverable failure without a fake wallet', () => {
    missing = true; loading = true;
    const skeleton = render(<Customization shop />);
    expect(skeleton.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(skeleton.querySelector('.hero-card')).toBeNull();
    loading = false; error = 'Could not load your items. Try again.';
    const failure = render(<Customization />);
    expect(failure.textContent).toContain('Your locker did not load.');
    act(() => button(failure, 'Try again').click());
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('disables actions during a mutation and exposes a failure for retry', () => {
    busy = true;
    const pending = render(<HeroPreview item={cosmetic('pikachu')!} onSelect={vi.fn()} />);
    expect(button(pending, 'Saving…').disabled).toBe(true);
    busy = false; error = 'Network unavailable';
    const failed = render(<HeroPreview item={cosmetic('pikachu')!} onSelect={vi.fn()} />);
    expect(failed.querySelector('[role="alert"]')?.textContent).toContain('Network unavailable');
    act(() => button(failed, 'Try again').click());
    expect(action).toHaveBeenCalledWith('buy', 'pikachu');
  });
});
