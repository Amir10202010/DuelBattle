// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO_GESTURES, isAudioControl, preparePlayback, resumeAudio } from '../src/media/audioPlayback.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('browser audio startup', () => {
  it('calls resume inside the gesture, before yielding to a promise', async () => {
    const ctx = { state: 'suspended', resume: vi.fn(async () => { ctx.state = 'running'; }) };
    const result = resumeAudio(ctx as unknown as AudioContext);
    expect(ctx.resume).toHaveBeenCalledOnce();
    expect(await result).toBe(true);
  });
  it('does not report a forever-pending startup as running', async () => {
    vi.useFakeTimers();
    const ctx = { state: 'suspended', resume: () => new Promise<void>(() => {}) };
    const result = resumeAudio(ctx as unknown as AudioContext);
    await vi.advanceTimersByTimeAsync(1600);
    expect(await result).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('handles browser rejection without an unhandled promise', async () => {
    const ctx = { state: 'suspended', resume: async () => { throw new Error('NotAllowedError'); } };
    expect(await resumeAudio(ctx as unknown as AudioContext)).toBe(false);
  });
  it('requests playback routing when the device exposes audio sessions', () => {
    const session = { type: 'auto' };
    Object.defineProperty(navigator, 'audioSession', { configurable: true, value: session });
    preparePlayback();
    expect(session.type).toBe('playback');
    Reflect.deleteProperty(navigator, 'audioSession');
  });
  it('supports completed touches and leaves explicit audio buttons to their handlers', () => {
    expect(AUDIO_GESTURES).toContain('touchend');
    expect(AUDIO_GESTURES).toContain('click');
    const button = document.createElement('button');
    button.className = 'music-control';
    const event = new Event('click');
    button.dispatchEvent(event);
    expect(isAudioControl(event)).toBe(true);
  });
});
