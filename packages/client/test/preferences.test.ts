// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('device preferences and game language', () => {
  it('uses device preferences until the player chooses an override', async () => {
    vi.stubGlobal('navigator', { language: 'ru-RU' });
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn() }));
    const preferences = await import('../src/i18n/preferences.js');
    expect(preferences.getPreferences()).toEqual({
      theme: 'system',
      language: 'system',
      locale: 'ru',
    });
    expect(document.documentElement.dataset.theme).toBe('dark');
    preferences.setPreferences({ theme: 'light', language: 'en' });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.lang).toBe('en');
    vi.resetModules();
    const restored = await import('../src/i18n/preferences.js');
    expect(restored.getPreferences()).toEqual({ theme: 'light', language: 'en', locale: 'en' });
  });

  it('translates game messages without altering names or treating object keys as copy', async () => {
    const { setPreferences } = await import('../src/i18n/preferences.js');
    const { tr } = await import('../src/i18n/index.js');
    setPreferences({ language: 'ru' });
    expect(tr('Snap!')).toBe('Снять!');
    expect(tr('3 in a row!')).toBe('3 подряд!');
    expect(tr('Mila_9 wants a rematch.')).toBe('Mila_9 зовёт на реванш.');
    expect(tr('constructor')).toBe('constructor');
    expect(tr(42)).toBe(42);
    setPreferences({ language: 'en' });
    expect(tr('Snap!')).toBe('Snap!');
  });
});
