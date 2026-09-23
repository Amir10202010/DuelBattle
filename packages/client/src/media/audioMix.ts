import { useSyncExternalStore } from 'react';

type Mix = { master: number; sfx: number };
const KEY = 'battle.audio-mix.v1';
const listeners = new Set<() => void>();
const bounded = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
function restore(): Mix {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value && typeof value === 'object') {
      const mix = value as Partial<Mix>;
      return { master: bounded(mix.master, 1), sfx: bounded(mix.sfx, .8) };
    }
  } catch { /* Sound remains usable when storage is unavailable. */ }
  return { master: 1, sfx: .8 };
}
let state = restore();
export const audioMix = {
  getSnapshot: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  set(patch: Partial<Mix>) {
    const next = { master: bounded(patch.master, state.master), sfx: bounded(patch.sfx, state.sfx) };
    if (next.master === state.master && next.sfx === state.sfx) return;
    state = next;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Optional preference. */ }
    listeners.forEach((listener) => listener());
  },
};
export const useAudioMix = () => useSyncExternalStore(audioMix.subscribe, audioMix.getSnapshot);
