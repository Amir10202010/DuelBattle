import { useEffect } from 'react';
import { tr, useUiPreferences } from '../i18n/index.js';
import type { CameraState, CameraStatus } from '../media/useCamera.js';
import { track } from '../analytics.js';

/**
 * The headline per state, because "Turn on your camera" above "Another app is
 * holding the camera" reads as though nobody tried. By the time that sentence
 * is on screen the player has pressed the button and watched it fail; the page
 * should say what happened, not repeat the invitation.
 */
const TITLES: Record<Exclude<CameraStatus, 'ready'>, string> = {
  idle: 'Turn on your camera',
  requesting: 'Turn on your camera',
  denied: 'The camera is blocked',
  insecure: 'The camera is blocked',
  'not-found': 'No camera to use',
  'in-use': 'The camera is busy',
  error: 'The camera would not start',
};

interface CameraGateProps {
  camera: CameraState;
  roomCode: string;
  onLeave: () => void;
}

/**
 * Everything between "I opened the link" and "my camera is live".
 *
 * The ask is explained before the browser prompt appears, because a permission
 * dialog with no context is the single easiest place to lose a player.
 */
export function CameraGate({ camera, roomCode, onLeave }: CameraGateProps) {
  useUiPreferences();
  const { status, request } = camera;
  /*
   * A player who has already allowed the camera is not asked twice.
   *
   * The explanation and the button exist for the first time, when the browser
   * prompt is coming and needs context. Once the permission is granted there
   * is nothing to explain, and making somebody press "enable" before every
   * match is a tap between them and the round for no reason at all.
   */
  useEffect(() => {
    if (status !== 'idle' || !navigator.permissions?.query) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((result) => {
        if (!cancelled && result.state === 'granted') request();
      })
      .catch(() => {
        /* Browsers that cannot answer this simply keep the button. */
      });
    return () => {
      cancelled = true;
    };
  }, [status, request]);
  useEffect(() => {
    if (status === 'denied' || status === 'not-found' || status === 'in-use' || status === 'insecure')
      track('camera_blocked', { reason: status });
  }, [status]);
  const busy = camera.status === 'requesting';
  // Anything that is not "about to ask" is something that already failed.
  const failed = camera.status !== 'idle' && camera.status !== 'requesting';

  return (
    <main className="gate">
      <div className="gate__panel">
        <p className="eyebrow">
          {tr('Room ')}
          {tr(roomCode)}
        </p>
        <h1 className="display gate__title">
          {tr(camera.status === 'ready' ? 'Turn on your camera' : TITLES[camera.status])}
        </h1>
        <p className="gate__body dim">{tr(camera.message)}</p>

        <ul className="gate__facts">
          <li>{tr('Your opponent sees a small live view of your camera. Nobody else does.')}</li>
          <li>{tr('Snapshots are kept for the round being scored, then dropped.')}</li>
          <li>{tr('No microphone, no recording, no upload that outlives the match.')}</li>
        </ul>

        <div className="gate__actions">
          <button className="btn btn--primary btn--lg" onClick={camera.request} disabled={busy}>
            {tr(busy ? 'Waiting for permission…' : failed ? 'Try again' : 'Enable camera')}
          </button>
          <button className="btn btn--ghost" onClick={onLeave}>
            {tr('Leave room')}
          </button>
        </div>

        {camera.devices.length > 1 && (
          <label className="gate__devices">
            <span className="eyebrow">{tr('Camera')}</span>
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
        )}
      </div>
    </main>
  );
}
