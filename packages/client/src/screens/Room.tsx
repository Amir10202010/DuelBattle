import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useRef } from 'react';
import { opponentOf, type PublicMatchState } from '@battle/shared';
import type { MatchStore, StoreSnapshot } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import {
  LIVE_FRAME_FALLBACK_QUALITY,
  LIVE_FRAME_QUALITY,
  createLiveCapture,
} from '../media/capture.js';
import { MAX_FRAME_BYTES } from '@battle/shared';
import { Announcer } from '../components/Announcer.jsx';
import { ConnectionBadge, PausedOverlay } from '../components/Hud.jsx';
import { AudioControls } from '../components/AudioControls.jsx';
import { useAnimationClock } from '../hooks/useNow.js';
import { useMatchSound } from '../hooks/useMatchSound.js';
import { useWakeLock } from '../hooks/useWakeLock.js';
import { CameraGate } from './CameraGate.jsx';
import { Lobby } from './Lobby.jsx';
import { Arena } from './Arena.jsx';
import { MatchOver } from './MatchOver.jsx';

/**
 * How often the camera goes out to the opponent, and when it holds back.
 *
 * Four frames a second is a slideshow. It was chosen when every frame was also
 * being analysed at the other end, which is no longer true, so the budget can
 * go where it is actually seen. Fifteen a second reads as video rather than as
 * a series of photographs.
 *
 * The backlog ceiling is the other half of it. On a weak uplink, sending more
 * frames than the connection can carry does not make the opponent's picture
 * smoother; it makes it later, permanently, because every extra frame queues
 * behind the last one. Two frames' worth of unsent bytes is the point at which
 * skipping this one is the kinder choice.
 */
const FRAME_INTERVAL_MS = 68;
const BACKLOG_LIMIT_BYTES = 120_000;

interface RoomProps {
  store: MatchStore;
  snapshot: StoreSnapshot;
  match: PublicMatchState;
  youId: string;
  camera: CameraState;
  onLeave: () => void;
  onFindAnother: () => void;
}

export function Room({ store, snapshot, match, youId, camera, onLeave, onFindAnother }: RoomProps) {
  useUiPreferences();
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
  if (!cameraReady && match.phase === 'lobby') {
    return <CameraGate camera={camera} roomCode={match.roomCode} onLeave={onLeave} />;
  }

  const opponent = opponentOf(match, youId);

  return (
    <div className="room" id="main-content" role="main">
      <Announcer match={match} youId={youId} />
      {/* The finisher only. A scored point plays inside the arena, under the
          cameras, where it belongs to the round rather than to the window. */}
      <header className="room__bar">
        <span className="room__code mono" title={tr('Room code')}>
          {match.roomCode}
        </span>
        <span className="room__phase eyebrow">{tr(phaseLabel(match))}</span>
        <div className="room__right">
          <ConnectionBadge status={snapshot.status} latencyMs={snapshot.latencyMs} />
          <AudioControls />
          <button
            className="btn btn--sm room__leave"
            onClick={onLeave}
            title={tr(
              match.ranked && matchRunning ? 'Leaving can count as a ranked loss' : 'Leave room',
            )}
          >
            {tr(match.ranked && matchRunning ? 'Forfeit' : 'Leave')}
          </button>
        </div>
      </header>

      {match.phase === 'lobby' && (
        <Lobby
          store={store}
          match={match}
          youId={youId}
          camera={camera}
          standings={snapshot.standings}
        />
      )}
      {match.phase === 'matchResult' && (
        <MatchOver
          store={store}
          match={match}
          youId={youId}
          evidence={snapshot.evidence}
          standings={snapshot.standings}
          lastRatings={snapshot.lastRatings}
          rewards={snapshot.rewards}
          onLeave={onLeave}
          onFindAnother={onFindAnother}
        />
      )}
      {match.phase !== 'lobby' && match.phase !== 'matchResult' && (
        <Arena
          store={store}
          match={match}
          youId={youId}
          camera={camera}
          evidence={snapshot.evidence}
          standings={snapshot.standings}
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
 *
 * Paced off the camera rather than off a timer. `requestVideoFrameCallback`
 * fires once per frame the camera actually delivers, so a 30fps webcam is never
 * encoded twice for the same picture and a 15fps one is never waited on. The
 * interval below is a floor on the gap between sends, not a metronome.
 */
function useFrameSender(store: MatchStore, camera: CameraState, active: boolean): void {
  const seqRef = useRef(0);
  const captureRef = useRef(createLiveCapture());

  useEffect(() => {
    if (!active) return;
    const capture = captureRef.current;
    let stopped = false;
    let sentAt = 0;
    let animation: number | null = null;
    let videoCallback: number | null = null;

    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      if (
        now - sentAt >= FRAME_INTERVAL_MS &&
        !document.hidden &&
        store.outboundBacklog() < BACKLOG_LIMIT_BYTES
      ) {
        const image = capture.toBoundedDataUrl(
          camera.videoRef.current,
          LIVE_FRAME_QUALITY,
          LIVE_FRAME_FALLBACK_QUALITY,
          MAX_FRAME_BYTES,
        );
        if (image) {
          sentAt = now;
          store.sendFrame(image, seqRef.current++);
        }
      }
      schedule();
    };

    /*
     * The camera's next frame, with a timer underneath it.
     *
     * A background tab presents no video frames, so a callback registered on
     * the way out never fires and the stream would stay dead after the player
     * came back. The timer keeps the loop turning; `tick` is the thing that
     * decides a hidden tab has nothing worth sending.
     */
    const schedule = () => {
      if (stopped) return;
      const video = camera.videoRef.current;
      if (animation !== null) window.clearTimeout(animation);
      if (videoCallback !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoCallback);
        videoCallback = null;
      }
      let fired = false;
      const run = () => {
        if (fired || stopped) return;
        fired = true;
        tick();
      };
      if (video && 'requestVideoFrameCallback' in video) {
        videoCallback = video.requestVideoFrameCallback(run);
      }
      animation = window.setTimeout(run, FRAME_INTERVAL_MS * 3);
    };

    tick();
    return () => {
      stopped = true;
      if (animation !== null) window.clearTimeout(animation);
      const video = camera.videoRef.current;
      if (videoCallback !== null && video && 'cancelVideoFrameCallback' in video) {
        video.cancelVideoFrameCallback(videoCallback);
      }
    };
  }, [store, camera.videoRef, active]);
}
