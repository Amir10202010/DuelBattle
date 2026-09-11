import { memo, useEffect, useRef, useState } from 'react';
import { getChallenge, opponentOf, type PublicMatchState } from '@battle/shared';

/** Joins sentences without doubling the punctuation they already carry. */
function sentences(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .map((part) => (/[.!?]$/.test(part) ? part : `${part}.`))
    .join(' ');
}

/**
 * What a screen reader should hear at this moment in the match.
 *
 * The alternative — scattering `aria-live` across the prompt, the countdown
 * digits and the score — announces a stream of fragments, re-reads the prompt
 * whenever the meter re-renders, and still never says who won the round. One
 * sentence per transition is both quieter and more complete.
 */
export function announcementFor(match: PublicMatchState, youId: string): string | null {
  const opponent = opponentOf(match, youId) ?? undefined;
  const you = match.players[youId];
  const challenge = match.round ? getChallenge(match.round.challengeId) : undefined;

  switch (match.phase) {
    case 'lobby':
      return opponent
        ? `${opponent.name} is here. Ready up to start.`
        : `Room ${match.roomCode.split('').join(' ')}. Waiting for an opponent.`;

    case 'countdown':
      return `Round ${match.roundNumber} starting.`;

    case 'challenge':
      if (!challenge) return null;
      return sentences(
        challenge.prompt,
        match.round?.judging === 'auto'
          ? 'The camera decides this one'
          : match.round?.judging === 'ai'
            ? 'The AI judge decides this one'
            : 'Your opponent decides this one',
        challenge.hint,
      );

    case 'judging':
      if (match.round?.aiPending) return 'The AI judge is looking at both answers.';
      return opponent ? `Judging. Does ${opponent.name}'s answer count?` : 'Judging.';

    case 'roundResult': {
      const outcome = match.round?.outcome;
      if (!outcome) return null;
      const verdict =
        outcome.winnerId === youId
          ? 'You won the round.'
          : outcome.winnerId === null
            ? 'Nobody scored.'
            : `${opponent?.name ?? 'Your opponent'} won the round.`;
      return sentences(
        verdict,
        outcome.perPlayer[youId]?.note,
        `Score ${you?.score ?? 0} to ${opponent?.score ?? 0}`,
      );
    }

    case 'matchResult': {
      if (match.endReason === 'abandoned') return 'Match abandoned. Your opponent left.';
      const result =
        match.winnerId === youId
          ? 'You win the match.'
          : match.winnerId === null
            ? 'The match is a draw.'
            : `${opponent?.name ?? 'Your opponent'} wins the match.`;
      return sentences(result, `Final score ${you?.score ?? 0} to ${opponent?.score ?? 0}`);
    }
  }
}

export const Announcer = memo(function Announcer({
  match,
  youId,
}: {
  match: PublicMatchState;
  youId: string;
}) {
  const [message, setMessage] = useState('');
  const lastKey = useRef('');

  useEffect(() => {
    // Keyed on the transition, not on every render: the phase, the round, and
    // the outcome are the only things worth speaking.
    const key = `${match.phase}:${match.round?.id ?? ''}:${match.round?.outcome ? 'done' : ''}:${
      Object.keys(match.players).length
    }`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    setMessage(announcementFor(match, youId) ?? '');
  }, [match, youId]);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
});
