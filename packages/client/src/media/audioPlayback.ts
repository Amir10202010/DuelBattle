export type PlaybackState = 'idle' | 'starting' | 'running' | 'blocked' | 'unavailable';

/** Feature-detected media playback routing; older browsers keep their default. */
export function preparePlayback() {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== 'playback') session.type = 'playback';
  } catch { /* The host may control the audio session. */ }
}

/** Invoke resume synchronously inside the gesture, and bound browsers that
 * leave its promise pending instead of rejecting a blocked start. */
export function resumeAudio(ctx: AudioContext): Promise<boolean> {
  preparePlayback();
  if (ctx.state === 'running') return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (running: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(running);
    };
    const timer = setTimeout(() => finish(ctx.state === 'running'), 1600);
    try {
      void ctx.resume().then(() => finish(ctx.state === 'running'), () => finish(false));
    } catch { finish(false); }
  });
}

export const AUDIO_GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

export function isAudioControl(event: Event) {
  return event.target instanceof Element && Boolean(event.target.closest(
    '.audio-enable, .audio-controls, .music-control, [data-audio-action]',
  ));
}
