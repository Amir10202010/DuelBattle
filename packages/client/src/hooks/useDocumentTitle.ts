import { useEffect, useRef } from 'react';
import type { PublicMatchState } from '@battle/shared';

const DEFAULT_TITLE = 'Battle — your room is the game';

/**
 * What the tab should say right now, or null for the usual title.
 *
 * Only moments that are genuinely waiting on this person. A title that shouts
 * through a whole match is noise; one that shouts when their friend finally
 * arrives is the reason they left the tab open.
 */
function titleFor(match: PublicMatchState | null, youId: string | null): string | null {
  if (!match || !youId) return null;
  const opponentId = match.seats.find((id) => id && id !== youId) ?? null;
  const opponent = opponentId ? match.players[opponentId] : undefined;

  if (match.phase === 'lobby') {
    if (!opponent) return `Waiting for someone — room ${match.roomCode}`;
    return opponent.ready ? `${opponent.name} is ready` : `${opponent.name} is here`;
  }

  if (match.phase === 'judging') {
    const theirs = opponentId ? match.round?.submissions[opponentId] : undefined;
    if (theirs && !theirs.peer) return 'Your verdict';
  }

  if (match.phase === 'matchResult' && opponent?.rematchVote) {
    return `${opponent.name} wants a rematch`;
  }

  return null;
}

/**
 * Puts the thing waiting on you in the tab title, but only while you are not
 * looking at it. Rewriting the title of a tab someone is staring at achieves
 * nothing except making the browser chrome flicker.
 */
export function useDocumentTitle(match: PublicMatchState | null, youId: string | null): void {
  const original = useRef(document.title);

  useEffect(() => {
    const apply = () => {
      const wanted = document.visibilityState === 'hidden' ? titleFor(match, youId) : null;
      document.title = wanted ? `${wanted} — Battle` : original.current || DEFAULT_TITLE;
    };

    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [match, youId]);

  useEffect(() => {
    const title = original.current || DEFAULT_TITLE;
    return () => {
      document.title = title;
    };
  }, []);
}

export { titleFor as titleForTesting };
