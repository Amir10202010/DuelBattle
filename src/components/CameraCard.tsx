import { useEffect, useRef, useState, type RefObject } from 'react';
import { Camera, CameraOff, Check, MicOff, Volume2 } from 'lucide-react';
import type { Player } from '../../shared/protocol';

interface CameraCardProps {
  player?: Player;
  stream: MediaStream | null;
  local?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
  guide?: boolean;
  detected?: boolean;
  active?: boolean;
  peerState?: RTCPeerConnectionState;
  onEnable?: () => void;
  requesting?: boolean;
  onReconnect?: () => void;
}
export function CameraCard({
  player,
  stream,
  local = false,
  videoRef,
  guide,
  detected,
  active,
  peerState,
  onEnable,
  requesting,
  onReconnect,
}: CameraCardProps) {
  const ownRef = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? ownRef;
  const [audioBlocked, setAudioBlocked] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream)
      void video
        .play()
        .then(() => setAudioBlocked(false))
        .catch(() => {
          if (!local) setAudioBlocked(true);
        });
    return () => {
      video.srcObject = null;
    };
  }, [ref, stream, local]);
  const visible = stream && player?.camera && (local || peerState === 'connected');
  return (
    <article
      className={`camera-card ${local ? 'camera-local' : 'camera-opponent'} ${active ? 'camera-active' : ''}`}
      aria-label={local ? 'Your camera' : 'Opponent camera'}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={local}
        className={`${local ? 'mirror' : ''} ${visible ? '' : 'video-hidden'}`}
        aria-label={
          local ? 'Your live camera preview' : `${player?.name ?? 'Opponent'} live camera`
        }
      />
      {!visible && (
        <div className="camera-empty">
          {player ? (
            player.camera && !local ? (
              <>
                <Camera size={32} />
                <h3>
                  {peerState === 'failed' || peerState === 'disconnected'
                    ? 'Video connection interrupted'
                    : 'Connecting cameras…'}
                </h3>
                <p>
                  {peerState === 'failed'
                    ? 'Try reconnecting. A restricted network may need a relay.'
                    : 'Your opponent’s video will appear here.'}
                </p>
                {onReconnect && ['failed', 'disconnected'].includes(peerState ?? '') && (
                  <button
                    className="button button-outline-light button-small"
                    onClick={onReconnect}
                  >
                    Reconnect video
                  </button>
                )}
              </>
            ) : (
              <>
                <CameraOff size={32} />
                <h3>{local ? 'Make an entrance.' : 'Their camera is off.'}</h3>
                <p>
                  {local
                    ? 'Your camera turns your room into the arena.'
                    : 'Waiting for your opponent to enable their camera.'}
                </p>
                {local && onEnable && (
                  <button className="button button-lime" onClick={onEnable} disabled={requesting}>
                    {requesting ? 'Waiting for camera access…' : 'Enable camera'}
                    <Camera size={18} />
                  </button>
                )}
              </>
            )
          ) : (
            <>
              <span className="empty-opponent">?</span>
              <h3>A worthy opponent?</h3>
              <p>Send your link. This spot is reserved for your friend.</p>
            </>
          )}
        </div>
      )}
      {visible && guide && (
        <div
          className={`presentation-guide ${detected ? 'guide-detected' : ''}`}
          aria-hidden="true"
        >
          <span>{detected ? 'Color in frame' : 'Show it here'}</span>
        </div>
      )}
      <div className="camera-top">
        <span className={`player-tag ${local ? 'tag-you' : ''}`}>{local ? 'YOU' : 'OPPONENT'}</span>
        {player?.ready && !active && (
          <span className="ready-tag">
            <Check size={14} /> READY
          </span>
        )}
      </div>
      <div className="camera-bottom">
        <span>
          {player?.name ?? 'Waiting for a friend'}
          {player && !player.connected && <small> · disconnected</small>}
        </span>
        <span className="camera-indicators">
          {player && !player.microphone && <MicOff size={16} aria-label="Microphone muted" />}
          {player?.camera && visible && <span className="live-indicator">LIVE</span>}
        </span>
      </div>
      {audioBlocked && visible && (
        <button
          className="enable-audio"
          onClick={() => {
            void ref.current
              ?.play()
              .then(() => setAudioBlocked(false))
              .catch(() => setAudioBlocked(true));
          }}
        >
          <Volume2 size={16} /> Tap to hear your friend
        </button>
      )}
    </article>
  );
}
