import type { PublicMatchState, PublicPlayer } from '@battle/shared';

export function player(overrides: Partial<PublicPlayer> & { id: string }): PublicPlayer {
  return {
    name: overrides.id,
    seat: 0,
    connected: true,
    cameraReady: true,
    ready: false,
    score: 0,
    validAnswers: 0,
    rematchVote: false,
    submitted: false,
    ...overrides,
  };
}

/**
 * One place that knows the shape of a match.
 *
 * Three test files used to build this by hand, so every field added to
 * PublicMatchState broke all three — and the type errors were only visible
 * because typechecking covers tests.
 */
export function publicMatch(overrides: Partial<PublicMatchState> = {}): PublicMatchState {
  return {
    roomCode: 'AB12C',
    phase: 'lobby',
    phaseEndsAt: null,
    seats: ['p1', 'p2'],
    players: {
      p1: player({ id: 'p1', name: 'Ada', seat: 0 }),
      p2: player({ id: 'p2', name: 'Grace', seat: 1 }),
    },
    round: null,
    roundNumber: 0,
    history: [],
    series: {},
    customChallenges: [],
    settings: {
      winTarget: 3,
      maxRounds: 9,
      countdownMs: 3_200,
      judgingMs: 15_000,
      roundResultMs: 5_500,
    },
    paused: null,
    winnerId: null,
    endReason: null,
    version: 1,
    ...overrides,
  };
}
