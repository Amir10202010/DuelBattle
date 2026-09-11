export type Cue =
  | 'tick3'
  | 'tick2'
  | 'tick1'
  | 'go'
  | 'lockIn'
  | 'opponentLocked'
  | 'roundWin'
  | 'roundLoss'
  | 'roundDraw'
  | 'matchWin'
  | 'matchLoss'
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
  roundWin: [
    { freq: 523, at: 0, duration: 0.1, gain: 0.2 },
    { freq: 659, at: 0.08, duration: 0.1, gain: 0.2 },
    { freq: 784, at: 0.16, duration: 0.22, gain: 0.22 },
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
    { freq: 523, at: 0, duration: 0.12, gain: 0.2 },
    { freq: 659, at: 0.1, duration: 0.12, gain: 0.2 },
    { freq: 784, at: 0.2, duration: 0.12, gain: 0.2 },
    { freq: 1047, at: 0.3, duration: 0.4, gain: 0.24 },
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
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = readMuted();

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
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
  unlock(): void {
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
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(cue: Cue): void {
    if (this.muted) return;
    this.unlock();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;

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

      osc.connect(gain);
      gain.connect(master);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.duration + 0.02);
    }
  }
}

export const sound = new SoundBoard();
