import { useEffect, useRef } from 'react';
import { opponentIdOf, opponentOf, type PublicMatchState } from '@battle/shared';
import { roundStreak } from '../components/Celebration.jsx';
import { sound } from '../media/sound.js';

/**
 * Turns match state transitions into sound, in one place.
 *
 * Scattering `sound.play()` through the components that happen to render each
 * moment would mean a cue fires whenever that component remounts. Watching the
 * authoritative state instead means every cue is tied to a transition that
 * actually happened, exactly once.
 */
export function useMatchSound(match: PublicMatchState | null, youId: string | null): void {
  const previous = useRef<PublicMatchState | null>(null);
  const tickedSecond = useRef<number | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = match;
    if (!match || !youId) return;

    const opponentId = opponentIdOf(match, youId);
    const opponent = opponentOf(match, youId) ?? undefined;
    const opponentWasThere = before ? Object.keys(before.players).length > 1 : false;

    if (opponent && !opponentWasThere && match.phase === 'lobby') {
      sound.play('opponentJoined');
    }

    if (before?.phase !== match.phase) {
      tickedSecond.current = null;

      if (match.phase === 'challenge') sound.play('go');

      if (match.phase === 'roundResult') {
        const winner = match.round?.outcome?.winnerId ?? null;
        sound.play(
          winner === youId
            ? roundStreak(match.history, youId) > 1
              ? 'roundStreak'
              : 'roundWin'
            : winner === null
              ? 'roundDraw'
              : 'roundLoss',
        );
      }

      if (match.phase === 'matchResult' && match.endReason !== 'abandoned') {
        sound.play(match.winnerId === youId ? 'matchWin' : 'matchLoss');
      }
    }

    // The moment your opponent commits, whether or not you are looking at them.
    const opponentJustLocked =
      match.phase === 'challenge' &&
      Boolean(opponent?.submitted) &&
      !(before && opponentId ? before.players[opponentId]?.submitted : false);
    if (opponentJustLocked) sound.play('opponentLocked');
  }, [match, youId]);
}

/**
 * The countdown ticks, driven by the clock rather than by state, because the
 * three beats happen inside a single phase.
 */
export function useCountdownSound(active: boolean, secondsLeft: number): void {
  const lastPlayed = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      lastPlayed.current = null;
      return;
    }
    const second = Math.ceil(secondsLeft);
    if (second < 1 || second > 3) return;
    if (lastPlayed.current === second) return;
    lastPlayed.current = second;
    sound.play(second === 3 ? 'tick3' : second === 2 ? 'tick2' : 'tick1');
  }, [active, secondsLeft]);
}
