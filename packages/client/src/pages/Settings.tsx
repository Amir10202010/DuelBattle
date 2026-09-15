import {
  getPreferences,
  setPreferences,
  type ThemePreference,
  type LocalePreference,
} from '../i18n/preferences.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_SHAPES,
  MAX_NAME_LENGTH,
  normalizeAvatar,
  type PublicProfile,
} from '@battle/shared';
import type { MatchStore } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import { sound } from '../media/sound.js';
import { MusicControl } from '../components/MusicControl.jsx';
import { Avatar } from '../components/Identity.jsx';

/** Account appearance, device preferences and optional game audio. */
export function Settings({
  store,
  profile,
  camera,
  onLogout,
  onNavigate,
}: {
  store: MatchStore;
  profile: PublicProfile | null;
  camera: CameraState;
  onLogout: () => Promise<void>;
  onNavigate: (path: string) => void;
}) {
  useUiPreferences();
  const [name, setName] = useState(profile?.name ?? '');
  const [saved, setSaved] = useState(false);
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted);
  const playback = useSyncExternalStore(sound.subscribe, sound.getPlayback);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.name) setName((current) => current || profile.name);
  }, [profile?.name]);

  const avatar = normalizeAvatar(profile?.avatar);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    store.saveProfile({ name: trimmed });
  };
  useEffect(() => {
    setSaved(Boolean(profile?.name && profile.name === name.trim()));
  }, [profile?.name, name]);

  return (
    <main className="page page--settings">
      <header className="page__head">
        <p className="eyebrow">{tr('Settings')}</p>
        <h1 className="page__title display">{tr('Make yourself at home.')}</h1>
        <p className="page__lede">
          {tr('Your player identity, camera and sound. A few small choices for a better battle.')}
        </p>
      </header>

      <section className="setting">
        <h2>{tr('Appearance & language')}</h2>
        <div className="preferences-grid">
          <label className="preference-control">
            <span>{tr('Theme')}</span>
            <select
              className="input"
              value={getPreferences().theme}
              onChange={(e) => setPreferences({ theme: e.target.value as ThemePreference })}
            >
              <option value="system">{tr('Follow device')}</option>
              <option value="light">{tr('Light neon')}</option>
              <option value="dark">{tr('Dark')}</option>
            </select>
            <small>{tr('Automatic mode follows your device’s light or dark setting.')}</small>
          </label>
          <label className="preference-control">
            <span>{tr('Language')}</span>
            <select
              className="input"
              value={getPreferences().language}
              onChange={(e) => setPreferences({ language: e.target.value as LocalePreference })}
            >
              <option value="system">{tr('Follow browser')}</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
            <small>{tr('Your choice is saved on this device.')}</small>
          </label>
        </div>
      </section>

      {!profile && (
        <section className="setting">
          <h2>{tr('Save your player identity')}</h2>
          <p className="setting__note dim">
            {tr('Sign in to choose a permanent name and avatar.')}
          </p>
          <button className="btn btn--primary" onClick={() => onNavigate('/login')}>
            {tr('Sign in')}
          </button>
        </section>
      )}
      {profile && (
        <>
          <section className="setting">
            <h2 className="setting__title">{tr('Name')}</h2>
            <p className="setting__note dim">
              {tr('Shown to your opponent and on the leaderboard.')}
            </p>
            <div className="setting__row">
              <input
                className="input"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                aria-label={tr('Your name')}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
              <button className="btn" onClick={saveName} disabled={!name.trim()}>
                {tr(saved ? 'Saved' : 'Save')}
              </button>
            </div>
          </section>

          <section className="setting">
            <h2 className="setting__title">{tr('Your mark')}</h2>
            <p className="setting__note dim">
              {tr('Pick a shape and a colour. Make your mark on the ladder.')}
            </p>
            <div className="marks">
              <div className="marks__preview">
                <Avatar avatar={avatar} size={72} name={name} />
              </div>
              <div className="marks__pickers">
                <div className="marks__row" role="group" aria-label={tr('Shape')}>
                  {AVATAR_SHAPES.map((_, shape) => (
                    <button
                      key={shape}
                      type="button"
                      className={`marks__option ${avatar.shape === shape ? 'is-active' : ''}`}
                      aria-pressed={avatar.shape === shape}
                      aria-label={tr(`Shape ${shape + 1}`)}
                      onClick={() => store.saveProfile({ avatar: { ...avatar, shape } })}
                    >
                      <Avatar avatar={{ ...avatar, shape }} size={30} />
                    </button>
                  ))}
                </div>
                <div className="marks__row" role="group" aria-label={tr('Colour')}>
                  {AVATAR_COLORS.map((hex, color) => (
                    <button
                      key={hex}
                      type="button"
                      className={`marks__swatch ${avatar.color === color ? 'is-active' : ''}`}
                      style={{ background: hex }}
                      aria-pressed={avatar.color === color}
                      aria-label={tr(`Colour ${color + 1}`)}
                      onClick={() => store.saveProfile({ avatar: { ...avatar, color } })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}

      <section className="setting">
        <h2 className="setting__title">{tr('Camera')}</h2>
        <p className="setting__note dim">
          {tr(
            'Frames are shared with your opponent. AI rounds also send snapshots to the configured referee provider. The server keeps no photo archive. Your browser holds snapshots for the match recap until you leave.',
          )}
        </p>
        {camera.devices.length > 1 ? (
          <select
            className="input"
            aria-label={tr('Camera')}
            value={camera.deviceId ?? ''}
            onChange={(e) => camera.selectDevice(e.target.value)}
          >
            {camera.devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))}
          </select>
        ) : (
          <p className="setting__note dim">
            {tr(
              camera.status === 'ready'
                ? 'One camera, and it is working.'
                : 'The camera is asked for when a match starts, not before.',
            )}
          </p>
        )}
      </section>
      {profile && (
        <section className="setting">
          <h2 className="setting__title">{tr('Your account')}</h2>
          <p className="setting__note dim">
            {tr(
              'Use your player ID and password on another device. Keep your recovery key somewhere safe.',
            )}
          </p>
          <button
            className="btn"
            onClick={() => {
              void onLogout().catch(() =>
                setError('Could not sign out. Check your connection and retry.'),
              );
            }}
          >
            {tr('Sign out')}
          </button>
          {error && (
            <p role="alert" className="error-text">
              {tr(error)}
            </p>
          )}
        </section>
      )}

      <section className="setting">
        <h2 className="setting__title">{tr('Sound effects')}</h2>
        <p className="setting__note dim">
          {tr('Countdowns, locks and round results. No microphone, ever.')}
        </p>
        <button
          className="btn"
          aria-pressed={!muted}
          data-audio-action
          onClick={() => {
            sound.setMuted(!muted);

            // Clicking is a gesture, which is the browser's price for any audio.
            if (muted) sound.play('roundWin');
          }}
        >
          {tr(muted ? 'Turn sound on' : 'Turn sound off')}
        </button>
        <button className="btn btn--ghost" data-audio-action onClick={() => {
          sound.setMuted(false);
          sound.play('roundWin');
        }}>{tr('Test sound')}</button>
        <p className="setting__note" role="status">{tr(
          muted ? 'Sound effects are off.' : playback === 'running'
            ? 'Audio started. If it’s quiet, check the tab and device volume.'
            : playback === 'starting' ? 'Starting audio…'
            : 'Audio hasn’t started. Tap Test sound to try again.',
        )}</p>
      </section>
      <section className="setting">
        <h2 className="setting__title">{tr('Music')}</h2>
        <MusicControl expanded />
      </section>
    </main>
  );
}
