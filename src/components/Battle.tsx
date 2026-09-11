import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  Copy,
  Link2,
  LoaderCircle,
  Mic,
  MicOff,
  CameraOff,
  LogOut,
  ShieldCheck,
  X,
} from 'lucide-react';
import { parsePlayerName } from '../../shared/identity';
import { navigate, request, saveName } from '../lib/client';
import type { useConnection } from '../hooks/useConnection';
import { useBattle } from '../hooks/useBattle';
import { Brand } from './Brand';
import { CameraCard } from './CameraCard';
import { ChallengeStage } from './ChallengeStage';
import { ReviewPanel } from './ReviewPanel';
import { MatchResult } from './MatchResult';

export function Battle({
  code,
  connection,
  onInfo,
}: {
  code: string;
  connection: ReturnType<typeof useConnection>;
  onInfo: (kind: 'rules' | 'privacy') => void;
}) {
  const {
    socket,
    profile,
    connected,
    room,
    name,
    setName,
    draftName,
    setDraftName,
    joined,
    joinError,
    setJoinRetry,
    error,
    setError,
    busy,
    copied,
    showInvite,
    setShowInvite,
    confirmLeave,
    setConfirmLeave,
    videoRef,
    me,
    opponent,
    media,
    peer,
    now,
    active,
    color,
    detected,
    inviteLink,
    run,
    leave,
    copy,
    submit,
    review,
    matchState,
    myAttempts,
    pending,
    canCapture,
  } = useBattle(code, connection);
  const searching = room?.mode === 'random' && room.state === 'WAITING_FOR_PLAYER';
  const ai = room?.judgeMode === 'ai';
  const header = (
    <header className="battle-header">
      <Brand light onClick={() => (joined ? setConfirmLeave(true) : navigate('/'))} />
      <div className="battle-header-meta">
        <span className="room-code">ARENA / {code}</span>
        <span className={`server-status ${connected ? 'online' : ''}`}>
          {connected ? 'Connected' : 'Reconnecting…'}
        </span>
      </div>
      <button
        className="icon-button dark-icon"
        aria-label="Leave battle"
        onClick={() => (joined ? setConfirmLeave(true) : navigate('/'))}
      >
        <LogOut size={20} />
      </button>
    </header>
  );
  return (
    <div className="battle-page">
      {header}
      <main className="battle-main" id="main-content">
        {!connected && profile && (
          <div className="connection-banner" role="status">
            <LoaderCircle size={18} className="spin" /> Connection lost. Trying to reconnect…{' '}
            <button onClick={connection.retry}>Refresh session</button>
          </div>
        )}
        {(error || media.error) && (
          <div className="error-banner" role="alert">
            <span>{error || media.error}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setError(null);
                media.dismissError();
              }}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {confirmLeave && (
          <div className="leave-prompt" role="alert">
            <div>
              <strong>Leave this battle?</strong>
              <p>The arena closes for both players. Your camera will stop.</p>
            </div>
            <button
              className="button button-small button-outline-light"
              onClick={() => setConfirmLeave(false)}
            >
              Stay
            </button>
            <button
              className="button button-small button-lime"
              disabled={busy}
              onClick={() => void run(leave)}
            >
              Leave battle
            </button>
          </div>
        )}
        {!name ? (
          <section className="join-screen">
            <span className="eyebrow">YOU’VE BEEN CHALLENGED</span>
            <h1>
              Someone thinks
              <br />
              they can beat you.
            </h1>
            <p>Pick your name. Meet them in the arena.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parsePlayerName(draftName);
                if (!parsed.success) setError('Use 1–20 letters, numbers, spaces, or a dash.');
                else {
                  saveName(parsed.data);
                  setName(parsed.data);
                  setError(null);
                }
              }}
            >
              <label htmlFor="join-name">Your player name</label>
              <input
                id="join-name"
                autoFocus
                maxLength={20}
                autoComplete="nickname"
                placeholder="e.g. Jamie"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
              />
              <button className="button button-lime button-large full-width" disabled={!connected}>
                Join Battle <ArrowUpRight size={20} />
              </button>
            </form>
            <p className="join-footnote">
              First to three wins. Microphone optional.
              <br />
              Your camera stays off until you enable it.
            </p>
          </section>
        ) : joinError ? (
          <section className="join-screen">
            <span className="eyebrow">ARENA UNAVAILABLE</span>
            <h1>Missed the link?</h1>
            <p role="alert">{joinError}</p>
            <div className="join-actions">
              <button className="button button-lime" onClick={() => setJoinRetry((n) => n + 1)}>
                Try again
              </button>
              <button className="button button-outline-light" onClick={() => navigate('/')}>
                Back to home
              </button>
            </div>
          </section>
        ) : (!joined && connected) || !room || !me || !profile ? (
          <section className="join-screen">
            <LoaderCircle size={34} className="spin" />
            <h1>Entering the arena.</h1>
            <p role="status">{connection.error ?? 'Getting your spot ready…'}</p>
            {connection.error && (
              <button className="button button-lime" onClick={connection.retry}>
                Try again
              </button>
            )}
          </section>
        ) : room.state === 'CANCELLED' ? (
          <section className="join-screen">
            <span className="eyebrow">BATTLE CLOSED</span>
            <h1>Call it a timeout.</h1>
            <p>{room.message}</p>
            <button className="button button-lime" onClick={() => void run(leave)}>
              Back to home <ArrowUpRight size={19} />
            </button>
          </section>
        ) : room.state === 'MATCH_RESULT' ? (
          <MatchResult
            room={room}
            userId={profile.id}
            busy={busy || !connected}
            onRematch={() =>
              void run(async () => {
                if (!media.camera) await media.start();
                await request(socket!, 'rematch', { roomCode: code });
              })
            }
            onLeave={() => void run(leave)}
            camera={media.camera}
            microphone={media.microphone}
            remoteStream={peer.remote}
            onCamera={media.toggleCamera}
            onMicrophone={() => void media.toggleMic()}
          />
        ) : (
          <>
            {room.state === 'RECONNECTING' && (
              <div className="connection-banner" role="status">
                <LoaderCircle size={18} className="spin" />
                <span>
                  {room.message}{' '}
                  <strong>{Math.max(0, Math.ceil(((room.deadline ?? now) - now) / 1000))}s</strong>
                </span>
              </div>
            )}
            {!matchState ? (
              <section className="lobby-title">
                <div>
                  <span className="eyebrow">
                    {room.mode === 'random' ? 'RANDOM MATCH' : 'PRIVATE ARENA'} · BEST OF FIVE
                  </span>
                  <h1>
                    {searching
                      ? 'Finding your opponent.'
                      : opponent
                        ? 'The rivalry is ready.'
                        : 'Every rivalry starts here.'}
                  </h1>
                  <p>
                    {searching
                      ? 'You’re in the queue. We’ll match you with another player who presses Find opponent.'
                      : opponent
                        ? 'Cameras on. Both players ready. Let the chaos begin.'
                        : 'Invite a friend. Turn on your camera. Start something.'}
                  </p>
                </div>
                {room.mode === 'private' && (
                  <button className="button button-lime" onClick={() => void copy()}>
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    {copied ? 'Invite copied' : 'Copy invite link'}
                  </button>
                )}
              </section>
            ) : (
              <>
                <div
                  className="scoreboard"
                  aria-label={`Score: ${me.name} ${me.score}, ${opponent?.name ?? 'Opponent'} ${opponent?.score ?? 0}`}
                >
                  <div>
                    <span>
                      {me.name} <small>YOU</small>
                    </span>
                    <strong>{me.score}</strong>
                  </div>
                  <span className="score-divider">:</span>
                  <div>
                    <strong>{opponent?.score ?? 0}</strong>
                    <span>{opponent?.name ?? 'Opponent'}</span>
                  </div>
                </div>
                <ChallengeStage room={room} now={now} userId={profile.id} />
              </>
            )}
            {searching && (
              <div className="search-status" role="status">
                <LoaderCircle className="spin" size={24} />
                <div>
                  <strong>Searching for a real player</strong>
                  <p>
                    Up to {Math.max(0, Math.ceil(((room.deadline ?? now) - now) / 1000))}s
                    remaining. You can enable your camera while you wait.
                  </p>
                </div>
                <button
                  className="button button-outline-light button-small"
                  disabled={busy}
                  onClick={() => void run(leave)}
                >
                  Cancel search
                </button>
              </div>
            )}
            {!matchState && (
              <p className="judge-lobby-note">
                {ai
                  ? 'AI judge · One photo per round. Google Gemini recognizes the objects and compares both answers, assisted by local YOLOv8. Fulfillment: 70 points. Presentation: 30 points. Within 3 points is a draw.'
                  : 'Opponent review · AI is not connected. Your opponent confirms your photos.'}
              </p>
            )}
            {showInvite && (
              <div className="invite-box">
                <Link2 size={18} />
                <input
                  aria-label="Battle invite link"
                  value={inviteLink}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
                <button
                  className="icon-button dark-icon"
                  aria-label="Close invite link"
                  onClick={() => setShowInvite(false)}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div className="camera-grid">
              <CameraCard
                player={{ ...me, camera: media.camera, microphone: media.microphone }}
                stream={media.stream}
                local
                videoRef={videoRef}
                active={!!matchState}
                guide={!!active && !!color}
                detected={detected}
                onEnable={media.status === 'ready' ? media.toggleCamera : () => void media.start()}
                requesting={media.status === 'requesting'}
              />
              <div className="arena-vs" aria-hidden="true">
                VS
              </div>
              <CameraCard
                player={opponent}
                searching={searching}
                stream={peer.remote}
                peerState={peer.state}
                active={!!matchState}
                onReconnect={peer.reconnect}
              />
            </div>
            <div className="arena-controls">
              <div className="media-controls">
                <button
                  className={`icon-button dark-icon ${!media.microphone ? 'control-off' : ''}`}
                  aria-label={media.microphone ? 'Mute microphone' : 'Enable microphone'}
                  aria-pressed={media.microphone}
                  disabled={!media.stream}
                  onClick={() => void media.toggleMic()}
                >
                  {media.microphone ? <Mic size={19} /> : <MicOff size={19} />}
                </button>
                <button
                  className={`icon-button dark-icon ${!media.camera ? 'control-off' : ''}`}
                  aria-label={media.camera ? 'Turn camera off' : 'Turn camera on'}
                  aria-pressed={media.camera}
                  onClick={media.toggleCamera}
                >
                  {media.camera ? <Camera size={20} /> : <CameraOff size={20} />}
                </button>
                <span>{media.microphone ? 'Mic on' : 'Mic off'}</span>
                {media.devices.length > 1 && (
                  <select
                    className="camera-select"
                    aria-label="Camera device"
                    value={media.deviceId}
                    disabled={media.status === 'requesting'}
                    onChange={(e) => void media.selectDevice(e.target.value)}
                  >
                    {media.devices.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {!matchState ? (
                <button
                  className="button button-lime ready-button"
                  disabled={busy || !media.camera || !connected}
                  onClick={() =>
                    void run(() => request(socket!, 'ready', { roomCode: code, ready: !me.ready }))
                  }
                >
                  {me.ready ? (
                    <>
                      <Check size={20} /> Ready!{' '}
                      {opponent?.ready ? '' : 'Waiting for your opponent'}
                    </>
                  ) : (
                    <>
                      I’m ready <ArrowUpRight size={19} />
                    </>
                  )}
                </button>
              ) : active ? (
                <button
                  className="button button-lime ready-button"
                  disabled={!canCapture || !connected}
                  onClick={() => void submit()}
                >
                  <Camera size={20} />
                  {pending
                    ? ai
                      ? 'Photo locked in'
                      : 'Waiting for review…'
                    : myAttempts.length >= 3
                      ? 'Snapshots used'
                      : now >= room.round!.endsAt
                        ? 'Time’s up'
                        : 'I’ve got it! Send snapshot'}
                  <kbd aria-hidden="true">Space</kbd>
                </button>
              ) : (
                <span className="next-status" role="status">
                  {room.state === 'COUNTDOWN'
                    ? 'Wait for the timer…'
                    : room.state === 'JUDGING'
                      ? 'AI is comparing both photos…'
                      : room.state === 'RECONNECTING'
                        ? 'Battle paused'
                        : 'Next up in a moment…'}
                </span>
              )}
              <div className="verification-label">
                <ShieldCheck size={16} />
                <span>{ai ? 'AI photo judge' : 'Opponent review'}</span>
              </div>
            </div>
            <p className="arena-hint">
              {!matchState
                ? !media.camera
                  ? 'Enable your camera to get ready. Microphone is optional.'
                  : searching
                    ? 'Stay on this page. The battle opens when another player is matched.'
                    : !opponent
                      ? 'Your arena is open. Send the invite link to your friend.'
                      : 'Both players need to be ready. One battle is counted for each of you when the countdown begins.'
                : active && ai
                  ? 'Make your answer clear in the photo. Press Space to submit. The AI compares both answers after submission or when time is up.'
                  : active && color
                    ? detected
                      ? `New ${color} pixels are stable. Show the object and interaction — your friend still confirms it.`
                      : `Bring your ${color} object into frame. Show yourself holding or using it.`
                    : active
                      ? 'Show it clearly. Send your snapshot. Confirm your friend’s answer fairly.'
                      : 'Keep it safe. Stay within reach. No running required.'}
            </p>
            <ReviewPanel
              room={room}
              userId={profile.id}
              now={now}
              busy={busy || !connected}
              onReview={review}
            />
            {room.message && room.state !== 'RECONNECTING' && (
              <p className="arena-hint" role="status">
                {room.message}
              </p>
            )}
          </>
        )}
        <footer className="battle-footer">
          <button onClick={() => onInfo('rules')}>
            <ShieldCheck size={14} /> House rules
          </button>
          <span>
            {profile?.plan === 'premium'
              ? 'PREMIUM'
              : `${profile?.remaining ?? '—'} / 3 BATTLES LEFT TODAY`}
          </span>
          <button onClick={() => onInfo('privacy')}>Camera privacy</button>
        </footer>
      </main>
      {!joined && (
        <button className="back-home text-link text-link-light" onClick={() => navigate('/')}>
          <ArrowLeft size={16} /> Home
        </button>
      )}
    </div>
  );
}
