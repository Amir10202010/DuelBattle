import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sound } from '../media/sound.js';
import { music } from '../media/music.js';
import { tr, useUiPreferences } from '../i18n/index.js';

export function AudioControls() {
  useUiPreferences();
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted);
  const { enabled } = useSyncExternalStore(music.subscribe, music.getSnapshot);
  const off = muted && !enabled;
  const label = tr(off ? 'Enable audio' : 'Mute all audio');
  return (
    <div className="audio-controls">
      <button
        className="icon-button"
        title={label}
        aria-label={label}
        aria-pressed={!off}
        onClick={() => {
          const enable = off;
          sound.setMuted(!enable);
          music.setEnabled(enable);
          if (enable) sound.play('equip');
        }}
      >
        {off ? <VolumeX size={19} /> : <Volume2 size={19} />}
      </button>
    </div>
  );
}
