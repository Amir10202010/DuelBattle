import { useSyncExternalStore } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { sound } from '../media/sound.js';
import { music } from '../media/music.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { MusicControl } from './MusicControl.jsx';

export function AudioControls() {
  useUiPreferences();
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted);
  const { enabled } = useSyncExternalStore(music.subscribe, music.getSnapshot);
  if (muted && !enabled) return (
    <button className="btn audio-enable" onClick={() => {
      sound.setMuted(false);
      sound.play('roundWin');
      music.setEnabled(true);
    }}>
      <Volume2 size={17} />{tr('Enable audio')}
    </button>
  );
  return <div className="audio-controls">
    <button className="icon-button" aria-pressed={!muted}
      title={tr(muted ? 'Enable effects' : 'Mute effects')}
      aria-label={tr(muted ? 'Enable effects' : 'Mute effects')}
      onClick={() => { sound.setMuted(!muted); if (muted) sound.play('lockIn'); }}>
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
    <MusicControl />
  </div>;
}
