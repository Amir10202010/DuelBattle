import { getChallenge, type PublicMatchState } from '@battle/shared';
import type { MatchStore } from '../net/store.js';

interface MatchOverProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  onLeave: () => void;
}

export function MatchOver({ store, match, youId, onLeave }: MatchOverProps) {
  const you = match.players[youId] ?? null;
  const opponentId = match.seats.find((id) => id && id !== youId) ?? null;
  const opponent = opponentId ? match.players[opponentId] ?? null : null;
  const winner = match.winnerId ? match.players[match.winnerId] ?? null : null;

  const headline =
    match.endReason === 'abandoned'
      ? 'Match abandoned'
      : !winner
        ? 'Dead heat'
        : winner.id === youId
          ? 'You win'
          : `${winner.name} wins`;

  const subline =
    match.endReason === 'abandoned'
      ? 'Your opponent left before the match could finish.'
      : !winner
        ? 'Neither of you could pull ahead.'
        : winner.id === youId
          ? 'Take the rematch before they figure out your room.'
          : 'Rematch?';

  return (
    <main className="over">
      <div className="over__head">
        <p className="eyebrow">Room {match.roomCode}</p>
        <h1 className={`over__title display ${winner?.id === youId ? 'over__title--win' : ''}`}>
          {headline}
        </h1>
        <p className="over__sub dim">{subline}</p>
      </div>

      <div className="over__score">
        {match.seats.map((id, seat) => {
          const player = id ? match.players[id] ?? null : null;
          return (
            <div key={seat} className={`over__side over__side--seat${seat}`}>
              <span className="over__name">{player?.name ?? '—'}</span>
              <span className="over__number display">{player?.score ?? 0}</span>
              <span className="over__stat dim">
                {player?.validAnswers ?? 0} valid {player?.validAnswers === 1 ? 'answer' : 'answers'}
              </span>
            </div>
          );
        })}
      </div>

      {match.history.length > 0 && (
        <ol className="recap" aria-label="Round by round">
          {match.history.map((outcome) => {
            const challenge = getChallenge(outcome.challengeId);
            const winnerName = outcome.winnerId
              ? match.players[outcome.winnerId]?.name ?? 'Unknown'
              : 'Nobody';
            const mine = outcome.perPlayer[youId];
            return (
              <li key={outcome.roundNumber} className="recap__row">
                <span className="recap__num mono">{String(outcome.roundNumber).padStart(2, '0')}</span>
                <span className="recap__prompt">{challenge?.prompt ?? outcome.challengeId}</span>
                <span
                  className={`recap__winner ${outcome.winnerId === youId ? 'is-you' : ''} ${
                    outcome.winnerId === null ? 'is-draw' : ''
                  }`}
                >
                  {winnerName}
                </span>
                <span className="recap__time mono dim">
                  {mine?.elapsedMs != null ? `${(mine.elapsedMs / 1000).toFixed(1)}s` : '—'}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="over__actions">
        <button
          className="btn btn--primary btn--lg"
          onClick={() => store.rematch()}
          disabled={you?.rematchVote || !opponent?.connected}
        >
          {you?.rematchVote ? 'Waiting for them…' : 'Rematch'}
        </button>
        <button className="btn btn--lg" onClick={onLeave}>
          Leave
        </button>
      </div>

      {opponent?.rematchVote && !you?.rematchVote && (
        <p className="over__nudge" role="status">
          {opponent.name} wants another one.
        </p>
      )}
      {!opponent?.connected && (
        <p className="over__nudge dim" role="status">
          Your opponent has left. Share the room code to play someone else.
        </p>
      )}
    </main>
  );
}
