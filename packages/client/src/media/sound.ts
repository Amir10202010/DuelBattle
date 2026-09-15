export type Cue =
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
  | 'opponentJoined';

interface Note {
  /** Hertz. A second value sweeps to it over the note's length. */
  freq: number;
  to?: number;
  /** Seconds from the start of the cue. */
  at: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
}

/**
 * Every sound in the game, written as notes rather than shipped as files.
 *
 * A handful of oscillator envelopes cost nothing to load, never block the
 * first render, and cannot fail on a slow connection — which matters more here
 * than timbre, because these are all sub-second cues under a live camera.
 */
const CUES: Record<Cue, Note[]> = {
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
  lockIn: [{ freq: 220, to: 110, at: 0, duration: 0.14, gain: 0.3, type: 'triangle' }],
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
};

const MUTE_KEY = 'battle.muted.v1';

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) !== '0';
  } catch {
    return true;
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
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = readMuted();
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getMuted = () => this.muted;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    for (const listener of this.listeners) listener();
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.01);
    }
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // A remembered preference is a convenience, not a requirement.
    }
  }

  /** Safe to call on every gesture; only the first one does any work. */
  unlock(): Promise<void> | void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running')
      return this.ctx.resume().catch(() => {
        /* Audio remains optional if the browser blocks playback. */
      });
  }

  play(cue: Cue): void {
    if (this.muted) return;
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
    if (this.muted || !ctx || !master || ctx.state !== 'running') return;

    const start = ctx.currentTime;
    for (const note of CUES[cue]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type ?? 'sine';
      osc.frequency.setValueAtTime(note.freq, start + note.at);
      if (note.to !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(note.to, start + note.at + note.duration);
      }

      // A fast attack and an exponential tail: anything slower reads as a hum
      // under a live camera rather than as a cue.
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.duration);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.connect(gain);
      gain.connect(master);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.duration + 0.02);
    }
  }
}

export const sound = new SoundBoard();
