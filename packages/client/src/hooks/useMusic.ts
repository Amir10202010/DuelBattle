import { useEffect } from 'react';
import type { PublicMatchState } from '@battle/shared';
import { music } from '../media/music.js';
import type { MatchStore } from '../net/store.js';

export function useMusic(match: PublicMatchState | null, store: Pick<MatchStore, 'serverNow'>) {
  useEffect(() => {
    const visibility = () => { if (document.hidden) music.pause(); else music.restore(); };
    // A saved preference still waits for a gesture on a fresh page.
    document.addEventListener('pointerdown', music.unlock);
    document.addEventListener('keydown', music.unlock);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      document.removeEventListener('pointerdown', music.unlock);
      document.removeEventListener('keydown', music.unlock);
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
