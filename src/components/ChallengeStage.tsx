import { Flag, Timer, Trophy, Zap } from 'lucide-react';
import type { RoomSnapshot } from '../../shared/protocol';
import { AiVerdict } from './AiVerdict';
export function ChallengeStage({
  room,
  now,
  userId,
}: {
  room: RoomSnapshot;
  now: number;
  userId: string;
}) {
  const round = room.round;
  const challenge = round?.challenge;
  if (!round) return null;
  const limit = challenge?.timeLimit ?? 30;
  const seconds = Math.max(0, Math.ceil((round.endsAt - now) / 1000));
  const countdown = Math.max(1, Math.ceil(((room.deadline ?? now) - now) / 1000));
  const winner = room.players.find((p) => p.id === round.winnerId);
  const isResult = room.state === 'ROUND_RESULT';
  const isNext = room.state === 'NEXT_ROUND';
  return (
    <section
      className={`challenge-stage ${isResult ? 'stage-result' : ''}`}
      aria-labelledby="challenge-heading"
    >
      <div className="stage-meta">
        <span className="eyebrow">
          <Zap size={14} fill="currentColor" />
          ROUND {String(round.number).padStart(2, '0')}{' '}
          <span>/ FIRST TO {Math.ceil(room.bestOf / 2)}</span>
        </span>
        <span
          className={`timer ${seconds <= 5 && room.state === 'CHALLENGE_ACTIVE' ? 'timer-urgent' : ''}`}
        >
          <Timer size={16} />
          {room.state === 'COUNTDOWN'
            ? 'GET READY'
            : isResult
              ? 'ROUND COMPLETE'
              : room.state === 'JUDGING'
                ? 'AI JUDGING'
                : isNext
                  ? 'UP NEXT'
                  : `${seconds}s`}
        </span>
      </div>
      <div className="challenge-title-row">
        <h1 id="challenge-heading" aria-live="polite">
          {isResult
            ? winner
              ? winner.id === userId
                ? 'You win the round.'
                : `${winner.name} wins the round.`
              : 'No points. Next round.'
            : room.state === 'JUDGING'
              ? 'Let the photos decide.'
              : isNext
                ? 'Keep that energy.'
                : room.state === 'COUNTDOWN'
                  ? 'Get ready. Eyes on the arena.'
                  : (challenge?.prompt ?? 'Battle paused') + '.'}
        </h1>
        {room.state === 'COUNTDOWN' ? (
          <div
            className="countdown-number"
            key={countdown}
            role="timer"
            aria-label={`Starting in ${countdown}`}
          >
            {countdown}
          </div>
        ) : isResult ? (
          <Trophy className="stage-symbol" />
        ) : isNext ? (
          <Flag className="stage-symbol" />
        ) : null}
      </div>
      <p className="stage-instruction">
        {isResult
          ? round.reason
          : room.state === 'JUDGING'
            ? 'The AI is identifying objects and comparing how well each photo answers the challenge.'
            : isNext
              ? 'A new challenge is on the way. Stay in frame.'
              : room.state === 'COUNTDOWN'
                ? 'Your next challenge is hidden until the countdown ends.'
                : (challenge?.instructions ?? 'Turn your camera on to continue.')}
      </p>
      {isResult && round.judgement && (
        <AiVerdict judgement={round.judgement} players={room.players} />
      )}
      {room.state === 'CHALLENGE_ACTIVE' && (
        <div
          className="round-progress"
          role="progressbar"
          aria-label="Round time remaining"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={seconds}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, (round.endsAt - now) / (limit * 10)))}%`,
            }}
          />
        </div>
      )}
    </section>
  );
}
