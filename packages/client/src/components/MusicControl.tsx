import { useSyncExternalStore } from 'react';
import { Music2 } from 'lucide-react';
import { music } from '../media/music.js';
import { tr, useUiPreferences } from '../i18n/index.js';

export function MusicControl({ expanded = false }: { expanded?: boolean }) {
  useUiPreferences();
  const { enabled, volume, unavailable, playback } = useSyncExternalStore(music.subscribe, music.getSnapshot);
  const playing = enabled && playback === 'running';
  const label = tr(playing ? 'Turn music off' : 'Turn music on');
  return (
    <div className={`music-control ${expanded ? 'music-control--expanded' : ''}`}>
      <button className={expanded ? 'btn' : 'icon-button'} title={label} aria-label={label}
        aria-pressed={playing} onClick={() => music.setEnabled(!playing)}>
        <Music2 size={18} />
        {expanded && <span>{label}</span>}
      </button>
      {expanded && <label className="music-volume">
        <span>{tr('Music volume')}</span>
        <input type="range" min="0" max="100" step="1" value={Math.round(volume * 100)}
          onChange={(event) => music.setVolume(Number(event.target.value) / 100)} />
        <output>{Math.round(volume * 100)}%</output>
      </label>}
      {unavailable && <span className="music-error" role="status">{tr('Music couldn’t start. Tap to retry.')}</span>}
    </div>
  );
}
