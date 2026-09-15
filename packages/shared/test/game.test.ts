import { beforeEach, describe, expect, it } from 'vitest';
import type { Challenge } from '../src/challenges.js';
import { getChallenge } from '../src/challenges.js';
import {
  DEFAULT_SETTINGS,
  MATCH_LENGTHS,
  challengeInRoom,
  countsForRating,
  createMatch,
  opponentIdOf,
  opponentOf,
  playersInSeatOrder,
  reduce,
  roundsAnswered,
  tick,
  type Action,
  type EngineContext,
  type MatchState,
} from '../src/game.js';

const AUTO: Challenge = {
  id: 'test-auto',
  prompt: 'SHOW SOMETHING RED',
  category: 'color',
  difficulty: 1,
  durationMs: 20_000,
  judging: 'auto',
  detector: { kind: 'color', target: 'red' },
  tags: ['color'],
};

const AUTO_2: Challenge = { ...AUTO, id: 'test-auto-2', prompt: 'SHOW SOMETHING BLUE' };

const PEER: Challenge = {
  id: 'test-peer',
  prompt: 'SHOW SOMETHING OLD',
  category: 'story',
  difficulty: 2,
  durationMs: 20_000,
  judging: 'peer',
  tags: ['story'],
};

let idCounter = 0;
function ctxAt(now: number, pool: readonly Challenge[] = [AUTO, AUTO_2]): EngineContext {
  return { now, newId: () => `r${++idCounter}`, random: () => 0.42, pool };
}

function apply(state: MatchState, action: Action, ctx: EngineContext): MatchState {
  const result = reduce(state, action, ctx);
  if (!result.ok) throw new Error(`action ${action.type} rejected: ${result.error}`);
  return result.state;
}

function expectError(state: MatchState, action: Action, ctx: EngineContext): string {
  const result = reduce(state, action, ctx);
  if (result.ok) throw new Error(`expected ${action.type} to be rejected`);
  return result.error;
}

/** Two players, cameras on, both ready -> countdown has started. */
function seatedMatch(now = 1_000, pool: readonly Challenge[] = [AUTO, AUTO_2]): MatchState {
  let s = createMatch('ABCDE', now);
  const ctx = ctxAt(now, pool);
  s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
  s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
  s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
  s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, ctx);
  s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
  s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctx);
  return s;
}

/** Fast-forwards into the live challenge window of the current round. */
function intoChallenge(state: MatchState, pool: readonly Challenge[] = [AUTO, AUTO_2]): MatchState {
  const at = state.phaseEndsAt;
  return tick(state, ctxAt(at, pool));
}

beforeEach(() => {
  idCounter = 0;
});

describe('joining', () => {
  it('seats two players and refuses a third', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    expect(s.seats).toEqual(['p1', 'p2']);
    expect(expectError(s, { type: 'join', playerId: 'p3', name: 'Alan' }, ctx)).toBe('room-full');
  });

  it('refuses a duplicate display name regardless of case', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    expect(expectError(s, { type: 'join', playerId: 'p2', name: '  aDa ' }, ctx)).toBe(
      'name-taken',
    );
  });

  it('treats a repeat join from a known player as a reconnect', () => {
    let s = seatedMatch();
    s = intoChallenge(s);
    s = apply(s, { type: 'setConnected', playerId: 'p1', connected: false }, ctxAt(2_000));
    expect(s.pausedAt).not.toBeNull();

    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctxAt(3_000));
    expect(s.pausedAt).toBeNull();
    expect(s.players.p1?.connected).toBe(true);
    expect(playersInSeatOrder(s)).toHaveLength(2);
  });

  it('reuses a freed seat after someone leaves the lobby', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    s = apply(s, { type: 'leave', playerId: 'p1' }, ctx);
    expect(s.seats).toEqual([null, 'p2']);
    s = apply(s, { type: 'join', playerId: 'p3', name: 'Alan' }, ctx);
    expect(s.seats).toEqual(['p3', 'p2']);
  });
});

describe('readiness', () => {
  it('will not let a player ready up without a camera', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    expect(expectError(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx)).toBe(
      'camera-required',
    );
  });

  it('drops readiness when the camera disappears', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: false }, ctx);
    expect(s.players.p1?.ready).toBe(false);
  });

  it('starts the countdown only when both players are ready', () => {
    const s = seatedMatch(1_000);
    expect(s.phase).toBe('countdown');
    expect(s.phaseEndsAt).toBe(1_000 + DEFAULT_SETTINGS.countdownMs);
    expect(s.round?.number).toBe(1);
  });

  it('does not accept readiness once a match is running', () => {
    const s = intoChallenge(seatedMatch());
    expect(expectError(s, { type: 'setReady', playerId: 'p1', ready: true }, ctxAt(5_000))).toBe(
      'wrong-phase',
    );
  });
});

describe('auto rounds', () => {
  it('reveals the prompt when the countdown expires and starts the clock there', () => {
    const start = seatedMatch(1_000);
    const live = intoChallenge(start);
    expect(live.phase).toBe('challenge');
    expect(live.round?.startedAt).toBe(start.phaseEndsAt);
  });

  it('keeps the full answer window open so a slower, better answer can win', () => {
    let s = intoChallenge(seatedMatch(0));
    const startedAt = s.round!.startedAt;
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p2',
        roundId: s.round!.id,
        evidenceId: 'e1',
        auto: { matched: true, confidence: 0.9, reason: 'ok' },
      },
      ctxAt(startedAt + 2_400),
    );
    // Still open, so an opponent half a second behind is not erased.
    expect(s.phase).toBe('challenge');
    expect(s.phaseEndsAt).toBe(startedAt + 20_000);

    s = tick(s, ctxAt(s.phaseEndsAt));
    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.winnerId).toBe('p2');
    expect(s.round?.outcome?.reason).toBe('only-valid');
    expect(s.players.p2?.score).toBe(1);
    expect(s.players.p1?.score).toBe(0);
  });

  it('records a photo finish as a race, not as a no-show', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const startedAt = s.round!.startedAt;
    const won = { matched: true, confidence: 1, reason: 'ok' };

    s = apply(
      s,
      { type: 'submit', playerId: 'p1', roundId, evidenceId: 'a', auto: won },
      ctxAt(startedAt + 3_000),
    );
    // Sixty milliseconds later — which used to be "ran out of time".
    s = apply(
      s,
      { type: 'submit', playerId: 'p2', roundId, evidenceId: 'b', auto: won },
      ctxAt(startedAt + 3_060),
    );

    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.reason).toBe('faster');
    expect(s.round?.outcome?.winnerId).toBe('p1');
    const loser = s.round?.outcome?.perPlayer.p2;
    expect(loser?.valid).toBe(true);
    expect(loser?.elapsedMs).toBe(3_060);
  });

  it('never extends a round past its own deadline', () => {
    let s = intoChallenge(seatedMatch(0));
    const deadline = s.phaseEndsAt;
    // A winning answer with less than the window left must not buy extra time.
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p1',
        roundId: s.round!.id,
        evidenceId: 'a',
        auto: { matched: true, confidence: 1, reason: 'ok' },
      },
      ctxAt(deadline - 100),
    );
    expect(s.phaseEndsAt).toBe(deadline);
  });

  it('awards the round to whoever was faster when both are valid', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const started = s.round!.startedAt;
    // A near-simultaneous pair: the server clock, not the client, decides.
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p1',
        roundId,
        evidenceId: 'a',
        auto: { matched: false, confidence: 0.1, reason: 'no' },
      },
      ctxAt(started + 1_000),
    );
    expect(s.phase).toBe('challenge');
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p2',
        roundId,
        evidenceId: 'b',
        auto: { matched: true, confidence: 0.9, reason: 'yes' },
      },
      ctxAt(started + 1_200),
    );
    expect(s.round?.outcome?.winnerId).toBe('p2');
  });

  it('scores a draw when nobody manages it', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const started = s.round!.startedAt;
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p1',
        roundId,
        evidenceId: 'a',
        auto: { matched: false, confidence: 0, reason: 'no' },
      },
      ctxAt(started + 900),
    );
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p2',
        roundId,
        evidenceId: 'b',
        auto: { matched: false, confidence: 0, reason: 'no' },
      },
      ctxAt(started + 950),
    );
    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.winnerId).toBeNull();
    expect(s.round?.outcome?.reason).toBe('both-failed');
    expect(s.players.p1?.score).toBe(0);
    expect(s.players.p2?.score).toBe(0);
  });

  it('resolves as no-submissions when the timer runs out empty', () => {
    let s = intoChallenge(seatedMatch(0));
    s = tick(s, ctxAt(s.phaseEndsAt));
    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.reason).toBe('no-submissions');
    expect(s.round?.outcome?.perPlayer.p1?.note).toBe('Ran out of time');
  });

  it('rejects a second submission from the same player', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const ctx = ctxAt(s.round!.startedAt + 500);
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p1',
        roundId,
        evidenceId: 'a',
        auto: { matched: false, confidence: 0, reason: 'no' },
      },
      ctx,
    );
    expect(expectError(s, { type: 'submit', playerId: 'p1', roundId, evidenceId: 'a2' }, ctx)).toBe(
      'already-submitted',
    );
  });

  it('rejects a submission aimed at a stale round', () => {
    const s = intoChallenge(seatedMatch(0));
    expect(
      expectError(
        s,
        { type: 'submit', playerId: 'p1', roundId: 'nope', evidenceId: 'a' },
        ctxAt(5_000),
      ),
    ).toBe('wrong-round');
  });

  it('rejects a submission from someone who is not in the room', () => {
    const s = intoChallenge(seatedMatch(0));
    expect(
      expectError(
        s,
        { type: 'submit', playerId: 'ghost', roundId: s.round!.id, evidenceId: 'a' },
        ctxAt(5_000),
      ),
    ).toBe('not-in-room');
  });
});

describe('automatic judging only', () => {
  it('replaces an unjudgeable deck with camera tasks', () => {
    const state = seatedMatch(0, [PEER]);
    expect(state.round?.judging).toBe('auto');
    expect(state.round?.challengeId).not.toBe(PEER.id);
  });
  it.each([true, false])('never accepts player votes (approve=%s)', (approve) => {
    const state = intoChallenge(seatedMatch(0));
    const original = structuredClone(state);
    expect(expectError(state, { type: 'vote', playerId: 'p1', targetId: 'p2',
      roundId: state.round!.id, approve }, ctxAt(4000))).toBe('already-decided');
    expect(state).toEqual(original);
  });
  it('skips unverifiable evidence without approving it by default', () => {
    let state = intoChallenge(seatedMatch(0));
    state = apply(state, { type: 'downgradeJudging', roundId: state.round!.id, reason: 'no-baseline' }, ctxAt(4000));
    state = apply(state, { type: 'submit', playerId: 'p1', roundId: state.round!.id, evidenceId: 'x' }, ctxAt(5000));
    state = tick(state, ctxAt(state.phaseEndsAt));
    expect(state.round?.judging).toBe('auto');
    expect(state.round?.outcome?.winnerId).toBeNull();
    expect(state.round?.outcome?.reason).toBe('verification-unavailable');
    expect(state.players.p1?.score).toBe(0);
  });
  it('awards higher quality even when its photo arrives later', () => {
    let state = intoChallenge(seatedMatch(0));
    const roundId = state.round!.id;
    const start = state.round!.startedAt;
    for (const [playerId, score, elapsed] of [['p1', 71, 1000], ['p2', 93, 7000]] as const) {
      state = apply(state, { type: 'submit', playerId, roundId, evidenceId: playerId,
        auto: { matched: true, confidence: 0.9, reason: 'Colour found.',
          evaluation: { score, criterion: 'color', label: 'Object', color: 'red' } } }, ctxAt(start + elapsed));
    }
    expect(state.round?.outcome?.winnerId).toBe('p2');
    expect(state.round?.outcome?.reason).toBe('better-answer');
    expect(state.round?.outcome?.perPlayer.p2?.evaluation?.score).toBe(93);
  });
});

describe('match lifecycle', () => {
  function winRound(
    state: MatchState,
    winner: 'p1' | 'p2',
    at: number,
    pool?: readonly Challenge[],
  ): MatchState {
    const ctx = (now: number) => (pool ? ctxAt(now, pool) : ctxAt(now));
    const live = state.phase === 'countdown' ? tick(state, ctx(state.phaseEndsAt)) : state;
    const submitted = apply(
      live,
      {
        type: 'submit',
        playerId: winner,
        roundId: live.round!.id,
        evidenceId: `e-${winner}-${live.round!.number}`,
        auto: { matched: true, confidence: 1, reason: 'ok' },
      },
      ctx(live.round!.startedAt + at),
    );
    // The photo-finish window closes on the next tick.
    return tick(submitted, ctx(submitted.phaseEndsAt));
  }

  it('runs rounds back to back until the target is reached', () => {
    let s = seatedMatch(0);
    for (let i = 0; i < 3; i++) {
      s = winRound(s, 'p1', 1_000);
      expect(s.phase).toBe('roundResult');
      s = tick(s, ctxAt(s.phaseEndsAt));
    }
    expect(s.phase).toBe('matchResult');
    expect(s.winnerId).toBe('p1');
    expect(s.endReason).toBe('target-reached');
    expect(s.players.p1?.score).toBe(3);
  });

  it('does not repeat a challenge inside one match', () => {
    let s = seatedMatch(0, [AUTO, AUTO_2, { ...AUTO, id: 'test-auto-3' }]);
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const live = tick(s, ctxAt(s.phaseEndsAt, [AUTO, AUTO_2, { ...AUTO, id: 'test-auto-3' }]));
      seen.push(live.round!.challengeId);
      s = tick(live, ctxAt(live.phaseEndsAt, [AUTO, AUTO_2, { ...AUTO, id: 'test-auto-3' }]));
      if (s.phase === 'judging') s = tick(s, ctxAt(s.phaseEndsAt, [AUTO, AUTO_2, { ...AUTO, id: 'test-auto-3' }]));
      s = tick(s, ctxAt(s.phaseEndsAt, [AUTO, AUTO_2, { ...AUTO, id: 'test-auto-3' }]));
    }
    expect(new Set(seen).size).toBe(3);
  });

  it('resets cleanly for a rematch once both players ask', () => {
    let s = seatedMatch(0);
    for (let i = 0; i < 3; i++) {
      s = winRound(s, 'p1', 1_000);
      s = tick(s, ctxAt(s.phaseEndsAt));
    }
    expect(s.phase).toBe('matchResult');
    s = apply(s, { type: 'rematch', playerId: 'p1' }, ctxAt(500_000));
    expect(s.phase).toBe('matchResult');
    s = apply(s, { type: 'rematch', playerId: 'p2' }, ctxAt(500_100));
    expect(s.phase).toBe('lobby');
    expect(s.roundNumber).toBe(0);
    expect(s.players.p1?.score).toBe(0);
    expect(s.playedChallengeIds).toEqual([]);
    expect(s.history).toEqual([]);
    expect(s.winnerId).toBeNull();
    // Camera state survives a rematch: nobody should re-grant permission.
    expect(s.players.p1?.cameraReady).toBe(true);
  });

  it('does not deal the rematch the deck they have just put down', () => {
    // Enough of a deck that avoiding the last match is actually possible.
    const deck = Array.from({ length: 8 }, (_, i) => ({
      ...AUTO,
      id: `deck-${i}`,
      prompt: `SHOW SOMETHING NUMBER ${i}`,
    }));
    let s = seatedMatch(0, deck);
    for (let i = 0; i < 3; i++) {
      s = winRound(s, 'p1', 1_000, deck);
      s = tick(s, ctxAt(s.phaseEndsAt, deck));
    }
    expect(s.phase).toBe('matchResult');
    const justPlayed = [...s.recentChallengeIds];
    expect(justPlayed.length).toBe(3);

    s = apply(s, { type: 'rematch', playerId: 'p1' }, ctxAt(500_000, deck));
    s = apply(s, { type: 'rematch', playerId: 'p2' }, ctxAt(500_100, deck));
    // The in-match list is cleared; the room's memory of them is not.
    expect(s.playedChallengeIds).toEqual([]);
    expect(s.recentChallengeIds).toEqual(justPlayed);

    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctxAt(500_200, deck));
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctxAt(500_201, deck));
    expect(s.round).not.toBeNull();
    expect(justPlayed).not.toContain(s.round?.challengeId);
  });

  it('ends in a draw only after sudden death is exhausted', () => {
    let s = createMatch('ABCDE', 0, { winTarget: 99, maxRounds: 2, suddenDeathRounds: 1 });
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctx);

    for (let i = 0; i < 3; i++) {
      s = tick(s, ctxAt(s.phaseEndsAt)); // countdown -> challenge
      s = tick(s, ctxAt(s.phaseEndsAt)); // challenge -> roundResult (draw)
      expect(s.round?.outcome?.winnerId).toBeNull();
      s = tick(s, ctxAt(s.phaseEndsAt));
    }
    expect(s.phase).toBe('matchResult');
    expect(s.endReason).toBe('draw');
    expect(s.winnerId).toBeNull();
  });
});

describe('disconnects', () => {
  it('freezes the clock while a player is away and restores it on return', () => {
    let s = intoChallenge(seatedMatch(0));
    const deadline = s.phaseEndsAt;
    const startedAt = s.round!.startedAt;

    s = apply(s, { type: 'setConnected', playerId: 'p2', connected: false }, ctxAt(5_000));
    expect(s.pausedAt).toBe(5_000);

    // Time passing while paused must not consume the round.
    const stillPaused = tick(s, ctxAt(5_000 + DEFAULT_SETTINGS.disconnectGraceMs - 1));
    expect(stillPaused.phase).toBe('challenge');

    s = apply(s, { type: 'setConnected', playerId: 'p2', connected: true }, ctxAt(13_000));
    expect(s.pausedAt).toBeNull();
    expect(s.phaseEndsAt).toBe(deadline + 8_000);
    expect(s.round?.startedAt).toBe(startedAt + 8_000);
  });

  it('refuses submissions while the match is paused', () => {
    let s = intoChallenge(seatedMatch(0));
    s = apply(s, { type: 'setConnected', playerId: 'p2', connected: false }, ctxAt(5_000));
    expect(
      expectError(
        s,
        { type: 'submit', playerId: 'p1', roundId: s.round!.id, evidenceId: 'a' },
        ctxAt(6_000),
      ),
    ).toBe('match-paused');
  });

  it('abandons the match when the grace period lapses', () => {
    let s = intoChallenge(seatedMatch(0));
    s = apply(s, { type: 'setConnected', playerId: 'p2', connected: false }, ctxAt(5_000));
    s = tick(s, ctxAt(5_000 + DEFAULT_SETTINGS.disconnectGraceMs));
    expect(s.phase).toBe('matchResult');
    expect(s.endReason).toBe('abandoned');
    expect(s.winnerId).toBeNull();
  });

  it('abandons the match when a player walks out mid-round', () => {
    let s = intoChallenge(seatedMatch(0));
    s = apply(s, { type: 'leave', playerId: 'p2' }, ctxAt(6_000));
    expect(s.phase).toBe('matchResult');
    expect(s.endReason).toBe('abandoned');
    expect(s.seats).toEqual(['p1', null]);
  });

  it('does not pause a match that has not started', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'setConnected', playerId: 'p1', connected: false }, ctxAt(1_000));
    expect(s.pausedAt).toBeNull();
  });
});

describe('invariants', () => {
  it('bumps the version on every accepted transition', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    const before = s.version;
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    expect(s.version).toBeGreaterThan(before);
  });

  it('leaves state untouched when a tick has nothing to do', () => {
    const s = intoChallenge(seatedMatch(0));
    expect(tick(s, ctxAt(s.round!.startedAt + 10))).toBe(s);
  });

  it('is idempotent once all due deadlines have fired', () => {
    const s = intoChallenge(seatedMatch(0));
    const once = tick(s, ctxAt(s.phaseEndsAt));
    const twice = tick(once, ctxAt(s.phaseEndsAt));
    expect(twice).toBe(once);
  });

  it('advances one phase and re-bases the clock when a tick arrives very late', () => {
    const s = intoChallenge(seatedMatch(0));
    // A server hiccup: no tick for a full minute. Players should get the round
    // result they were owed, not three rounds fast-forwarded past them.
    const late = s.phaseEndsAt + 60_000;
    const caughtUp = tick(s, ctxAt(late));
    expect(caughtUp.phase).toBe('roundResult');
    expect(caughtUp.phaseEndsAt).toBe(late + DEFAULT_SETTINGS.roundResultMs);
    expect(tick(caughtUp, ctxAt(late)).phase).toBe('roundResult');
  });

  it('knows who the opponent is', () => {
    const s = seatedMatch(0);
    expect(opponentOf(s, 'p1')?.id).toBe('p2');
    expect(opponentOf(s, 'p2')?.id).toBe('p1');
    expect(opponentIdOf(s, 'p1')).toBe('p2');
  });

  /**
   * Written inline — as it was in eight places in the client — "the seat that
   * is not mine" hands somebody who is not seated at all the other player, and
   * calls them their opponent.
   */
  it('has no opponent for someone who is not in the room', () => {
    const s = seatedMatch(0);
    expect(opponentOf(s, 'ghost')).toBeNull();
    expect(opponentIdOf(s, 'ghost')).toBeNull();
  });

  it('has no opponent while you are alone in the room', () => {
    let s = createMatch('ABCDE', 0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctxAt(0));
    expect(opponentOf(s, 'p1')).toBeNull();
    expect(opponentIdOf(s, 'p1')).toBeNull();
  });
});

describe('the series', () => {
  function playMatch(state: MatchState, winner: 'p1' | 'p2'): MatchState {
    let s = state;
    for (let i = 0; i < 3; i++) {
      const live = s.phase === 'countdown' ? tick(s, ctxAt(s.phaseEndsAt)) : s;
      s = apply(
        live,
        {
          type: 'submit',
          playerId: winner,
          roundId: live.round!.id,
          evidenceId: `e-${live.round!.number}`,
          auto: { matched: true, confidence: 1, reason: 'ok' },
        },
        ctxAt(live.round!.startedAt + 1_000),
      );
      s = tick(s, ctxAt(s.phaseEndsAt)); // photo-finish window closes
      s = tick(s, ctxAt(s.phaseEndsAt)); // result screen ends
    }
    return s;
  }

  function rematch(state: MatchState): MatchState {
    let s = apply(state, { type: 'rematch', playerId: 'p1' }, ctxAt(900_000));
    s = apply(s, { type: 'rematch', playerId: 'p2' }, ctxAt(900_001));
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctxAt(900_002));
    return apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctxAt(900_003));
  }

  it('starts empty', () => {
    expect(seatedMatch(0).series).toEqual({});
  });

  it('counts a match win', () => {
    const s = playMatch(seatedMatch(0), 'p1');
    expect(s.phase).toBe('matchResult');
    expect(s.series).toEqual({ p1: 1 });
  });

  it('survives a rematch, which is the whole point', () => {
    let s = playMatch(seatedMatch(0), 'p1');
    s = rematch(s);
    // The new match starts level.
    expect(s.players.p1?.score).toBe(0);
    expect(s.series).toEqual({ p1: 1 });

    s = playMatch(s, 'p2');
    expect(s.series).toEqual({ p1: 1, p2: 1 });
  });

  it('does not award a series point for an abandoned match', () => {
    let s = intoChallenge(seatedMatch(0));
    s = apply(s, { type: 'leave', playerId: 'p2' }, ctxAt(6_000));
    expect(s.endReason).toBe('abandoned');
    expect(s.series).toEqual({});
  });

  it('ends the series when either player leaves for good', () => {
    let s = playMatch(seatedMatch(0), 'p1');
    expect(s.series.p1).toBe(1);
    // Whoever takes the empty seat must not inherit a scoreline they never
    // played, in either direction.
    s = apply(s, { type: 'leave', playerId: 'p2' }, ctxAt(900_000));
    expect(s.series).toEqual({});
  });
});

describe('prompts the players write themselves', () => {
  const customCtx = (now: number, pool?: readonly Challenge[]): EngineContext => ({ ...ctxAt(now, pool), aiAvailable: true });
  it('requires an AI referee for custom prompts', () => {
    let state = createMatch('ABCDE', 0);
    state = apply(state, { type: 'join', playerId: 'p1', name: 'Ada' }, ctxAt(0));
    expect(expectError(state, { type: 'addChallenge', playerId: 'p1', prompt: 'SHOW A MUG', id: 'c1' }, ctxAt(0))).toBe('ai-unavailable');
  });
  function add(state: MatchState, playerId: string, prompt: string, id: string): MatchState {
    return apply(state, { type: 'addChallenge', playerId, prompt, id }, customCtx(100));
  }

  it('starts with an empty deck', () => {
    expect(seatedMatch(0).customChallenges).toEqual([]);
  });

  it('accepts a prompt in the lobby and records who wrote it', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = customCtx(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = add(s, 'p1', 'SHOW YOUR OLDEST MUG', 'c1');
    expect(s.customChallenges).toEqual([
      { id: 'c1', prompt: 'SHOW YOUR OLDEST MUG', authorId: 'p1' },
    ]);
  });

  it('refuses one mid-match, so nobody adds a round they are set up to win', () => {
    const s = intoChallenge(seatedMatch(0));
    expect(
      expectError(
        s,
        { type: 'addChallenge', playerId: 'p1', prompt: 'SHOW A CAT', id: 'c1' },
        customCtx(5_000),
      ),
    ).toBe('wrong-phase');
  });

  it('refuses a duplicate and a full deck', () => {
    let s = createMatch('ABCDE', 0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, customCtx(0));
    s = add(s, 'p1', 'SHOW A CAT', 'c1');
    expect(
      expectError(
        s,
        { type: 'addChallenge', playerId: 'p1', prompt: 'SHOW A CAT', id: 'c2' },
        customCtx(0),
      ),
    ).toBe('duplicate-prompt');

    for (let i = 1; i < 4; i++) s = add(s, 'p1', `PROMPT NUMBER ${i}`, `c${i + 1}`);
    expect(
      expectError(
        s,
        { type: 'addChallenge', playerId: 'p1', prompt: 'ONE TOO MANY', id: 'cx' },
        customCtx(0),
      ),
    ).toBe('deck-full');
  });

  it('gives each player their own allowance', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = customCtx(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    for (let i = 0; i < 4; i++) s = add(s, 'p1', `ADA PROMPT ${i}`, `a${i}`);

    // Ada has used hers; Grace has not touched the deck.
    expect(
      expectError(s, { type: 'addChallenge', playerId: 'p1', prompt: 'ONE MORE', id: 'ax' }, ctx),
    ).toBe('deck-full');
    s = add(s, 'p2', 'GRACE PROMPT', 'g1');
    expect(s.customChallenges).toHaveLength(5);
  });

  it('lets only the author take one back out', () => {
    let s = seatedMatch(0, [AUTO, AUTO_2]);
    // Back to the lobby so the deck can be edited.
    s = createMatch('ABCDE', 0);
    const ctx = customCtx(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    s = add(s, 'p1', 'SHOW A CAT', 'c1');

    expect(expectError(s, { type: 'removeChallenge', playerId: 'p2', id: 'c1' }, ctx)).toBe(
      'not-your-prompt',
    );
    expect(expectError(s, { type: 'removeChallenge', playerId: 'p1', id: 'nope' }, ctx)).toBe(
      'no-such-prompt',
    );
    s = apply(s, { type: 'removeChallenge', playerId: 'p1', id: 'c1' }, ctx);
    expect(s.customChallenges).toEqual([]);
  });

  it('actually draws them into rounds', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = customCtx(0, [AUTO]);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    s = add(s, 'p1', 'SHOW YOUR OLDEST MUG', 'c1');
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctx);

    // Round one is always auto-judged, so the written prompt cannot be first.
    expect(s.round?.challengeId).toBe(AUTO.id);

    // Play on: with only one built-in in the pool, round two must be the
    // player's own, and it must be judged by the opponent.
    const pool = [AUTO];
    const seen: string[] = [];
    for (let i = 0; i < 2; i++) {
      s = tick(s, customCtx(s.phaseEndsAt, pool));
      seen.push(s.round!.challengeId);
      s = tick(s, customCtx(s.phaseEndsAt, pool));
      if (s.phase === 'judging') s = tick(s, customCtx(s.phaseEndsAt, pool));
      s = tick(s, customCtx(s.phaseEndsAt, pool));
    }
    expect(seen).toContain('c1');
    expect(challengeInRoom(s, 'c1')?.judging).toBe('peer');
    expect(challengeInRoom(s, 'c1')?.prompt).toBe('SHOW YOUR OLDEST MUG');
  });

  it('takes a player’s prompts with them when they leave', () => {
    let s = createMatch('ABCDE', 0);
    const ctx = customCtx(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    s = add(s, 'p1', 'ADA WROTE THIS', 'c1');
    s = add(s, 'p2', 'GRACE WROTE THIS', 'c2');

    s = apply(s, { type: 'leave', playerId: 'p1' }, ctx);
    // Whoever takes the seat next did not write it and should not have to play it.
    expect(s.customChallenges.map((c) => c.id)).toEqual(['c2']);
  });
});

describe('match length', () => {
  function lobby(): MatchState {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAt(0);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    return apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
  }

  it('offers lengths whose round cap leaves room to go the distance', () => {
    for (const length of MATCH_LENGTHS) {
      // Both players could win every round bar one and still finish.
      expect(length.maxRounds).toBeGreaterThanOrEqual(length.winTarget * 2 - 1);
    }
  });

  it('lets either player set it in the lobby', () => {
    let s = lobby();
    s = apply(s, { type: 'setWinTarget', playerId: 'p2', winTarget: 5 }, ctxAt(0));
    expect(s.settings.winTarget).toBe(5);
    expect(s.settings.maxRounds).toBe(15);
  });

  it('refuses a length that is not on offer', () => {
    const s = lobby();
    expect(expectError(s, { type: 'setWinTarget', playerId: 'p1', winTarget: 4 }, ctxAt(0))).toBe(
      'bad-setting',
    );
    expect(expectError(s, { type: 'setWinTarget', playerId: 'p1', winTarget: 99 }, ctxAt(0))).toBe(
      'bad-setting',
    );
  });

  it('refuses to move the finish line mid-match', () => {
    const s = intoChallenge(seatedMatch(0));
    expect(
      expectError(s, { type: 'setWinTarget', playerId: 'p1', winTarget: 5 }, ctxAt(5_000)),
    ).toBe('wrong-phase');
  });

  it('actually decides the match at the chosen length', () => {
    let s = lobby();
    s = apply(s, { type: 'setWinTarget', playerId: 'p1', winTarget: 2 }, ctxAt(0));
    const ctx = ctxAt(0);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctx);

    for (let i = 0; i < 2; i++) {
      const live = s.phase === 'countdown' ? tick(s, ctxAt(s.phaseEndsAt)) : s;
      s = apply(
        live,
        {
          type: 'submit',
          playerId: 'p1',
          roundId: live.round!.id,
          evidenceId: `e${i}`,
          auto: { matched: true, confidence: 1, reason: 'ok' },
        },
        ctxAt(live.round!.startedAt + 900),
      );
      s = tick(s, ctxAt(s.phaseEndsAt));
      s = tick(s, ctxAt(s.phaseEndsAt));
    }
    expect(s.phase).toBe('matchResult');
    expect(s.winnerId).toBe('p1');
    expect(s.players.p1?.score).toBe(2);
  });

  it('survives a rematch, so you do not have to set it every time', () => {
    let s = lobby();
    s = apply(s, { type: 'setWinTarget', playerId: 'p1', winTarget: 5 }, ctxAt(0));
    const ctx = ctxAt(0);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctx);
    s = apply(s, { type: 'leave', playerId: 'p2' }, ctxAt(1_000));
    expect(s.phase).toBe('matchResult');
    expect(s.settings.winTarget).toBe(5);
  });
});

describe('passing on a round', () => {
  it('ends the round early when both players give up', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const startedAt = s.round!.startedAt;

    s = apply(s, { type: 'pass', playerId: 'p1', roundId }, ctxAt(startedAt + 2_000));
    // One player passing must not end it: the other may still win.
    expect(s.phase).toBe('challenge');

    s = apply(s, { type: 'pass', playerId: 'p2', roundId }, ctxAt(startedAt + 2_500));
    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.winnerId).toBeNull();
  });

  it('says they passed rather than that they ran out of time', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    s = apply(s, { type: 'pass', playerId: 'p1', roundId }, ctxAt(s.round!.startedAt + 1_000));
    s = tick(s, ctxAt(s.phaseEndsAt));

    expect(s.round?.outcome?.perPlayer.p1?.note).toBe('Passed');
    expect(s.round?.outcome?.perPlayer.p2?.note).toBe('Ran out of time');
  });

  it('lets the other player still win it', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const startedAt = s.round!.startedAt;

    s = apply(s, { type: 'pass', playerId: 'p2', roundId }, ctxAt(startedAt + 1_000));
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p1',
        roundId,
        evidenceId: 'a',
        auto: { matched: true, confidence: 1, reason: 'ok' },
      },
      ctxAt(startedAt + 4_000),
    );
    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.winnerId).toBe('p1');
  });

  it('refuses to pass twice', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const ctx = ctxAt(s.round!.startedAt + 1_000);

    s = apply(s, { type: 'pass', playerId: 'p1', roundId }, ctx);
    expect(expectError(s, { type: 'pass', playerId: 'p1', roundId }, ctx)).toBe('already-passed');
  });

  it('refuses to pass after answering', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const ctx = ctxAt(s.round!.startedAt + 1_000);

    // A wrong answer leaves the round open, so there is still something to
    // refuse: you do not get to answer and then take it back.
    s = apply(
      s,
      {
        type: 'submit',
        playerId: 'p1',
        roundId,
        evidenceId: 'a',
        auto: { matched: false, confidence: 0, reason: 'no' },
      },
      ctx,
    );
    expect(s.phase).toBe('challenge');
    expect(expectError(s, { type: 'pass', playerId: 'p1', roundId }, ctx)).toBe(
      'already-submitted',
    );
  });

  it('is refused while the match is paused or between rounds', () => {
    let s = intoChallenge(seatedMatch(0));
    const roundId = s.round!.id;
    const paused = apply(
      s,
      { type: 'setConnected', playerId: 'p2', connected: false },
      ctxAt(5_000),
    );
    expect(expectError(paused, { type: 'pass', playerId: 'p1', roundId }, ctxAt(6_000))).toBe(
      'match-paused',
    );

    s = tick(s, ctxAt(s.phaseEndsAt));
    expect(s.phase).toBe('roundResult');
    expect(expectError(s, { type: 'pass', playerId: 'p1', roundId }, ctxAt(9_000))).toBe(
      'wrong-phase',
    );
  });

  it('does not let the player who passed judge the one who answered', () => {
    // Passing is giving up on the round. Handing the person who gave up a veto
    // over the person who did not is the cheapest denial in the game.
    const pool = [PEER];
    let s = intoChallenge(seatedMatch(0, pool), pool);
    const roundId = s.round!.id;
    const startedAt = s.round!.startedAt;

    s = apply(
      s,
      { type: 'submit', playerId: 'p1', roundId, evidenceId: 'a', auto: { matched: true, confidence: 1, reason: 'Verified' } },
      ctxAt(startedAt + 1_000, pool),
    );
    s = apply(s, { type: 'pass', playerId: 'p2', roundId }, ctxAt(startedAt + 1_500, pool));

    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.winnerId).toBe('p1');
  });

  it('settles at once when the pass lands before the answer', () => {
    // Same round, opposite order: it must not matter which action closed it.
    const pool = [PEER];
    let s = intoChallenge(seatedMatch(0, pool), pool);
    const roundId = s.round!.id;
    const startedAt = s.round!.startedAt;

    s = apply(s, { type: 'pass', playerId: 'p2', roundId }, ctxAt(startedAt + 1_000, pool));
    s = apply(
      s,
      { type: 'submit', playerId: 'p1', roundId, evidenceId: 'a', auto: { matched: true, confidence: 1, reason: 'Verified' } },
      ctxAt(startedAt + 1_500, pool),
    );

    expect(s.phase).toBe('roundResult');
    expect(s.round?.outcome?.winnerId).toBe('p1');
  });
});

describe('a round an AI referee takes', () => {
  // A real catalogue prompt, because whether the referee may take it is a
  // property of the catalogue rather than of a fixture.
  const AI_PROMPT = getChallenge('obj-face')!;
  const pool = [AI_PROMPT];

  function ctxAi(now: number, aiAvailable = true): EngineContext {
    return { now, newId: () => `r${++aiIds}`, random: () => 0.42, pool, aiAvailable };
  }
  let aiIds = 5_000;

  function seated(aiAvailable = true): MatchState {
    let s = createMatch('ABCDE', 0);
    const ctx = ctxAi(0, aiAvailable);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, ctx);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, ctx);
    s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, ctx);
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, ctx);
    return tick(s, ctxAi(s.phaseEndsAt, aiAvailable));
  }

  /** Both players answer, which closes the round and hands it to the referee. */
  function bothAnswer(state: MatchState): MatchState {
    const roundId = state.round!.id;
    const started = state.round!.startedAt;
    let s = apply(
      state,
      { type: 'submit', playerId: 'p1', roundId, evidenceId: 'a' },
      ctxAi(started + 1_000),
    );
    s = apply(
      s,
      { type: 'submit', playerId: 'p2', roundId, evidenceId: 'b' },
      ctxAi(started + 2_000),
    );
    return s;
  }

  it('deals the round to the referee when one is available', () => {
    const s = seated();
    expect(s.round?.judging).toBe('ai');
  });

  it('deals a camera task when no referee is configured', () => {
    const s = seated(false);
    expect(s.round?.judging).toBe('auto');
  });

  it('waits for the referee rather than offering a vote', () => {
    const s = bothAnswer(seated());
    expect(s.phase).toBe('judging');
    expect(s.round?.aiPending).toBe(true);

    // Nobody is asked to judge a round somebody else is already judging.
    expect(
      expectError(
        s,
        { type: 'vote', playerId: 'p1', roundId: s.round!.id, targetId: 'p2', approve: false },
        ctxAi(s.round!.startedAt + 3_000),
      ),
    ).toBe('already-decided');
  });

  it('settles the round on the verdicts, with speed breaking the tie', () => {
    const s = bothAnswer(seated());
    const roundId = s.round!.id;
    const settled = apply(
      s,
      {
        type: 'aiFinished',
        roundId,
        verdicts: {
          p1: { matched: true, confidence: 0.9, reason: 'A mug with a painted face.' },
          p2: { matched: true, confidence: 0.9, reason: 'A poster of a face.' },
        },
      },
      ctxAi(s.round!.startedAt + 4_000),
    );

    expect(settled.phase).toBe('roundResult');
    expect(settled.round?.aiPending).toBe(false);
    // Both answers stand, so the round is still a race — p1 was a second faster.
    expect(settled.round?.outcome?.winnerId).toBe('p1');
    expect(settled.round?.outcome?.perPlayer.p1?.note).toBe('A mug with a painted face.');
  });

  it('lets the referee rule an answer out', () => {
    const s = bothAnswer(seated());
    const settled = apply(
      s,
      {
        type: 'aiFinished',
        roundId: s.round!.id,
        verdicts: {
          p1: { matched: false, confidence: 0.95, reason: 'Nothing with a face is visible.' },
          p2: { matched: true, confidence: 0.9, reason: 'A poster of a face.' },
        },
      },
      ctxAi(s.round!.startedAt + 4_000),
    );

    expect(settled.round?.outcome?.winnerId).toBe('p2');
    expect(settled.round?.outcome?.perPlayer.p1?.valid).toBe(false);
  });

  it('skips an AI outage instead of asking players to judge', () => {
    const state = bothAnswer(seated());
    const settled = apply(state, { type: 'aiFinished', roundId: state.round!.id, verdicts: null }, ctxAi(state.round!.startedAt + 4000));
    expect(settled.phase).toBe('roundResult');
    expect(settled.round?.judging).toBe('ai');
    expect(settled.round?.outcome?.reason).toBe('verification-unavailable');
    expect(settled.round?.outcome?.winnerId).toBeNull();
  });

  it('does not punish anybody when the referee never answers at all', () => {
    // Unverified evidence cannot become a valid answer through a timeout.
    const s = bothAnswer(seated());
    const settled = tick(s, ctxAi(s.phaseEndsAt));

    expect(settled.phase).toBe('roundResult');
    expect(settled.round?.outcome?.winnerId).toBeNull();
    expect(settled.round?.outcome?.reason).toBe('verification-unavailable');
    expect(settled.round?.outcome?.perPlayer.p2?.valid).toBe(false);
  });

  it('ignores a verdict for a round that has already moved on', () => {
    const s = bothAnswer(seated());
    const settled = tick(s, ctxAi(s.phaseEndsAt));
    expect(
      expectError(
        settled,
        { type: 'aiFinished', roundId: s.round!.id, verdicts: null },
        ctxAi(s.phaseEndsAt + 100),
      ),
    ).toBe('wrong-phase');
  });
});

describe('whether a match counts for rating', () => {
  const pool = [AUTO, AUTO_2];

  /** Plays `rounds` rounds, with `answered` of them answered by p2. */
  function played(rounds: number, answeredByP2: number): MatchState {
    let s = createMatch('ABCDE', 0, { winTarget: 99, maxRounds: rounds, suddenDeathRounds: 0 });
    const c = ctxAt(0, pool);
    s = apply(s, { type: 'join', playerId: 'p1', name: 'Ada' }, c);
    s = apply(s, { type: 'join', playerId: 'p2', name: 'Grace' }, c);
    s = apply(s, { type: 'setCameraReady', playerId: 'p1', cameraReady: true }, c);
    s = apply(s, { type: 'setCameraReady', playerId: 'p2', cameraReady: true }, c);
    s = apply(s, { type: 'setReady', playerId: 'p1', ready: true }, c);
    s = apply(s, { type: 'setReady', playerId: 'p2', ready: true }, c);

    for (let round = 0; round < rounds; round++) {
      if (s.phase === 'countdown') s = tick(s, ctxAt(s.phaseEndsAt, pool));
      const roundId = s.round!.id;
      const started = s.round!.startedAt;
      const win = { matched: true, confidence: 1, reason: 'ok' };
      s = apply(
        s,
        { type: 'submit', playerId: 'p1', roundId, evidenceId: 'a', auto: win },
        ctxAt(started + 1_000, pool),
      );
      if (round < answeredByP2) {
        s = apply(
          s,
          { type: 'submit', playerId: 'p2', roundId, evidenceId: 'b', auto: win },
          ctxAt(started + 1_200, pool),
        );
      }
      s = tick(s, ctxAt(s.phaseEndsAt, pool));
      if (s.phase === 'roundResult') s = tick(s, ctxAt(s.phaseEndsAt, pool));
    }
    return s;
  }

  it('counts a match both of them actually played', () => {
    const s = played(4, 4);
    expect(s.phase).toBe('matchResult');
    expect(countsForRating(s)).toBe(true);
  });

  it('forgives a round somebody fumbled', () => {
    // Half is the line, so a bad connection or one missed round still counts.
    expect(countsForRating(played(4, 2))).toBe(true);
  });

  it('does not count a match one side sat out', () => {
    // The cheapest way to inflate a rating is a second tab that never answers.
    expect(countsForRating(played(4, 1))).toBe(false);
    expect(countsForRating(played(4, 0))).toBe(false);
  });

  it('does not count a match that was abandoned', () => {
    const s = played(4, 4);
    expect(countsForRating({ ...s, endReason: 'abandoned' })).toBe(false);
  });

  it('does not count a match that has not finished', () => {
    const s = played(4, 4);
    expect(countsForRating({ ...s, phase: 'challenge' })).toBe(false);
  });

  it('counts rounds answered per player', () => {
    const s = played(4, 2);
    expect(roundsAnswered(s.history, 'p1')).toBe(4);
    expect(roundsAnswered(s.history, 'p2')).toBe(2);
    expect(roundsAnswered(s.history, 'nobody')).toBe(0);
  });
});
