// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { localStorage.clear(); vi.resetModules(); });
describe('persistent audio mix', () => {
  it('persists independent master and effects volumes', async () => {
    const { audioMix } = await import('../src/media/audioMix.js');
    audioMix.set({ master: .4, sfx: .65 });
    vi.resetModules();
    const restored = await import('../src/media/audioMix.js');
    expect(restored.audioMix.getSnapshot()).toEqual({ master: .4, sfx: .65 });
  });
  it('clamps values and rejects non-finite preferences', async () => {
    const { audioMix } = await import('../src/media/audioMix.js');
    audioMix.set({ master: -4, sfx: 2 });
    expect(audioMix.getSnapshot()).toEqual({ master: 0, sfx: 1 });
    audioMix.set({ master: NaN, sfx: Infinity });
    expect(audioMix.getSnapshot()).toEqual({ master: 0, sfx: 1 });
  });
  it('does not notify for unchanged values and disposes subscribers', async () => {
    const { audioMix } = await import('../src/media/audioMix.js');
    const listener = vi.fn(); const unsubscribe = audioMix.subscribe(listener);
    audioMix.set(audioMix.getSnapshot()); expect(listener).not.toHaveBeenCalled();
    audioMix.set({ master: .25 }); expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe(); audioMix.set({ master: .5 }); expect(listener).toHaveBeenCalledTimes(1);
  });
  it('survives malformed saved preferences', async () => {
    localStorage.setItem('battle.audio-mix.v1', 'broken');
    const { audioMix } = await import('../src/media/audioMix.js');
    expect(audioMix.getSnapshot().master).toBe(1);
  });
});
