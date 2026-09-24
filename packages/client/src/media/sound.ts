import { preparePlayback, resumeAudio, type PlaybackState } from './audioPlayback.js';
import { audioMix } from './audioMix.js';

export type Cue =
  | 'purchase' | 'equip' | 'hit' | 'finisher'
  | 'button'
  | 'hurry'
  | 'hurryFinal'
  | 'tick3'
  | 'tick2'
  | 'tick1'
  | 'go'
  | 'lockIn'
  | 'opponentLocked'
  | 'roundWin'
  | 'roundStreak'
  | 'roundLoss'
  | 'roundDraw'
  | 'matchWin'
  | 'matchLoss'
  | 'xpGain'
  | 'reward'
  | 'rankUp'
  | 'opponentJoined'
  | 'coin'
  | 'gem'
  | 'claim'
  | 'questComplete'
  | 'chestShake'
  | 'chestOpen'
  | 'rareReveal'
  | 'levelUp'
  | 'impact'
  | 'whoosh'
  | 'shutter'
  | 'error';

interface Note {
  /** Hertz. A second value sweeps to it over the note's length. Ignored by noise. */
  freq: number;
  to?: number;
  /** Seconds from the start of the cue. */
  at: number;
  duration: number;
  gain: number;
  /**
   * `noise` is filtered white noise: the air in a whoosh, the crack of an
   * impact, the shimmer on a chest. Oscillators alone sound like a phone from
   * 2004; one layer of noise under them is most of the difference.
   */
  type?: OscillatorType | 'noise';
  /** A band for noise to live in, optionally sweeping. */
  filter?: { type: BiquadFilterType; freq: number; to?: number; q?: number };
}

const sparkle = (at: number, base = 1760): Note[] =>
  [0, 0.05, 0.1].map((offset, i) => ({ freq: base * (1 + i * 0.26), at: at + offset, duration: 0.12, gain: 0.05 }));

/**
 * Every sound in the game, written as notes rather than shipped as files.
 *
 * A handful of oscillator envelopes cost nothing to load, never block the
 * first render, and cannot fail on a slow connection — which matters more here
 * than timbre, because these are all sub-second cues under a live camera.
 */
const CUES: Record<Cue, Note[]> = {
  purchase: [{ freq: 660, at: 0, duration: .12, gain: .13 }, { freq: 880, at: .09, duration: .13, gain: .14 }, { freq: 1320, at: .19, duration: .3, gain: .12 }],
  equip: [{ freq: 440, to: 880, at: 0, duration: .1, gain: .13, type: 'triangle' }],
  hit: [
    { freq: 170, to: 48, at: 0, duration: .16, gain: .3, type: 'triangle' },
    { freq: 780, to: 240, at: .02, duration: .07, gain: .1 },
    { freq: 0, at: 0, duration: .08, gain: .14, type: 'noise', filter: { type: 'lowpass', freq: 3200, to: 500 } },
  ],
  finisher: [
    { freq: 0, at: 0, duration: .22, gain: .06, type: 'noise', filter: { type: 'bandpass', freq: 500, to: 4000, q: 1.6 } },
    { freq: 140, to: 38, at: .12, duration: .32, gain: .3, type: 'triangle' },
    { freq: 0, at: .12, duration: .14, gain: .18, type: 'noise', filter: { type: 'lowpass', freq: 2600, to: 300 } },
    { freq: 523, at: .24, duration: .16, gain: .1 },
    { freq: 784, at: .35, duration: .28, gain: .12 },
  ],
  button: [{ freq: 520, to: 720, at: 0, duration: 0.045, gain: 0.065, type: 'triangle' }],
  hurry: [{ freq: 440, to: 330, at: 0, duration: 0.075, gain: 0.09, type: 'triangle' }],
  hurryFinal: [
    { freq: 660, at: 0, duration: 0.06, gain: 0.11, type: 'triangle' },
    { freq: 880, at: 0.1, duration: 0.07, gain: 0.1, type: 'triangle' },
  ],
  xpGain: [{ freq: 660, to: 990, at: 0, duration: 0.18, gain: 0.1 }],
  reward: [
    { freq: 880, at: 0, duration: 0.12, gain: 0.12 },
    { freq: 1175, at: 0.12, duration: 0.25, gain: 0.12 },
  ],
  rankUp: [
    { freq: 523, at: 0, duration: 0.15, gain: 0.13 },
    { freq: 784, at: 0.14, duration: 0.16, gain: 0.13 },
    { freq: 1047, at: 0.28, duration: 0.35, gain: 0.15 },
  ],
  // Countdown: three rising blips, so you can hear the round coming.
  tick3: [{ freq: 523, at: 0, duration: 0.09, gain: 0.16 }],
  tick2: [{ freq: 587, at: 0, duration: 0.09, gain: 0.18 }],
  tick1: [{ freq: 659, at: 0, duration: 0.09, gain: 0.2 }],
  go: [
    { freq: 880, at: 0, duration: 0.18, gain: 0.22 },
    { freq: 1320, at: 0.02, duration: 0.2, gain: 0.14 },
  ],
  // A low, blunt thunk: the sound of committing to an answer.
  lockIn: [
    { freq: 220, to: 110, at: 0, duration: 0.14, gain: 0.3, type: 'triangle' },
    { freq: 0, at: 0, duration: 0.03, gain: 0.1, type: 'noise', filter: { type: 'highpass', freq: 2500 } },
  ],
  // Deliberately distinct from your own lock-in — this is the sound of losing
  // the race, and you should be able to tell without looking.
  opponentLocked: [
    { freq: 392, at: 0, duration: 0.06, gain: 0.12, type: 'triangle' },
    { freq: 392, at: 0.09, duration: 0.06, gain: 0.12, type: 'triangle' },
  ],
  // A soft impact, bright arpeggio and a short harmonic tail.
  roundWin: [
    { freq: 150, to: 65, at: 0, duration: 0.17, gain: 0.17, type: 'triangle' },
    ...[523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({
      freq,
      at: 0.04 + i * 0.085,
      duration: 0.24,
      gain: 0.13,
      type: 'triangle' as const,
    })),
    { freq: 1567.98, at: 0.3, duration: 0.44, gain: 0.055 },
    { freq: 2093, at: 0.31, duration: 0.28, gain: 0.025 },
  ],
  roundStreak: [
    { freq: 165, to: 65, at: 0, duration: 0.2, gain: 0.17, type: 'triangle' },
    ...[659.25, 783.99, 1046.5, 1318.51].map((freq, i) => ({
      freq,
      at: 0.04 + i * 0.075,
      duration: 0.24,
      gain: 0.12,
      type: 'triangle' as const,
    })),
    { freq: 1567.98, at: 0.29, duration: 0.4, gain: 0.06 },
    { freq: 2093, at: 0.3, duration: 0.45, gain: 0.035 },
  ],
  roundLoss: [
    { freq: 392, at: 0, duration: 0.12, gain: 0.16, type: 'triangle' },
    { freq: 311, at: 0.1, duration: 0.24, gain: 0.16, type: 'triangle' },
  ],
  roundDraw: [
    { freq: 440, at: 0, duration: 0.1, gain: 0.13, type: 'triangle' },
    { freq: 440, at: 0.14, duration: 0.14, gain: 0.11, type: 'triangle' },
  ],
  matchWin: [
    { freq: 130.81, to: 65.4, at: 0, duration: 0.24, gain: 0.17, type: 'triangle' },
    ...[523.25, 659.25, 783.99, 1046.5, 1318.51].map((freq, i) => ({
      freq,
      at: 0.05 + i * 0.105,
      duration: 0.28,
      gain: 0.12,
      type: 'triangle' as const,
    })),
    ...[523.25, 783.99, 1046.5, 1567.98].map((freq) => ({
      freq,
      at: 0.58,
      duration: 0.65,
      gain: 0.06,
    })),
    { freq: 2093, at: 0.65, duration: 0.45, gain: 0.025 },
  ],
  matchLoss: [
    { freq: 440, at: 0, duration: 0.14, gain: 0.16, type: 'triangle' },
    { freq: 349, at: 0.13, duration: 0.14, gain: 0.16, type: 'triangle' },
    { freq: 262, at: 0.26, duration: 0.4, gain: 0.16, type: 'triangle' },
  ],
  opponentJoined: [
    { freq: 587, at: 0, duration: 0.1, gain: 0.16 },
    { freq: 880, at: 0.09, duration: 0.16, gain: 0.16 },
  ],
  // Two bright metallic pings: the sound a coin makes landing on a pile.
  coin: [
    { freq: 1568, at: 0, duration: 0.08, gain: 0.08, type: 'triangle' },
    { freq: 2093, at: 0.06, duration: 0.16, gain: 0.07, type: 'triangle' },
    { freq: 0, at: 0, duration: 0.05, gain: 0.03, type: 'noise', filter: { type: 'highpass', freq: 5000 } },
  ],
  // Glassier and higher than a coin, with a shimmer tail.
  gem: [
    { freq: 1319, at: 0, duration: 0.12, gain: 0.08 },
    { freq: 1976, at: 0.07, duration: 0.2, gain: 0.07 },
    ...sparkle(0.12, 2637),
  ],
  claim: [
    { freq: 660, to: 990, at: 0, duration: 0.12, gain: 0.1, type: 'triangle' },
    { freq: 1320, at: 0.1, duration: 0.18, gain: 0.08 },
    { freq: 0, at: 0, duration: 0.2, gain: 0.04, type: 'noise', filter: { type: 'bandpass', freq: 3000, to: 7000, q: 1.2 } },
  ],
  questComplete: [
    ...[784, 988, 1175, 1568].map((freq, i) => ({ freq, at: i * 0.07, duration: 0.2, gain: 0.1, type: 'triangle' as const })),
    ...sparkle(0.3),
  ],
  // The chest rattling on its lid: short low knocks.
  chestShake: [
    { freq: 140, to: 90, at: 0, duration: 0.06, gain: 0.16, type: 'triangle' },
    { freq: 0, at: 0, duration: 0.05, gain: 0.08, type: 'noise', filter: { type: 'lowpass', freq: 900 } },
    { freq: 150, to: 95, at: 0.11, duration: 0.06, gain: 0.16, type: 'triangle' },
    { freq: 0, at: 0.11, duration: 0.05, gain: 0.08, type: 'noise', filter: { type: 'lowpass', freq: 900 } },
  ],
  // The lid going: a thump, a rush of air up the spectrum, and a chord.
  chestOpen: [
    { freq: 110, to: 45, at: 0, duration: 0.3, gain: 0.26, type: 'triangle' },
    { freq: 0, at: 0, duration: 0.45, gain: 0.12, type: 'noise', filter: { type: 'bandpass', freq: 600, to: 6000, q: 0.8 } },
    ...[523, 659, 784, 1047].map((freq) => ({ freq, at: 0.12, duration: 0.7, gain: 0.05 })),
    ...sparkle(0.25, 2093),
  ],
  rareReveal: [
    { freq: 0, at: 0, duration: 0.6, gain: 0.08, type: 'noise', filter: { type: 'bandpass', freq: 1500, to: 9000, q: 1.5 } },
    ...[659, 831, 988, 1319, 1661].map((freq, i) => ({ freq, at: 0.05 + i * 0.06, duration: 0.5, gain: 0.07 })),
    ...sparkle(0.4, 2637),
  ],
  levelUp: [
    { freq: 392, at: 0, duration: 0.12, gain: 0.12, type: 'triangle' },
    { freq: 523, at: 0.1, duration: 0.12, gain: 0.12, type: 'triangle' },
    { freq: 659, at: 0.2, duration: 0.12, gain: 0.12, type: 'triangle' },
    { freq: 1047, at: 0.3, duration: 0.5, gain: 0.13, type: 'triangle' },
    ...sparkle(0.42),
  ],
  // A body blow: low sine drop under a short cracked-air transient.
  impact: [
    { freq: 120, to: 40, at: 0, duration: 0.22, gain: 0.32 },
    { freq: 0, at: 0, duration: 0.09, gain: 0.16, type: 'noise', filter: { type: 'lowpass', freq: 2400, to: 400 } },
  ],
  whoosh: [
    { freq: 0, at: 0, duration: 0.28, gain: 0.07, type: 'noise', filter: { type: 'bandpass', freq: 400, to: 3200, q: 2 } },
  ],
  // A camera shutter: two short clicks of bright noise.
  shutter: [
    { freq: 0, at: 0, duration: 0.025, gain: 0.14, type: 'noise', filter: { type: 'highpass', freq: 2500 } },
    { freq: 0, at: 0.07, duration: 0.035, gain: 0.1, type: 'noise', filter: { type: 'highpass', freq: 1800 } },
  ],
  error: [
    { freq: 220, at: 0, duration: 0.09, gain: 0.1, type: 'square' },
    { freq: 196, at: 0.1, duration: 0.14, gain: 0.08, type: 'square' },
  ],
};

const MUTE_KEY = 'battle.muted.v1';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The game's audio.
 *
 * The context is created on the first player gesture rather than at load,
 * because browsers refuse to start one before a user has interacted — and a
 * suspended context that nobody resumes is a silent game with no error.
 */
class SoundBoard {
  private active = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = readMuted();
  private playback: PlaybackState = 'idle';
  private attempt = 0;
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getMuted = () => this.muted;
  getPlayback = () => this.playback;
  private setPlayback(state: PlaybackState) {
    if (this.playback === state) return;
    this.playback = state;
    for (const listener of this.listeners) listener();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setActive(active: boolean) {
    this.active = active;
    this.updateMix();
    if (active && !this.muted) void this.unlock();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const listener of this.listeners) listener();
    if (this.master && this.ctx) {
      this.updateMix();
    }
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // A remembered preference is a convenience, not a requirement.
    }
  }

  updateMix() {
    const { master, sfx } = audioMix.getSnapshot();
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.active && !this.muted ? master * sfx : 0, this.ctx.currentTime, .02);
  }

  /** Safe to call on every gesture; only the first one does any work. */
  unlock(): Promise<void> | void {
    if (!this.active) return;
    preparePlayback();
    if (!this.ctx || this.ctx.state === 'closed') {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) { this.setPlayback('unavailable'); return; }
      try {
        this.ctx = new Ctor();
      } catch {
        this.setPlayback('unavailable');
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : audioMix.getSnapshot().master * audioMix.getSnapshot().sfx;
      this.master.connect(this.ctx.destination);
      this.ctx.onstatechange = () => {
        this.setPlayback(this.ctx?.state === 'running' ? 'running' : 'blocked');
      };
    }
    const attempt = ++this.attempt;
    if (this.ctx.state === 'running') { this.setPlayback('running'); return; }
    this.setPlayback('starting');
    return resumeAudio(this.ctx).then((running) => {
      if (attempt === this.attempt) this.setPlayback(running ? 'running' : 'blocked');
    });
  }

  play(cue: Cue): void {
    if (this.muted || !this.active) return;
    const ready = this.unlock();
    if (this.ctx && this.ctx.state !== 'running') {
      const requestedAt = Date.now();
      // Mobile browsers resume asynchronously. Keep the cue, but never replay
      // stale countdowns when a tab wakes up several seconds later.
      void ready?.then(() => {
        if (Date.now() - requestedAt < 1200) this.render(cue);
      });
      return;
    }
    this.render(cue);
  }

  private render(cue: Cue): void {
    const ctx = this.ctx;
    const master = this.master;
    if (this.muted || !this.active || !ctx || !master || ctx.state !== 'running') return;

    const start = ctx.currentTime;
    for (const note of CUES[cue]) {
      const noise = note.type === 'noise';
      const source: AudioScheduledSourceNode = noise ? this.noiseSource(ctx) : ctx.createOscillator();
      const gain = ctx.createGain();
      if (!noise) {
        const osc = source as OscillatorNode;
        osc.type = (note.type as OscillatorType | undefined) ?? 'sine';
        osc.frequency.setValueAtTime(note.freq, start + note.at);
        if (note.to !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.duration);
        }
      }

      // A fast attack and an exponential tail: anything slower reads as a hum
      // under a live camera rather than as a cue.
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.duration);

      let tail: AudioNode = source;
      let filter: BiquadFilterNode | null = null;
      if (note.filter) {
        filter = ctx.createBiquadFilter();
        filter.type = note.filter.type;
        filter.Q.value = note.filter.q ?? 0.9;
        filter.frequency.setValueAtTime(note.filter.freq, start + note.at);
        if (note.filter.to !== undefined)
          filter.frequency.exponentialRampToValueAtTime(note.filter.to, start + note.at + note.duration);
        source.connect(filter);
        tail = filter;
      }
      source.onended = () => {
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
      if (!note.filter) source.connect(gain);
      else tail.connect(gain);
      gain.connect(master);
      source.start(start + note.at);
      source.stop(start + note.at + note.duration + 0.02);
    }
  }

  /** One second of white noise, made once per context and replayed from a random offset. */
  private noise: AudioBuffer | null = null;
  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    if (!this.noise || this.noise.sampleRate !== ctx.sampleRate) {
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.loopStart = Math.random() * 0.5;
    return source;
  }
}

export const sound = new SoundBoard();
audioMix.subscribe(() => sound.updateMix());
