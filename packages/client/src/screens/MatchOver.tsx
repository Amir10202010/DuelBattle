import {
  getChallenge,
  opponentOf,
  type PublicMatchState,
  type PublicProfile,
  type RatingDelta,
  type RoundOutcome,
} from '@battle/shared';
import { ProfileCard, RatingLine } from '../components/Rating.jsx';
import type { MatchStore } from '../net/store.js';
import { SeriesLine } from '../components/Series.jsx';

interface MatchOverProps {
  store: MatchStore;
  match: PublicMatchState;
  youId: string;
  /** `${roundId}:${playerId}` -> JPEG data URL, as collected during the match. */
  evidence: Record<string, string>;
  standings: Record<string, PublicProfile>;
  lastRatings: Record<string, RatingDelta> | null;
  onLeave: () => void;
}

/**
 * Why you lost a round, in two or three words.
 *
 * The full reason is only on screen for the five seconds of the round result,
 * and by the recap it is gone — so a player who lost 3-0 has no way to tell
 * whether they were slower, not detected, or simply voted down every time. That
 * last one is worth being able to see.
 */
function yourOutcome(outcome: RoundOutcome, youId: string): { label: string; kind: string } | null {
  if (outcome.winnerId === youId) return null;
  const mine = outcome.perPlayer[youId];
  if (!mine) return { label: 'no answer', kind: 'missed' };

  // A vetoed round has no winner and two explanations: one of you was rejected,
  // and the other one is the reason it counted for nobody.
  if (outcome.reason === 'vetoed') {
    return mine.valid
      ? { label: 'you said no', kind: 'rejected' }
      : { label: 'voted down', kind: 'rejected' };
  }

  if (mine.valid) {
    const theirs = outcome.winnerId ? outcome.perPlayer[outcome.winnerId] : undefined;
    if (mine.elapsedMs != null && theirs?.elapsedMs != null) {
      const behind = (mine.elapsedMs - theirs.elapsedMs) / 1000;
      // Under a twentieth of a second this rounds to "0.0s slower", which reads
      // as a bug to the person who lost by it.
      if (behind < 0.05) return { label: 'photo finish', kind: 'slower' };
      return { label: `${behind.toFixed(1)}s slower`, kind: 'slower' };
    }
    return { label: 'slower', kind: 'slower' };
  }

  const note = mine.note.toLowerCase();
  if (note.includes('rejected')) return { label: 'voted down', kind: 'rejected' };
  if (note.includes('passed')) return { label: 'passed', kind: 'missed' };
  if (note.includes('ran out')) return { label: 'out of time', kind: 'missed' };
  return { label: 'not detected', kind: 'missed' };
}

export function MatchOver({
  store,
  match,
  youId,
  evidence,
  standings,
  lastRatings,
  onLeave,
}: MatchOverProps) {
  const you = match.players[youId] ?? null;
  const opponent = opponentOf(match, youId);
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
        <SeriesLine match={match} youId={youId} className="over__series" />
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
              {id && (
                <RatingLine profile={standings[id]} delta={lastRatings?.[id] ?? undefined} />
              )}
            </div>
          );
        })}
      </div>

      <Filmstrip match={match} youId={youId} evidence={evidence} />

      <ProfileCard profile={standings[youId]} />

      {match.history.length > 0 && (
        <ol className="recap" aria-label="Round by round">
          {match.history.map((outcome) => {
            const challenge = getChallenge(outcome.challengeId);
            const winnerName = outcome.winnerId
              ? match.players[outcome.winnerId]?.name ?? 'Unknown'
              : 'Nobody';
            const custom = match.customChallenges.find((c) => c.id === outcome.challengeId);
            const why = yourOutcome(outcome, youId);
            return (
              <li key={outcome.roundNumber} className="recap__row">
                <span className="recap__num mono">{String(outcome.roundNumber).padStart(2, '0')}</span>
                <span className="recap__prompt">
                  {challenge?.prompt ?? custom?.prompt ?? outcome.challengeId}
                </span>
                <span
                  className={`recap__winner ${outcome.winnerId === youId ? 'is-you' : ''} ${
                    outcome.winnerId === null ? 'is-draw' : ''
                  }`}
                >
                  {winnerName}
                </span>
                <span className={`recap__why ${why ? `is-${why.kind}` : ''}`}>
                  {why?.label ?? 'won it'}
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

/**
 * The story of the match, in the shots that won it.
 *
 * The server only keeps the round it is judging; these are the copies this
 * client was sent as each round resolved. It is the one moment in the game
 * worth looking back at, and a table of prompts is not it.
 */
function Filmstrip({
  match,
  youId,
  evidence,
}: {
  match: PublicMatchState;
  youId: string;
  evidence: Record<string, string>;
}) {
  const shots = match.history
    .filter((outcome) => outcome.winnerId !== null)
    .map((outcome) => ({
      outcome,
      image: evidence[`${outcome.roundId}:${outcome.winnerId}`],
      challenge: getChallenge(outcome.challengeId) ?? null,
      custom: match.customChallenges.find((c) => c.id === outcome.challengeId) ?? null,
    }))
    .filter((shot) => Boolean(shot.image));

  if (shots.length === 0) return null;

  return (
    <ol className="filmstrip" aria-label="Winning answers">
      {shots.map(({ outcome, image, challenge, custom }) => {
        const winner = outcome.winnerId ? match.players[outcome.winnerId] : undefined;
        const prompt = challenge?.prompt ?? custom?.prompt ?? '';
        return (
          <li
            key={outcome.roundId}
            className={`filmstrip__shot ${outcome.winnerId === youId ? 'is-yours' : ''}`}
          >
            <img src={image} alt={`${winner?.name ?? 'Winner'}: ${prompt}`} loading="lazy" />
            <span className="filmstrip__prompt">{prompt}</span>
            <span className="filmstrip__winner">
              {outcome.winnerId === youId ? 'You' : (winner?.name ?? 'Them')}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
