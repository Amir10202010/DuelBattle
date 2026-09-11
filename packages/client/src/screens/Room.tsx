import { useEffect, useRef } from 'react';
import type { PublicMatchState } from '@battle/shared';
import type { MatchStore, StoreSnapshot } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import { LIVE_FRAME_QUALITY, createLiveCapture } from '../media/capture.js';
import { Announcer } from '../components/Announcer.jsx';
import { ConnectionBadge, MuteButton, PausedOverlay } from '../components/Hud.jsx';
import { useAnimationClock } from '../hooks/useNow.js';
import { useMatchSound } from '../hooks/useMatchSound.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { CameraGate } from './CameraGate.jsx';
import { Lobby } from './Lobby.jsx';
import { Arena } from './Arena.jsx';
import { MatchOver } from './MatchOver.jsx';

/** Live frames are sent four times a second: enough to feel live, small enough to ignore. */
const FRAME_INTERVAL_MS = 250;

interface RoomProps {
  store: MatchStore;
  snapshot: StoreSnapshot;
  match: PublicMatchState;
  youId: string;
  camera: CameraState;
  onLeave: () => void;
}

export function Room({ store, snapshot, match, youId, camera, onLeave }: RoomProps) {
  const cameraReady = camera.status === 'ready';
  const connected = snapshot.status === 'open';

  // The server needs to know about the camera again after every reconnect, so
  // this deliberately re-runs when the connection comes back.
  useEffect(() => {
    if (!connected) return;
    store.setCameraReady(cameraReady);
  }, [store, cameraReady, connected, youId]);

  useFrameSender(store, camera, cameraReady && connected);
  useMatchSound(match, youId);
  // Held for the whole room, not just a live round: the lobby is where people
  // put the phone down to go and find their opponent.
  useWakeLock(cameraReady);

  const timed =
    match.phase === 'countdown' ||
    match.phase === 'challenge' ||
    match.phase === 'judging' ||
    match.phase === 'roundResult' ||
    match.paused !== null;
  const localNow = useAnimationClock(timed);
  // Every deadline on screen is drawn against the server's clock, not this one.
  const now = localNow + (store.serverNow() - Date.now());

  // Once a match is running, a camera problem is shown on your own stage rather
  // than swapping the whole screen for the permission gate: losing the prompt,
  // the clock and your opponent's view is a worse outcome than the fault itself,
  // and you cannot fix what you cannot see the consequences of.
  const matchRunning = match.phase !== 'lobby' && match.phase !== 'matchResult';
  if (!cameraReady && !matchRunning) {
    return <CameraGate camera={camera} roomCode={match.roomCode} onLeave={onLeave} />;
  }

  const opponentId = match.seats.find((id) => id && id !== youId) ?? null;
  const opponent = opponentId ? match.players[opponentId] ?? null : null;

  return (
    <div className="room">
      <Announcer match={match} youId={youId} />
      <header className="room__bar">
        <span className="room__code mono" title="Room code">
          {match.roomCode}
        </span>
        <span className="room__phase eyebrow">{phaseLabel(match)}</span>
        <div className="room__right">
          <ConnectionBadge status={snapshot.status} latencyMs={snapshot.latencyMs} />
          <MuteButton />
          <button className="btn btn--ghost room__leave" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      {match.phase === 'lobby' && (
        <Lobby store={store} match={match} youId={youId} camera={camera} />
      )}
      {match.phase === 'matchResult' && (
        <MatchOver
          store={store}
          match={match}
          youId={youId}
          evidence={snapshot.evidence}
          onLeave={onLeave}
        />
      )}
      {match.phase !== 'lobby' && match.phase !== 'matchResult' && (
        <Arena
          store={store}
          match={match}
          youId={youId}
          camera={camera}
          evidence={snapshot.evidence}
          now={now}
        />
      )}

      {match.paused && <PausedOverlay paused={match.paused} now={now} opponent={opponent} />}
    </div>
  );
}

function phaseLabel(match: PublicMatchState): string {
  switch (match.phase) {
    case 'lobby':
      return match.history.length > 0 ? 'Next match' : 'Lobby';
    case 'countdown':
      return `Round ${match.roundNumber} starting`;
    case 'challenge':
      return `Round ${match.roundNumber}`;
    case 'judging':
      return 'Judging';
    case 'roundResult':
      return 'Result';
    case 'matchResult':
      return 'Match over';
  }
}

/**
 * Streams the local camera to the server, which relays it to the opponent and
 * keeps the last frame before each prompt as that round's baseline.
 */
function useFrameSender(store: MatchStore, camera: CameraState, active: boolean): void {
  const seqRef = useRef(0);
  const captureRef = useRef(createLiveCapture());

  useEffect(() => {
    if (!active) return;
    const capture = captureRef.current;
    const tick = () => {
      const image = capture.toDataUrl(camera.videoRef.current, LIVE_FRAME_QUALITY);
      if (image) store.sendFrame(image, seqRef.current++);
    };
    tick();
    const timer = window.setInterval(tick, FRAME_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [store, camera.videoRef, active]);
}
