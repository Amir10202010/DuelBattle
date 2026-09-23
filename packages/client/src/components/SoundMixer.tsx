import { audioMix, useAudioMix } from '../media/audioMix.js';
import { tr, useUiPreferences } from '../i18n/index.js';

export function SoundMixer() {
  useUiPreferences();
  const mix = useAudioMix();
  return <div className="sound-mixer" data-audio-action>
    {(['master', 'sfx'] as const).map((channel) => <label className="music-volume" key={channel}>
      <span>{tr(channel === 'master' ? 'Master volume' : 'Sound effects volume')}</span>
      <input type="range" min="0" max="100" step="1" value={Math.round(mix[channel] * 100)}
        onChange={(event) => audioMix.set({ [channel]: Number(event.target.value) / 100 })} />
      <output>{Math.round(mix[channel] * 100)}%</output>
    </label>)}
  </div>;
}
