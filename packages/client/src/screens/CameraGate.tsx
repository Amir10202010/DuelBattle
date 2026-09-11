import type { CameraState, CameraStatus } from '../media/useCamera.js';

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
  const busy = camera.status === 'requesting';
  // Anything that is not "about to ask" is something that already failed.
  const failed = camera.status !== 'idle' && camera.status !== 'requesting';

  return (
    <main className="gate">
      <div className="gate__panel">
        <p className="eyebrow">Room {roomCode}</p>
        <h1 className="display gate__title">
          {camera.status === 'ready' ? 'Turn on your camera' : TITLES[camera.status]}
        </h1>
        <p className="gate__body dim">{camera.message}</p>

        <ul className="gate__facts">
          <li>Your opponent sees a small live view of your camera. Nobody else does.</li>
          <li>Snapshots are kept for the round being scored, then dropped.</li>
          <li>No microphone, no recording, no upload that outlives the match.</li>
        </ul>

        <div className="gate__actions">
          <button className="btn btn--primary btn--lg" onClick={camera.request} disabled={busy}>
            {busy ? 'Waiting for permission…' : failed ? 'Try again' : 'Enable camera'}
          </button>
          <button className="btn btn--ghost" onClick={onLeave}>
            Leave room
          </button>
        </div>

        {camera.devices.length > 1 && (
          <label className="gate__devices">
            <span className="eyebrow">Camera</span>
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
