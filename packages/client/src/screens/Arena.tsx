import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  colorSwatch,
  detectorColors,
  getChallenge,
  type DetectorSpec,
  type PublicMatchState,
  type PublicPlayer,
} from '@battle/shared';
import type { MatchStore } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import { PeerVideo, SelfVideo, StageFrame } from '../components/Stage.jsx';
import { ScoreStrip, TimerBar } from '../components/Hud.jsx';
import { useLocalDetection } from '../hooks/useVision.js';
import { useCountdownSound } from '../hooks/useMatchSound.js';
import { sound } from '../media/sound.js';
import { EVIDENCE_QUALITY, createEvidenceCapture } from '../media/capture.js';

interface ArenaProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  camera: CameraState;
  /** `${roundId}:${playerId}` -> JPEG data URL of a submitted answer. */
  evidence: Record<string, string>;
  now: number;
}

export function Arena({ store, match, youId, camera, evidence, now }: ArenaProps) {
  const round = match.round;
  const challenge = round ? getChallenge(round.challengeId) ?? null : null;
  const you = match.players[youId] ?? null;
  const opponentId = match.seats.find((id) => id && id !== youId) ?? null;
  const opponent = opponentId ? match.players[opponentId] ?? null : null;
  const yourSeat = you?.seat ?? 0;
  const theirSeat = (yourSeat === 0 ? 1 : 0) as 0 | 1;

  const evidenceCapture = useRef(createEvidenceCapture());
  const [submitting, setSubmitting] = useState(false);

  const isChallenge = match.phase === 'challenge';
  const locked = Boolean(you?.submitted);
  const passed = Boolean(you?.passed);
  const done = locked || passed;

  const detection = useLocalDetection({
    videoRef: camera.videoRef,
    challenge,
    roundId: round?.id ?? null,
    phase: match.phase,
  });

  useEffect(() => {
    setSubmitting(false);
  }, [round?.id, match.phase]);

  const lockIn = useCallback(() => {
    if (!round || !isChallenge || locked || submitting) return;
    const image = evidenceCapture.current.toDataUrl(camera.videoRef.current, EVIDENCE_QUALITY);
    if (!image) return;
    setSubmitting(true);
    sound.play('lockIn');
    store.submit(round.id, image);
  }, [round, isChallenge, locked, submitting, camera.videoRef, store]);

  useEffect(() => {
    if (!isChallenge || done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName)) return;
      e.preventDefault();
      lockIn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isChallenge, done, lockIn]);

  const selfState = match.phase === 'roundResult' ? resultState(match, youId) : done ? 'locked' : 'live';
  const peerState =
    match.phase === 'roundResult'
      ? resultState(match, opponentId)
      : opponent?.submitted || opponent?.passed
        ? 'locked'
        : 'live';

  useCountdownSound(
    match.phase === 'countdown',
    Math.max(0, ((match.phaseEndsAt ?? now) - now) / 1000),
  );

  return (
    <div className="arena">
      <PromptBand match={match} now={now} detection={detection} showMeter={!done} />

      <div className="arena__stages">
        <StageFrame
          seat={yourSeat}
          player={you}
          state={selfState}
          overlay={
            <>
              {camera.status !== 'ready' && <CameraTrouble camera={camera} />}
              {match.phase === 'countdown' && <Countdown match={match} now={now} />}
              {match.phase === 'roundResult' && round && (
                <EvidenceShot image={evidence[`${round.id}:${youId}`]} />
              )}
              {isChallenge && (locked || passed) && <LockedBadge passed={passed} />}
            </>
          }
        >
          <SelfVideo videoRef={camera.videoRef} />
        </StageFrame>

        <StageFrame
          seat={theirSeat}
          player={opponent}
          state={peerState}
          overlay={
            <>
              {(match.phase === 'judging' || match.phase === 'roundResult') && round && opponentId && (
                <EvidenceShot image={evidence[`${round.id}:${opponentId}`]} />
              )}
              {isChallenge && (opponent?.submitted || opponent?.passed) && (
                <LockedBadge them passed={Boolean(opponent?.passed)} />
              )}
            </>
          }
        >
          <PeerVideo store={store} playerId={opponentId} />
        </StageFrame>
      </div>

      <ActionRow
        store={store}
        match={match}
        youId={youId}
        opponent={opponent}
        detection={detection}
        done={done}
        passed={passed}
        submitting={submitting}
        onLockIn={lockIn}
      />

      <ScoreStrip match={match} youId={youId} />
    </div>
  );
}

function resultState(match: PublicMatchState, playerId: string | null): 'won' | 'lost' | 'idle' {
  if (!playerId || !match.round?.outcome) return 'idle';
  const outcome = match.round.outcome;
  if (outcome.winnerId === playerId) return 'won';
  return outcome.perPlayer[playerId]?.valid ? 'idle' : 'lost';
}

// ---------------------------------------------------------------------------

type Detection = ReturnType<typeof useLocalDetection>;

function PromptBand({
  match,
  now,
  detection,
  showMeter,
}: {
  match: PublicMatchState;
  now: number;
  detection: Detection;
  /** Hidden once you have committed: the reading no longer changes anything. */
  showMeter: boolean;
}) {
  const round = match.round;
  const challenge = round ? getChallenge(round.challengeId) : null;
  const hidden = match.phase === 'countdown';

  // What a full timer bar means, taken from the match rather than assumed.
  const totalMs = useMemo(() => {
    switch (match.phase) {
      case 'challenge':
        return challenge?.durationMs ?? match.settings.judgingMs;
      case 'judging':
        return match.settings.judgingMs;
      case 'roundResult':
        return match.settings.roundResultMs;
      default:
        return match.settings.countdownMs;
    }
  }, [match.phase, match.settings, challenge]);

  return (
    <header className={`prompt ${hidden ? 'prompt--hidden' : ''}`}>
      <div className="prompt__meta">
        <span className="eyebrow">
          Round {round?.number ?? 1} · first to {match.settings.winTarget}
        </span>
        {round?.judging === 'peer' && !hidden && (
          <span className="badge badge--peer">Your opponent decides this one</span>
        )}
        {round?.judging === 'auto' && !hidden && (
          <span className="badge badge--auto">Camera decides this one</span>
        )}
      </div>

      <h1 className="prompt__text display">
        {hidden ? 'Get ready' : challenge?.prompt ?? '…'}
      </h1>
      {!hidden && challenge?.hint && <p className="prompt__hint dim">{challenge.hint}</p>}

      {match.phase !== 'countdown' && (
        <TimerBar
          endsAt={match.phaseEndsAt}
          totalMs={totalMs}
          now={now}
          label={
            match.phase === 'judging'
              ? 'judging'
              : match.phase === 'roundResult'
                ? 'next round'
                : undefined
          }
        />
      )}

      {match.phase === 'challenge' && showMeter && challenge?.detector && (
        <DetectionMeter detection={detection} detector={challenge.detector} />
      )}
    </header>
  );
}

/**
 * How close the camera thinks you are. Every detector reports progress on the
 * same 0..1 scale, so one meter renders a colour round, a "fill the frame"
 * round and a "black out the lens" round without knowing which is which.
 */
function DetectionMeter({ detection, detector }: { detection: Detection; detector: DetectorSpec }) {
  const matched = detection.result?.matched ?? false;
  const progress = detection.result?.progress ?? 0;
  const colors = detectorColors(detector);
  // Colour rounds tint the bar with the colour being hunted; the rest stay neutral.
  const tint = colors.length > 0 ? colorSwatch(colors[0]!) : 'var(--text)';

  return (
    <div className={`meter ${matched ? 'meter--hit' : ''}`}>
      {colors.map((key) => (
        <span
          key={key}
          className="meter__swatch"
          style={{ background: colorSwatch(key) }}
          aria-hidden="true"
        />
      ))}
      <div className="meter__track">
        <div
          className="meter__fill"
          style={{ width: `${Math.round(progress * 100)}%`, background: matched ? 'var(--good)' : tint }}
        />
      </div>
      <span className="meter__label mono">{matched ? 'LOCKED' : `${Math.round(progress * 100)}%`}</span>
    </div>
  );
}

function Countdown({ match, now }: { match: PublicMatchState; now: number }) {
  const remaining = Math.max(0, (match.phaseEndsAt ?? now) - now);
  const count = Math.ceil(remaining / 1000);
  return (
    <div className="countdown" aria-hidden="true">
      <span key={count} className="countdown__num display">
        {count > 0 ? count : 'GO'}
      </span>
    </div>
  );
}

/**
 * A camera that failed mid-match, shown where the camera was. The round carries
 * on without you, which is exactly why this has to be fixable without leaving.
 */
function CameraTrouble({ camera }: { camera: CameraState }) {
  return (
    <div className="trouble" role="alert">
      <p className="eyebrow">Camera stopped</p>
      <p className="trouble__text">{camera.message ?? 'The camera is no longer running.'}</p>
      <button
        className="btn btn--primary"
        onClick={camera.request}
        disabled={camera.status === 'requesting'}
      >
        {camera.status === 'requesting' ? 'Asking…' : 'Turn it back on'}
      </button>
    </div>
  );
}

function LockedBadge({ them = false, passed = false }: { them?: boolean; passed?: boolean }) {
  const label = passed ? 'Passed' : them ? 'Locked in' : 'You locked in';
  return (
    <div className={`lockedbadge ${passed ? 'lockedbadge--passed' : ''}`}>
      <span>{label}</span>
    </div>
  );
}

function EvidenceShot({ image }: { image: string | undefined }) {
  if (!image) return null;
  return <img className="evidence" src={image} alt="Submitted answer" />;
}

function ActionRow({
  store,
  match,
  youId,
  opponent,
  detection,
  done,
  passed,
  submitting,
  onLockIn,
}: {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  opponent: PublicPlayer | null;
  detection: Detection;
  done: boolean;
  passed: boolean;
  submitting: boolean;
  onLockIn: () => void;
}) {
  const round = match.round;

  if (match.phase === 'challenge' && round) {
    if (done || submitting) {
      return (
        <div className="actions actions--waiting">
          <p className="actions__note">
            {passed ? 'Passed. ' : ''}
            {opponent?.submitted || opponent?.passed
              ? 'Scoring…'
              : `Waiting for ${opponent?.name ?? 'your opponent'}…`}
          </p>
        </div>
      );
    }
    const matched = detection.result?.matched ?? false;
    const isAuto = round.judging === 'auto';
    return (
      <div className="actions">
        <div className="actions__row">
          <button
            className={`btn btn--lg lockin ${matched || !isAuto ? 'lockin--hot' : ''}`}
            onClick={onLockIn}
          >
            {matched || !isAuto ? 'Lock it in' : 'Lock in anyway'}
          </button>
          <button
            className="btn actions__pass"
            onClick={() => store.pass(round.id)}
            title="Give up on this round"
          >
            Pass
          </button>
        </div>
        <p className="actions__note dim">
          {isAuto
            ? matched
              ? 'The camera has it. Be quick.'
              : 'Hold it up so it fills the middle of the frame.'
            : 'Show it clearly — your opponent has to be able to tell.'}
          <span className="actions__key"> Space</span>
        </p>
      </div>
    );
  }

  if (match.phase === 'judging' && round && opponent) {
    const theirs = round.submissions[opponent.id];
    const alreadyVoted = Boolean(theirs?.peer);
    if (!theirs) {
      return (
        <div className="actions actions--waiting">
          <p className="actions__note">
            {opponent.name} ran out of time. Waiting on their verdict for yours…
          </p>
        </div>
      );
    }
    return (
      <div className="actions actions--judging">
        <p className="actions__question">
          Does <strong>{opponent.name}</strong>&rsquo;s answer count?
        </p>
        <div className="actions__votes">
          <button
            className="btn btn--lg vote vote--no"
            disabled={alreadyVoted}
            onClick={() => store.vote(round.id, opponent.id, false)}
          >
            No
          </button>
          <button
            className="btn btn--lg vote vote--yes"
            disabled={alreadyVoted}
            onClick={() => store.vote(round.id, opponent.id, true)}
          >
            Yes
          </button>
        </div>
        {alreadyVoted && <p className="actions__note dim">Verdict in. Waiting for theirs…</p>}
      </div>
    );
  }

  if (match.phase === 'roundResult' && round?.outcome) {
    const outcome = round.outcome;
    const yours = outcome.perPlayer[youId];
    const headline =
      outcome.winnerId === youId
        ? 'Round won'
        : outcome.winnerId === null
          ? 'No score'
          : `${opponent?.name ?? 'Opponent'} takes it`;
    return (
      <div className={`actions actions--result result--${outcome.winnerId === youId ? 'win' : outcome.winnerId ? 'loss' : 'draw'}`}>
        <p className="actions__headline display">{headline}</p>
        <p className="actions__note dim">
          {yours?.note}
          {yours?.elapsedMs != null && ` · ${(yours.elapsedMs / 1000).toFixed(1)}s`}
        </p>
      </div>
    );
  }

  return <div className="actions actions--waiting" />;
}
