import { DeadlineCue } from '../components/DeadlineCue.js';
import '../styles/vision.css';
import { useSceneVision } from '../hooks/useSceneVision.js';
import { VisionOverlay } from '../components/VisionOverlay.js';
import { RoundComparison } from '../components/RoundComparison.js';
import { Celebration, roundStreak } from '../components/Celebration.jsx';
import { Camera, Check, ScanLine, LoaderCircle } from 'lucide-react';
import { tr, useUiPreferences } from '../i18n/index.js';
import { useEffect, useMemo } from 'react';
import {
  colorSwatch,
  customChallenge,
  detectorColors,
  getChallenge,
  opponentIdOf,
  opponentOf,
  type DetectorSpec,
  type PublicMatchState,
  type PublicProfile,
  type RoundJudging,
  type PublicPlayer,
} from '@battle/shared';
import type { MatchStore } from '../net/store.js';
import type { CameraState } from '../media/useCamera.js';
import { PeerVideo, SelfVideo, StageFrame } from '../components/Stage.jsx';
import { ScoreStrip, TimerBar } from '../components/Hud.jsx';
import { useLocalDetection } from '../hooks/useVision.js';
import { useCountdownSound } from '../hooks/useMatchSound.js';
import { useRoundAction } from '../hooks/useRoundAction.js';
import { DuelActors } from '../components/battle/DuelActors.jsx';
import { RoundBanner, buzz, roundVerdict } from '../components/battle/RoundBanner.jsx';

interface ArenaProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  camera: CameraState;
  /** `${roundId}:${playerId}` -> JPEG data URL of a submitted answer. */
  evidence: Record<string, string>;
  /** Loadouts, so the point animation swings the weapon somebody actually owns. */
  standings: Record<string, PublicProfile>;
  now: number;
  connected?: boolean;
}

export function Arena({ store, match, youId, camera, evidence, standings, now, connected = true }: ArenaProps) {
  useUiPreferences();
  const round = match.round;
  const challenge = currentChallenge(match);
  const you = match.players[youId] ?? null;
  const opponentId = opponentIdOf(match, youId);
  const opponent = opponentOf(match, youId);
  const action = useRoundAction({ match, youId, camera, store, connected });
  const submitting = action.pending !== null;

  const isChallenge = match.phase === 'challenge';
  const locked = Boolean(you?.submitted);
  const passed = Boolean(you?.passed);
  const done = locked || passed;

  const detection = useLocalDetection({
    videoRef: camera.videoRef,
    challenge,
    roundId: round?.id ?? null,
    phase: match.phase,
    active: connected && !match.paused && !done && !submitting,
  });

  const tracking = useSceneVision(
    camera.videoRef,
    camera.status === 'ready',
    (match.phase === 'countdown' || isChallenge) && !match.paused,
  );
  const showVision = isChallenge && !match.paused && !done && !submitting;
  const selfState =
    match.phase === 'roundResult' ? resultState(match, youId) : done ? 'locked' : 'live';
  const peerState =
    match.phase === 'roundResult'
      ? resultState(match, opponentId)
      : opponent?.submitted || opponent?.passed
        ? 'locked'
        : 'live';

  useCountdownSound(
    match.phase === 'countdown' && !match.paused && connected,
    Math.max(0, ((match.phaseEndsAt ?? now) - now) / 1000),
  );
  // The shutter is felt as well as seen: one short tap when the snapshot goes.
  useEffect(() => {
    if (action.pending === 'snap') buzz(18);
  }, [action.pending]);
  const verdict = roundVerdict(match, youId);

  return (
    <div className={`arena arena--${match.phase}`} data-impact={verdict ?? undefined}>
      <ScoreStrip match={match} youId={youId} />
      <PromptBand match={match} now={now} detection={detection} showMeter={!done && !submitting} />

      <div className="arena__stages">
      <div className="vision-controls" data-status={tracking.status}>
        {tracking.status === 'unavailable' && <button onClick={tracking.retry}>{tr('Retry tracking')}</button>}
        <button onClick={tracking.toggle} aria-pressed={tracking.enabled} title={tr('Body, hands and objects')}>
          <span className="vision-controls__dot" aria-hidden="true" />
          {tr(tracking.status === 'loading' ? 'Loading tracking…' : tracking.status === 'unavailable'
            ? 'Tracking unavailable' : tracking.enabled ? 'Tracking on' : 'Tracking off')}
          {tracking.status === 'ready' && tracking.enabled && tracking.fps > 0 && (
            <span className="vision-controls__rate mono">{tracking.fps} {tr('fps')}</span>
          )}
        </button>
      </div>
        {/* The countdown belongs to the whole arena, not to one camera: both
            players are waiting for the same number. */}
        {match.phase === 'countdown' && <Countdown match={match} now={now} />}
        <RoundBanner match={match} youId={youId} />
        <StageFrame
          seat={0}
          player={you}
          state={selfState}
          overlay={
            <>
              {camera.status !== 'ready' && <CameraTrouble camera={camera} />}
              {(locked || action.pending === 'snap' || match.phase === 'judging' || match.phase === 'roundResult') && round && (
                <EvidenceShot image={evidence[`${round.id}:${youId}`] ?? action.image ?? undefined} mirrored />
              )}
              {action.pending === 'snap' && <div className="capture-flash" aria-hidden="true" />}
              <DeadlineCue endsAt={match.phaseEndsAt} now={now} active={isChallenge && !done && !submitting && !match.paused} />
              {isChallenge && (locked || passed) && <LockedBadge passed={passed} />}
              {selfState === 'won' && round && (
                <Celebration key={round.id} streak={roundStreak(match.history, youId)} />
              )}
            </>
          }
        >
          <SelfVideo videoRef={camera.videoRef}>
            {showVision && <div className="capture-guide" aria-hidden="true"><i /><i /><i /><i /></div>}
            {showVision && tracking.enabled && (
              <VisionOverlay tracking={tracking} mirrored region={detection.result?.region?.box} />
            )}
          </SelfVideo>
        </StageFrame>

        <StageFrame
          seat={1}
          player={opponent}
          state={peerState}
          overlay={
            <>
              {/* No tracking over the opponent. It was analysed from the relayed
                  JPEG stream, which meant a skeleton drawn over a picture that
                  was already several frames old — it never lined up with the
                  person, and it halved the rate on your own camera to do it. */}
              {(match.phase === 'judging' || match.phase === 'roundResult') &&
                round &&
                opponentId && <EvidenceShot image={evidence[`${round.id}:${opponentId}`]} />}
              {peerState === 'won' && round && (
                <Celebration key={round.id} streak={roundStreak(match.history, opponentId)} />
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
      <DuelActors match={match} youId={youId} standings={standings} placement="round" />

      <ActionRow
        match={match}
        youId={youId}
        opponent={opponent}
        detection={detection}
        done={done}
        passed={passed}
        action={action}
      />
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

function currentChallenge(match: PublicMatchState) {
  const id = match.round?.challengeId;
  if (!id) return null;
  const custom = match.customChallenges.find((c) => c.id === id);
  return getChallenge(id) ?? (custom ? customChallenge(custom.id, custom.prompt) : null);
}

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
  useUiPreferences();
  const round = match.round;
  const challenge = currentChallenge(match);
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
          {tr('Round')} {round?.number ?? 1}
          {tr(' · first to ')}
          {tr(match.settings.winTarget)}
        </span>
        {!hidden && challenge?.tags.includes('party')
          ? <span className="badge badge--party">{tr('Time to get silly')}</span>
          : !hidden && round && <JudgeBadge judging={round.judging} />}
      </div>

      <h1 className="prompt__text display">
        {hidden
          ? tr((round?.number ?? 0) > match.settings.maxRounds
              ? 'Sudden death!'
              : Object.values(match.players).some((p) => p.score === match.settings.winTarget - 1) ? 'Match point!' : 'Get ready')
          : challenge && match.customChallenges.some((c) => c.id === challenge.id)
            ? challenge.prompt
            : tr(challenge?.prompt ?? '…')}
      </h1>
      {!hidden && challenge?.tags.includes('party') && challenge.hint && <p className="party-instruction">{tr(challenge.hint)}</p>}
      {!hidden && challenge?.hint && !challenge.tags.includes('party') && (
        <details className="prompt-help" key={round?.id}>
          <summary>{tr('Hint')}</summary>
          <p>{tr(challenge.hint)}</p>
        </details>
      )}

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
/** Who is deciding this round, said plainly before it starts. */
function JudgeBadge({ judging }: { judging: RoundJudging }) {
  useUiPreferences();
  if (judging === 'auto') {
    return <span className="badge badge--auto">{tr('Camera decides this one')}</span>;
  }
  if (judging === 'ai') {
    return <span className="badge badge--ai">{tr('The AI judge decides this one')}</span>;
  }
  return <span className="badge badge--auto">{tr('Camera decides this one')}</span>;
}

function DetectionMeter({ detection, detector }: { detection: Detection; detector: DetectorSpec }) {
  useUiPreferences();
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
          className={`meter__fill ${matched ? 'is-hit' : ''}`}
          style={{
            transform: `scaleX(${Math.min(1, Math.max(0, progress))})`,
            background: matched ? 'var(--acid)' : tint,
          }}
        />
      </div>
      <span className="meter__label mono">
        {tr(matched ? 'Ready to snap' : `${Math.round(progress * 100)}% match`)}
      </span>
    </div>
  );
}

function Countdown({ match, now }: { match: PublicMatchState; now: number }) {
  useUiPreferences();
  const remaining = Math.max(0, (match.phaseEndsAt ?? now) - now);
  const count = Math.ceil(remaining / 1000);
  return (
    <div className="countdown" aria-hidden="true">
      <span key={count} className="countdown__num display">
        {tr(count > 0 ? count : 'GO')}
      </span>
    </div>
  );
}

/**
 * A camera that failed mid-match, shown where the camera was. The round carries
 * on without you, which is exactly why this has to be fixable without leaving.
 */
function CameraTrouble({ camera }: { camera: CameraState }) {
  useUiPreferences();
  return (
    <div className="trouble" role="alert">
      <p className="eyebrow">{tr('Camera stopped')}</p>
      <p className="trouble__text">{tr(camera.message ?? 'The camera is no longer running.')}</p>
      <button
        className="btn btn--primary"
        onClick={camera.request}
        disabled={camera.status === 'requesting'}
      >
        {tr(camera.status === 'requesting' ? 'Asking…' : 'Turn it back on')}
      </button>
    </div>
  );
}

function LockedBadge({ them = false, passed = false }: { them?: boolean; passed?: boolean }) {
  useUiPreferences();
  const label = passed ? 'Passed' : them ? 'Locked in' : 'You locked in';
  return (
    <div className={`lockedbadge ${passed ? 'lockedbadge--passed' : ''}`}>
      <span>{tr(label)}</span>
    </div>
  );
}

function EvidenceShot({ image, mirrored = false }: { image: string | undefined; mirrored?: boolean }) {
  useUiPreferences();
  if (!image) return null;
  return <img className={`evidence ${mirrored ? 'evidence--mirrored' : ''}`} src={image} alt={tr('Submitted answer')} />;
}

/**
 * What to do with your hands, for whatever is actually watching.
 *
 * One line cannot serve every round: "hold it up so it fills the middle of the
 * frame" is the right advice for a colour hunt and flatly wrong for "black out
 * your camera", where the whole answer is to cover the lens. The switch is
 * exhaustive so a new detector cannot ship without telling players how to aim
 * at it.
 */
function aimingHint(detector: DetectorSpec | null, judging?: RoundJudging): string {
  if (!detector) {
    return judging === 'ai'
      ? 'Show it clearly — the AI judge has to be able to see it.'
      : 'Show it clearly — your opponent has to be able to tell.';
  }
  switch (detector.kind) {
    case 'color':
    case 'colorPair':
      return 'Hold it up so it fills the middle of the frame.';
    case 'coverage':
      return 'Closer — it has to fill nearly the whole frame.';
    case 'luminance':
      return detector.mode === 'brighter'
        ? 'Close to the lens: it has to out-shine the room.'
        : 'Close to the lens: it has to be darker than the room.';
    case 'darkness':
      return 'Cover the lens completely.';
  }
}

function ActionRow({
  match,
  youId,
  opponent,
  detection,
  done,
  passed,
  action,
}: {
  match: PublicMatchState;
  youId: string;
  opponent: PublicPlayer | null;
  detection: Detection;
  done: boolean;
  passed: boolean;
  action: ReturnType<typeof useRoundAction>;
}) {
  useUiPreferences();
  const round = match.round;

  if (match.phase === 'challenge' && round) {
    if (action.expired && !done && !action.pending) return <div className="actions actions--waiting" role="status">
      <strong>{tr('Time is up')}</strong><p className="actions__note">{tr('Waiting for the round result.')}</p>
    </div>;
    if (done || action.pending) {
      return (
        <div className="actions actions--waiting" role="status">
          {action.pending ? <LoaderCircle className="pending-spin" size={22} /> : <Check size={22} />}
          <strong>{tr(action.pending === 'snap' ? 'Sending your answer…' : action.pending === 'pass' ? 'Passing this round…' : passed ? 'Round passed' : 'Answer locked in')}</strong>
          <p className="actions__note">
            {tr(passed ? 'Passed. ' : '')}
            {tr(
              action.pending ? 'Waiting for the arena to confirm.' : opponent?.submitted || opponent?.passed
                ? 'Scoring…'
                : `Waiting for ${opponent?.name ?? 'your opponent'}…`,
            )}
          </p>
        </div>
      );
    }
    const matched = detection.result?.matched ?? false;
    const isAuto = round.judging === 'auto';
    const detector = (isAuto && getChallenge(round.challengeId)?.detector) || null;
    return (
      <div className="actions">
        <div className="actions__row">
          <button
            className={`lockin ${matched || !isAuto ? 'lockin--hot' : ''}`}
            onClick={action.snap}
            disabled={!action.canSnap}
          >
            {matched ? (
              <Check size={22} aria-hidden="true" />
            ) : (
              <Camera size={22} aria-hidden="true" />
            )}
            <span>{tr('Snap!')}</span>
          </button>
          <button
            className="btn actions__pass"
            onClick={action.pass}
            disabled={!action.canPass}
            title={tr('Give up on this round')}
          >
            {tr('Pass')}
          </button>
        </div>
        {action.error && <p className="error-text" role="alert">{tr(action.error)}</p>}
        <p className="actions__note dim">
          {tr(matched ? 'The camera has it. Be quick.' : aimingHint(detector, round.judging))}
          <kbd className="actions__key">{tr('Space')}</kbd>
        </p>
      </div>
    );
  }

  if (match.phase === 'judging') {
    return (
      <div className="actions actions--waiting" role="status">
        <ScanLine size={24} className="judging-scan" />
        <strong>{tr('Comparing your answers')}</strong>
        <p className="actions__note">{tr('Best answer wins. Speed breaks a close tie.')}</p>
      </div>
    );
  }

  if (match.phase === 'roundResult' && round?.outcome) {
    const outcome = round.outcome;

    const headline =
      outcome.winnerId === youId
        ? 'Round won'
        : outcome.winnerId === null
          ? outcome.reason === 'verification-unavailable' ? 'Checking paused' : outcome.reason === 'both-perfect-tie' ? 'Draw' : 'Try the next one'
          : `${opponent?.name ?? 'Opponent'} takes it`;
    return (
      <div
        className={`actions actions--result result--${outcome.winnerId === youId ? 'win' : outcome.winnerId ? 'loss' : 'draw'}`}
      >
        <p className="actions__headline display">{tr(headline)}</p>
        <RoundComparison match={match} youId={youId} />
      </div>
    );
  }

  return <div className="actions actions--waiting" />;
}

export { aimingHint as aimingHintForTesting };
