import { Flag, Timer, Trophy, Zap } from 'lucide-react';
import type { RoomSnapshot } from '../../shared/protocol';
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
  if (!round) return null;
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
            : isNext
              ? 'Keep that energy.'
              : round.challenge.prompt + '.'}
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
          : isNext
            ? 'A new challenge is on the way. Stay in frame.'
            : room.state === 'COUNTDOWN'
              ? 'Look at the challenge. Wait for the timer. Get ready to show it.'
              : round.challenge.instructions}
      </p>
      {room.state === 'CHALLENGE_ACTIVE' && (
        <div
          className="round-progress"
          role="progressbar"
          aria-label="Round time remaining"
          aria-valuemin={0}
          aria-valuemax={round.challenge.timeLimit}
          aria-valuenow={seconds}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, (round.endsAt - now) / (round.challenge.timeLimit * 10)))}%`,
            }}
          />
        </div>
      )}
    </section>
  );
}
