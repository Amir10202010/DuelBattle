import { useSyncExternalStore } from 'react';
export type ThemePreference = 'system' | 'light' | 'dark';
export type LocalePreference = 'system' | 'en' | 'ru';
export interface UiPreferences {
  theme: ThemePreference;
  language: LocalePreference;
  locale: 'en' | 'ru';
}
const KEY = 'battle.preferences.v1';
const listeners = new Set<() => void>();
const media =
  typeof window !== 'undefined' ? window.matchMedia?.('(prefers-color-scheme: dark)') : undefined;
const browserLocale = (): 'en' | 'ru' =>
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ru')
    ? 'ru'
    : 'en';
function initial(): UiPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    const theme = saved.theme === 'dark' || saved.theme === 'light' ? saved.theme : 'system';
    const language = saved.language === 'en' || saved.language === 'ru' ? saved.language : 'system';
    return { theme, language, locale: language === 'system' ? browserLocale() : language };
  } catch {
    return { theme: 'system', language: 'system', locale: browserLocale() };
  }
}
let state = initial();
function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme =
    state.theme === 'system' ? (media?.matches ? 'dark' : 'light') : state.theme;
  document.documentElement.lang = state.locale;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      document.documentElement.dataset.theme === 'light' ? '#f7f8f1' : '#10131b',
    );
}
function notify() {
  apply();
  for (const listener of listeners) listener();
}
export function setPreferences(patch: Partial<Pick<UiPreferences, 'theme' | 'language'>>) {
  const next = { ...state, ...patch };
  state = { ...next, locale: next.language === 'system' ? browserLocale() : next.language };
  try {
    localStorage.setItem(KEY, JSON.stringify({ theme: state.theme, language: state.language }));
  } catch {
    /* Usable without storage. */
  }
  notify();
}
export const getPreferences = () => state;
export const subscribePreferences = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function useUiPreferences() {
  return useSyncExternalStore(subscribePreferences, getPreferences);
}
media?.addEventListener?.('change', () => {
  if (state.theme === 'system') {
    state = { ...state };
    notify();
  }
});
if (typeof window !== 'undefined')
  window.addEventListener('languagechange', () => {
    if (state.language === 'system') {
      state = { ...state, locale: browserLocale() };
      notify();
    }
  });
apply();
