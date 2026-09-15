type Arrangement = 'menu' | 'battle';
type MusicSettings = { enabled: boolean; volume: number; unavailable: boolean };
const KEY = 'battle.music.v1';
const STEP = 60 / 108 / 4;

// Original sixteen-bar score, “Room for Two”. Fmaj7 / Am7 / Dm7 / Bbmaj7.
// Both arrangements share a clock and harmony, so a round never restarts the song.
const CHORDS = [
  [53, 57, 60, 64], [57, 60, 64, 67], [50, 57, 60, 65], [46, 53, 57, 62],
  [53, 57, 60, 64], [48, 55, 60, 64], [46, 53, 57, 62], [48, 55, 59, 62],
] as const;
const MELODY = [
  [72, 0, 76, 0, 79, 0, 0, 76, 74, 0, 72, 0, 0, 0, 69, 0],
  [0, 0, 72, 0, 76, 0, 79, 0, 0, 76, 0, 72, 71, 0, 0, 0],
  [69, 0, 0, 72, 77, 0, 76, 0, 74, 0, 0, 72, 69, 0, 0, 0],
  [70, 0, 74, 0, 77, 0, 0, 74, 72, 0, 0, 69, 67, 0, 0, 0],
] as const;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export class MusicPlayer {
  private settings: MusicSettings = { enabled: false, volume: 0.28, unavailable: false };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private nextTime = 0;
  private step = 0;
  private wanted: Arrangement = 'menu';
  private arrangement: Arrangement = 'menu';
  private ducked = false;

  constructor() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved && typeof saved === 'object' && 'enabled' in saved && 'volume' in saved) {
        this.settings.enabled = saved.enabled === true;
        if (typeof saved.volume === 'number' && Number.isFinite(saved.volume))
          this.settings.volume = Math.max(0, Math.min(1, saved.volume));
      }
    } catch { /* Storage can be disabled. Audio still works for this visit. */ }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = () => this.settings;

  private update(patch: Partial<MusicSettings>) {
    this.settings = { ...this.settings, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(this.settings)); } catch { /* Optional. */ }
    this.listeners.forEach((listener) => listener());
  }

  setEnabled(enabled: boolean) {
    this.update({ enabled, unavailable: false });
    if (enabled) this.unlock();
    else this.pause();
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.update({ volume: Math.max(0, Math.min(1, volume)) });
    this.mix();
  }

  setScene(arrangement: Arrangement, ducked = false) {
    this.wanted = arrangement;
    this.ducked = ducked;
    this.mix();
  }

  private mix() {
    if (!this.ctx || !this.master) return;
    const level = this.settings.enabled ? this.settings.volume * (this.ducked ? 0.2 : 0.65) : 0;
    this.master.gain.setTargetAtTime(level, this.ctx.currentTime, 0.15);
  }

  // Called only by a user gesture, or to restore an already-playing visible tab.
  unlock = () => {
    if (!this.settings.enabled || document.hidden) return;
    if (this.sleepTimer !== null) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    try {
      if (!this.ctx) {
        const Audio = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Audio) throw new Error('Audio unavailable');
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate / 5, this.ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      const ctx = this.ctx;
      void ctx.resume().then(() => {
        if (!this.settings.enabled || document.hidden || ctx.state !== 'running') return;
        this.mix();
        if (this.timer !== null) return;
        this.arrangement = this.wanted;
        this.nextTime = ctx.currentTime + 0.06;
        this.schedule();
        this.timer = setInterval(() => this.schedule(), 50);
      }).catch(() => this.failed());
    } catch { this.failed(); }
  };

  private failed() {
    this.update({ enabled: false, unavailable: true });
    this.pause();
  }

  restore = () => { if (this.ctx) this.unlock(); };

  pause = () => {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.ctx;
    if (!ctx) return;
    this.master?.gain.setTargetAtTime(0, ctx.currentTime, 0.012);
    for (const voice of this.voices) voice.stop(ctx.currentTime + 0.05);
    if (this.sleepTimer !== null) clearTimeout(this.sleepTimer);
    this.sleepTimer = setTimeout(() => {
      this.sleepTimer = null;
      if (this.timer === null) void ctx.suspend().catch(() => {});
    }, 70);
  };

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    // Never replay a burst of missed notes after a stalled/backgrounded tab.
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.03;
    while (this.nextTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 256;
      this.nextTime += STEP;
    }
  }

  private envelope(source: AudioScheduledSourceNode, at: number, duration: number, level: number, filter?: AudioNode) {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    if (filter) { source.connect(filter); filter.connect(gain); }
    else source.connect(gain);
    gain.connect(this.master!);
    this.voices.add(source);
    source.onended = () => {
      source.disconnect(); filter?.disconnect(); gain.disconnect(); this.voices.delete(source);
    };
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  private note(midi: number, at: number, duration: number, level: number, type: OscillatorType = 'sine') {
    const voice = this.ctx!.createOscillator();
    voice.type = type;
    voice.frequency.setValueAtTime(frequency(midi), at);
    this.envelope(voice, at, duration, level);
  }

  private percussion(at: number, snare: boolean) {
    const ctx = this.ctx!;
    const voice = ctx.createBufferSource();
    voice.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = snare ? 1600 : 6800;
    this.envelope(voice, at, snare ? 0.13 : 0.045, snare ? 0.075 : 0.026, filter);
  }

  private playStep(step: number, at: number) {
    const bar = Math.floor(step / 16);
    const beat = step % 16;
    if (beat === 0) this.arrangement = this.wanted;
    const battle = this.arrangement === 'battle';
    const chord = CHORDS[bar % CHORDS.length]!;
    const swung = at + (beat % 2 ? STEP * 0.09 : 0);
    if (beat === 0) {
      for (const midi of chord) this.note(midi + 12, at, STEP * 13, 0.032, 'sine');
    }
    if (beat % 8 === 0 || (battle && (beat === 6 || beat === 14)))
      this.note(chord[0] - 12, at, STEP * 2.8, 0.19, 'triangle');
    // Leave breathing space in the second phrase; battle adds a quiet counterline.
    const phraseNote = MELODY[bar % 4]![beat]!;
    const melody = bar % 8 === 7 && phraseNote === 70 ? 71 : phraseNote;
    if (melody && (bar < 12 || beat < 8)) {
      this.note(melody, swung, STEP * 2.9, 0.1, 'triangle');
      this.note(melody + 12, swung, STEP * 0.8, 0.022);
    }
    if (battle && beat % 4 === 2) this.note(chord[(beat >> 2) % 4]! + 12, swung, STEP * 1.5, 0.055);
    if (beat % 8 === 0 || (battle && beat === 10)) {
      const kick = this.ctx!.createOscillator();
      kick.frequency.setValueAtTime(130, at);
      kick.frequency.exponentialRampToValueAtTime(43, at + 0.1);
      this.envelope(kick, at, 0.18, 0.25);
    }
    if (beat === 4 || beat === 12) this.percussion(at, true);
    if (beat % (battle ? 2 : 4) === 2 || (battle && beat === 15)) this.percussion(swung, false);
  }
}

export const music = new MusicPlayer();
