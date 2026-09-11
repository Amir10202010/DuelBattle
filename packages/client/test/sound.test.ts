// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A recording stand-in for the bits of WebAudio the sound board touches. */
class FakeParam {
  readonly calls: string[] = [];
  value = 0;
  setValueAtTime(v: number) {
    this.calls.push(`set:${v}`);
  }
  exponentialRampToValueAtTime(v: number) {
    this.calls.push(`ramp:${v}`);
  }
  setTargetAtTime(v: number) {
    this.calls.push(`target:${v}`);
  }
}

class FakeOscillator {
  type = 'sine';
  readonly frequency = new FakeParam();
  started = false;
  connect() {}
  start() {
    this.started = true;
  }
  stop() {}
}

class FakeGain {
  readonly gain = new FakeParam();
  connect() {}
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {};
  readonly oscillators: FakeOscillator[] = [];

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createOscillator() {
    const osc = new FakeOscillator();
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return new FakeGain();
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
}

async function freshBoard() {
  vi.resetModules();
  const module = await import('../src/media/sound.js');
  return module.sound;
}

beforeEach(() => {
  localStorage.clear();
  FakeAudioContext.instances = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sound board', () => {
  it('makes no audio context until something asks for sound', async () => {
    await freshBoard();
    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('plays a cue as a set of oscillators', async () => {
    const sound = await freshBoard();
    sound.unlock();
    sound.play('roundWin');

    const ctx = FakeAudioContext.instances[0]!;
    // Three ascending notes.
    expect(ctx.oscillators).toHaveLength(3);
    expect(ctx.oscillators.every((o) => o.started)).toBe(true);
  });

  it('reuses one context rather than opening one per cue', async () => {
    const sound = await freshBoard();
    sound.play('tick1');
    sound.play('tick2');
    sound.play('go');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('stays silent while muted', async () => {
    const sound = await freshBoard();
    sound.unlock();
    sound.setMuted(true);
    sound.play('matchWin');
    expect(FakeAudioContext.instances[0]!.oscillators).toHaveLength(0);
  });

  it('remembers being muted across a reload', async () => {
    const first = await freshBoard();
    first.setMuted(true);

    const second = await freshBoard();
    expect(second.isMuted).toBe(true);
    second.play('go');
    expect(FakeAudioContext.instances.flatMap((c) => c.oscillators)).toHaveLength(0);
  });

  it('comes back when unmuted', async () => {
    const sound = await freshBoard();
    sound.setMuted(true);
    sound.setMuted(false);
    sound.play('go');
    expect(FakeAudioContext.instances[0]!.oscillators.length).toBeGreaterThan(0);
  });

  it('resumes a context the browser suspended', async () => {
    const sound = await freshBoard();
    sound.unlock();
    const ctx = FakeAudioContext.instances[0]!;
    ctx.state = 'suspended';
    sound.unlock();
    expect(ctx.state).toBe('running');
  });

  it('does not throw when the browser has no audio at all', async () => {
    vi.stubGlobal('AudioContext', undefined);
    const sound = await freshBoard();
    expect(() => {
      sound.unlock();
      sound.play('go');
    }).not.toThrow();
  });
});
