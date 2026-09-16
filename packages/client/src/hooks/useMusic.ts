import { useEffect } from 'react';
import type { PublicMatchState } from '@battle/shared';
import { music } from '../media/music.js';
import { AUDIO_GESTURES, isAudioControl } from '../media/audioPlayback.js';
import type { MatchStore } from '../net/store.js';

export function useMusic(match: PublicMatchState | null, store: Pick<MatchStore, 'serverNow'>, active: boolean) {
  useEffect(() => { music.setActive(active); return () => music.setActive(false); }, [active]);
  useEffect(() => {
    const visibility = () => { if (document.hidden) music.pause(); else music.restore(); };
    const unlock = (event: Event) => { if (!isAudioControl(event)) music.unlock(); };
    // Retry blocked autoplay on the first completed gesture inside the game.
    for (const event of AUDIO_GESTURES) document.addEventListener(event, unlock, true);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      for (const event of AUDIO_GESTURES) document.removeEventListener(event, unlock, true);
      document.removeEventListener('visibilitychange', visibility);
      music.pause();
    };
  }, []);

  const phase = match?.phase;
  const deadline = match?.phaseEndsAt;
  const paused = Boolean(match?.paused);
  useEffect(() => {
    const update = () => {
      const battling = phase === 'challenge' || phase === 'countdown';
      const quiet = paused || phase === 'countdown' || phase === 'judging' ||
        phase === 'roundResult' || phase === 'matchResult' ||
        (phase === 'challenge' && deadline != null && deadline - store.serverNow() <= 5000);
      music.setScene(battling ? 'battle' : 'menu', quiet);
    };
    update();
    if (phase !== 'challenge') return;
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, [phase, deadline, paused, store]);
}
