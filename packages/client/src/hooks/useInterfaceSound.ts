import { useEffect } from 'react';
import { sound } from '../media/sound.js';
import { AUDIO_GESTURES, isAudioControl } from '../media/audioPlayback.js';

/** Shared web/Mini App gesture unlock and UI cues. */
export function useInterfaceSound(active: boolean) {
  useEffect(() => { sound.setActive(active); return () => sound.setActive(false); }, [active]);
  useEffect(() => {
    const unlock = (event: Event) => {
      if (!isAudioControl(event) && !sound.isMuted) sound.unlock();
    };
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('button:not(:disabled), a[href], summary')) return;
      if (isAudioControl(event) || target.closest('.lockin')) return;
      sound.play('button');
    };
    for (const event of AUDIO_GESTURES) document.addEventListener(event, unlock, true);
    document.addEventListener('click', click);
    return () => {
      for (const event of AUDIO_GESTURES) document.removeEventListener(event, unlock, true);
      document.removeEventListener('click', click);
    };
  }, []);
}
