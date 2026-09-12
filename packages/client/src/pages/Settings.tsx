import { useEffect, useState } from 'react';
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
import { Avatar } from '../components/Identity.jsx';

/**
 * The things that follow a player around.
 *
 * There is no account to manage here, and that is the point: the server issues
 * this browser a signed token and stores a name, a mark and a handful of
 * counters against it. So this page holds exactly what that is — who you are on
 * a scoreboard, which camera you use, and whether the game makes noise.
 *
 * The camera picker lives here rather than only inside a room, because the one
 * moment you cannot calmly work out which of three webcams is the right one is
 * the moment an opponent is waiting for you to be ready.
 */
export function Settings({
  store,
  profile,
  camera,
}: {
  store: MatchStore;
  profile: PublicProfile | null;
  camera: CameraState;
}) {
  const [name, setName] = useState(profile?.name ?? '');
  const [saved, setSaved] = useState(false);
  const [muted, setMuted] = useState(() => sound.isMuted);

  useEffect(() => {
    if (profile?.name) setName((current) => current || profile.name);
  }, [profile?.name]);

  const avatar = normalizeAvatar(profile?.avatar);

  const saveName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    store.saveProfile({ name: trimmed });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1_800);
  };

  return (
    <main className="page page--settings">
      <header className="page__head">
        <p className="eyebrow">Settings</p>
        <h1 className="page__title display">Who you are, and how it sounds.</h1>
        <p className="page__lede">
          There is no account and no password. This browser holds a signed token; everything below
          is stored against it, and it is the whole of what the game knows about you.
        </p>
      </header>

      <section className="setting">
        <h2 className="setting__title">Name</h2>
        <p className="setting__note dim">Shown to your opponent and on the leaderboard.</p>
        <div className="setting__row">
          <input
            className="input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="nickname"
            aria-label="Your name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
          />
          <button className="btn" onClick={saveName} disabled={!name.trim()}>
            {saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </section>

      <section className="setting">
        <h2 className="setting__title">Your mark</h2>
        <p className="setting__note dim">
          A shape and a colour. No uploads — an account-less game that accepts image files is a
          moderation problem rather than a game.
        </p>
        <div className="marks">
          <div className="marks__preview">
            <Avatar avatar={avatar} size={72} name={name} />
          </div>
          <div className="marks__pickers">
            <div className="marks__row" role="group" aria-label="Shape">
              {AVATAR_SHAPES.map((_, shape) => (
                <button
                  key={shape}
                  type="button"
                  className={`marks__option ${avatar.shape === shape ? 'is-active' : ''}`}
                  aria-pressed={avatar.shape === shape}
                  aria-label={`Shape ${shape + 1}`}
                  onClick={() => store.saveProfile({ avatar: { ...avatar, shape } })}
                >
                  <Avatar avatar={{ ...avatar, shape }} size={30} />
                </button>
              ))}
            </div>
            <div className="marks__row" role="group" aria-label="Colour">
              {AVATAR_COLORS.map((hex, color) => (
                <button
                  key={hex}
                  type="button"
                  className={`marks__swatch ${avatar.color === color ? 'is-active' : ''}`}
                  style={{ background: hex }}
                  aria-pressed={avatar.color === color}
                  aria-label={`Colour ${color + 1}`}
                  onClick={() => store.saveProfile({ avatar: { ...avatar, color } })}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="setting">
        <h2 className="setting__title">Camera</h2>
        <p className="setting__note dim">
          Nothing is recorded. Frames go to your opponent while a match is running and are dropped
          the moment it ends.
        </p>
        {camera.devices.length > 1 ? (
          <select
            className="input"
            aria-label="Camera"
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
            {camera.status === 'ready'
              ? 'One camera, and it is working.'
              : 'The camera is asked for when a match starts, not before.'}
          </p>
        )}
      </section>

      <section className="setting">
        <h2 className="setting__title">Sound</h2>
        <p className="setting__note dim">Countdowns, locks and round results. No microphone, ever.</p>
        <button
          className="btn"
          aria-pressed={!muted}
          onClick={() => {
            sound.setMuted(!muted);
            setMuted(!muted);
            // Clicking is a gesture, which is the browser's price for any audio.
            if (muted) sound.play('tick1');
          }}
        >
          {muted ? 'Turn sound on' : 'Turn sound off'}
        </button>
      </section>
    </main>
  );
}
