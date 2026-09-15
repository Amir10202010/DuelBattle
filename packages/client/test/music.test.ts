// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MusicPlayer } from '../src/media/music.js';

class Param {
  value = 0;
  setValueAtTime = vi.fn();
  setTargetAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class Node {
  gain = new Param();
  frequency = new Param();
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
class Context {
  static instances: Context[] = [];
  startedAt = Date.now();
  state = 'running';
  destination = {};
  sampleRate = 44100;
  notes: Node[] = [];
  gains: Node[] = [];
  get currentTime() { return (Date.now() - this.startedAt) / 1000; }
  constructor() { Context.instances.push(this); }
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  createBuffer = () => ({ getChannelData: () => new Float32Array(8820) });
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createBiquadFilter = () => new Node();
  createBufferSource = () => this.createOscillator();
  createOscillator() { const node = new Node(); this.notes.push(node); return node; }
}

let music: MusicPlayer;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('AudioContext', Context);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  localStorage.clear();
  Context.instances = [];
  music = new MusicPlayer();
});
afterEach(() => { music.pause(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('background music', () => {
  it('does not create audio or timers before explicit opt-in', () => {
    music.unlock(); music.restore(); music.setScene('battle');
    expect(Context.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('starts a composed score and keeps one scheduler across gestures and scenes', async () => {
    const schedule = vi.spyOn(globalThis, 'setInterval');
    music.setEnabled(true);
    await Promise.resolve();
    const ctx = Context.instances[0]!;
    expect(ctx.notes.length).toBeGreaterThan(3);
    music.unlock(); music.setScene('battle'); music.unlock();
    await Promise.resolve();
    expect(Context.instances).toHaveLength(1);
    expect(schedule).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(4000);
    expect(ctx.notes.length).toBeGreaterThan(20);
    expect(ctx.notes.every((node) => node.start.mock.calls.length === 1)).toBe(true);
  });
  it('stops scheduled voices and releases the audio device when switched off', async () => {
    music.setEnabled(true); await Promise.resolve();
    const ctx = Context.instances[0]!;
    music.setEnabled(false);
    const count = ctx.notes.length;
    vi.advanceTimersByTime(5000);
    expect(ctx.notes).toHaveLength(count);
    expect(ctx.notes.every((node) => node.stop.mock.calls.length === 2)).toBe(true);
    expect(ctx.suspend).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('remembers settings but does not autoplay a new page', () => {
    localStorage.setItem('battle.music.v1', JSON.stringify({ enabled: true, volume: .4 }));
    music = new MusicPlayer();
    music.restore();
    expect(music.getSnapshot()).toMatchObject({ enabled: true, volume: .4 });
    expect(Context.instances).toHaveLength(0);
  });
  it('bounds volume and ignores invalid numbers', () => {
    music.setVolume(7); expect(music.getSnapshot().volume).toBe(1);
    music.setVolume(-1); expect(music.getSnapshot().volume).toBe(0);
    music.setVolume(NaN); expect(music.getSnapshot().volume).toBe(0);
  });
  it('ducks under countdowns and result effects without restarting the track', async () => {
    music.setEnabled(true); await Promise.resolve();
    const gain = Context.instances[0]!.gains[0]!.gain;
    music.setScene('battle', true);
    const quiet = gain.setTargetAtTime.mock.lastCall![0] as number;
    music.setScene('menu', false);
    expect(gain.setTargetAtTime.mock.lastCall![0]).toBeGreaterThan(quiet);
    expect(Context.instances).toHaveLength(1);
  });
  it('cannot start in a hidden tab or after a pending resume was cancelled', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    music.setEnabled(true); expect(Context.instances).toHaveLength(0);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    vi.stubGlobal('AudioContext', class extends Context {
      override state = 'suspended';
      override resume = vi.fn(() => new Promise<void>(() => {}));
    });
    music.unlock(); music.setEnabled(false); await Promise.resolve();
    expect(Context.instances[0]!.notes).toHaveLength(0);
  });
  it('degrades to silence when audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => music.setEnabled(true)).not.toThrow();
    expect(music.getSnapshot()).toMatchObject({ enabled: true, unavailable: true, playback: 'unavailable' });
  });

  it('keeps the preference and retries a blocked start on the next gesture', async () => {
    vi.stubGlobal('AudioContext', class extends Context {
      override state = 'suspended';
      override resume = vi.fn(async () => { throw new Error('NotAllowedError'); });
    });
    music.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(music.getSnapshot()).toMatchObject({ enabled: true, playback: 'blocked' });
    const ctx = Context.instances[0]!;
    ctx.resume = vi.fn(async () => { ctx.state = 'running'; });
    music.unlock();
    await vi.advanceTimersByTimeAsync(0);
    expect(music.getSnapshot()).toMatchObject({ enabled: true, playback: 'running', unavailable: false });
    expect(ctx.notes.length).toBeGreaterThan(0);
  });
});
