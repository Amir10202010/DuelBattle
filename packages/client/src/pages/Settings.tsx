import {
  getPreferences,
  setPreferences,
  type ThemePreference,
  type LocalePreference,
} from '../i18n/preferences.js';
import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ArrowRight,
  Camera,
  Check,
  LogOut,
  Palette,
  ShieldCheck,
  Shirt,
  UserRound,
  Volume2,
} from 'lucide-react';
import { MAX_NAME_LENGTH, type PublicProfile } from '@battle/shared';
import type { MatchStore } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import { sound } from '../media/sound.js';
import { MusicControl } from '../components/MusicControl.jsx';
import { SoundMixer } from '../components/SoundMixer.jsx';
import { TelegramLink } from '../components/TelegramLink.jsx';

/**
 * Settings, grouped the way a player thinks about them: who I am, how it
 * looks, how it sounds, what it can see, and the account itself. Nothing here
 * changes the game — anything that would belongs in the room, not in a menu.
 */
export function Settings({
  store,
  profile,
  camera,
  onLogout,
  onNavigate,
  telegram = false,
}: {
  store: MatchStore;
  profile: PublicProfile | null;
  camera: CameraState;
  onLogout: () => Promise<void>;
  onNavigate: (path: string) => void;
  telegram?: boolean;
}) {
  useUiPreferences();
  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);
  const muted = useSyncExternalStore(sound.subscribe, sound.getMuted);
  const playback = useSyncExternalStore(sound.subscribe, sound.getPlayback);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.name) setName((current) => current || profile.name);
  }, [profile?.name]);

  const saved = Boolean(profile?.name && profile.name === name.trim());
  // The save goes over the socket and is confirmed by the profile coming back.
  // If it never does, the button has to stop saying "saving" and let them retry.
  useEffect(() => {
    if (saved) {
      setSaving(false);
      return;
    }
    if (!saving) return;
    const timer = window.setTimeout(() => setSaving(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [saved, saving]);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === profile?.name) return;
    setSaving(true);
    store.saveProfile({ name: trimmed });
  };

  return (
    <main className="page page--narrow settings">
      <header className="page__head">
        <span className="eyebrow">{tr('Settings')}</span>
        <h1 className="page__title display">{tr('Make yourself at home.')}</h1>
        <p className="page__lede">
          {tr('Your player, your camera and your sound. A few small choices for a better battle.')}
        </p>
      </header>

      {profile ? (
        <section className="panel setting">
          <div className="panel__head">
            <h2>
              <UserRound size={17} />
              {tr('Your player')}
            </h2>
          </div>
          <div className="field">
            <label htmlFor="setting-name">{tr('Name')}</label>
            <div className="setting__row">
              <input
                id="setting-name"
                className="input"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoComplete="nickname"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
              <button className="btn" onClick={saveName} disabled={!name.trim() || saved}>
                {saved ? (
                  <>
                    <Check size={16} />
                    {tr('Saved')}
                  </>
                ) : (
                  tr(saving ? 'Saving…' : 'Save')
                )}
              </button>
            </div>
            <small>{tr('Shown to your opponent and on the ladder.')}</small>
          </div>

          <button className="btn btn--block" onClick={() => onNavigate('/profile')}>
            <Shirt size={16} />
            {tr('Change how you look')}
            <ArrowRight size={15} />
          </button>
        </section>
      ) : (
        <section className="panel setting">
          <div className="panel__head">
            <h2>
              <UserRound size={17} />
              {tr('Save your player')}
            </h2>
          </div>
          <p className="dim">{tr('Sign in to keep a name, a hero and a place on the ladder.')}</p>
          <button className="btn btn--primary" onClick={() => onNavigate('/login')}>
            {tr('Sign in')}
          </button>
        </section>
      )}

      <section className="panel setting">
        <div className="panel__head">
          <h2>
            <Palette size={17} />
            {tr('Appearance & language')}
          </h2>
        </div>
        <div className="setting__grid">
          <label className="field">
            <span>{tr('Theme')}</span>
            <select
              className="input"
              value={getPreferences().theme}
              onChange={(e) => setPreferences({ theme: e.target.value as ThemePreference })}
            >
              <option value="system">{tr('Follow device')}</option>
              <option value="light">{tr('Daylight')}</option>
              <option value="dark">{tr('Arena dark')}</option>
            </select>
            <small>{tr('Automatic follows your device’s light or dark setting.')}</small>
          </label>
          <label className="field">
            <span>{tr('Language')}</span>
            <select
              className="input"
              value={getPreferences().language}
              onChange={(e) => setPreferences({ language: e.target.value as LocalePreference })}
            >
              <option value="system">{tr('Follow browser')}</option>
              <option value="ru">{'Русский'}</option>
              <option value="en">{'English'}</option>
            </select>
            <small>{tr('Saved on this device.')}</small>
          </label>
        </div>
      </section>

      <section className="panel setting">
        <div className="panel__head">
          <h2>
            <Volume2 size={17} />
            {tr('Sound')}
          </h2>
        </div>
        <p className="dim">{tr('Countdowns, locks and round results. No microphone, ever.')}</p>
        <SoundMixer />
        <div className="setting__row setting__row--wrap">
          <button
            className={muted ? 'btn' : 'btn btn--primary'}
            aria-pressed={!muted}
            data-audio-action
            onClick={() => {
              sound.setMuted(!muted);
              // Clicking is a gesture, which is the browser's price for audio.
              if (muted) sound.play('roundWin');
            }}
          >
            {tr(muted ? 'Turn sound on' : 'Sound is on')}
          </button>
          <button
            className="btn btn--ghost"
            data-audio-action
            onClick={() => {
              sound.setMuted(false);
              sound.play('roundWin');
            }}
          >
            {tr('Play a test sound')}
          </button>
        </div>
        <p className="dim" role="status">
          {tr(
            muted
              ? 'Sound effects are off.'
              : playback === 'running'
                ? 'Audio is running. If it is quiet, check the tab and device volume.'
                : playback === 'starting'
                  ? 'Starting audio…'
                  : 'Audio has not started. Tap the test sound to try again.',
          )}
        </p>
        <div className="setting__divider" />
        <MusicControl expanded />
      </section>

      <section className="panel setting">
        <div className="panel__head">
          <h2>
            <Camera size={17} />
            {tr('Camera')}
          </h2>
        </div>
        {camera.devices.length > 1 ? (
          <label className="field">
            <span>{tr('Which camera')}</span>
            <select
              className="input"
              value={camera.deviceId ?? ''}
              onChange={(e) => camera.selectDevice(e.target.value)}
            >
              {camera.devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="dim">
            {tr(
              camera.status === 'ready'
                ? 'One camera, and it is working.'
                : 'The camera is asked for when a battle starts, not before.',
            )}
          </p>
        )}
        <p className="setting__fine">
          <ShieldCheck size={14} />
          {tr(
            'Frames go to your opponent. AI rounds also send snapshots to the configured referee. The server keeps no photo archive, and your browser holds the recap only until you leave.',
          )}
        </p>
      </section>

      {profile && !telegram && <TelegramLink />}

      {profile && !telegram && (
        <section className="panel setting">
          <div className="panel__head">
            <h2>
              <LogOut size={17} />
              {tr('Account')}
            </h2>
          </div>
          <p className="dim">
            {tr('Use your player ID and password on another device. Keep your recovery key safe.')}
          </p>
          <button
            className="btn btn--danger"
            onClick={() => {
              void onLogout().catch(() =>
                setError('Could not sign out. Check your connection and try again.'),
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
    </main>
  );
}
