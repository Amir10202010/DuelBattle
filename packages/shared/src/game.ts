import type { Challenge, JudgingMode } from './challenges.js';
import { getChallenge, pickChallenge } from './challenges.js';
import type { RandomSource } from './ids.js';

export type PlayerId = string;

export type Phase = 'lobby' | 'countdown' | 'challenge' | 'judging' | 'roundResult' | 'matchResult';

export interface MatchSettings {
  /** Rounds a player must win to take the match. */
  winTarget: number;
  /** Rounds after which the match ends, unless the score is level. */
  maxRounds: number;
  /** Extra rounds allowed to break a tie before the match is called a draw. */
  suddenDeathRounds: number;
  countdownMs: number;
  judgingMs: number;
  roundResultMs: number;
  /** How long a disconnected player's seat is held before the match is abandoned. */
  disconnectGraceMs: number;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  winTarget: 3,
  maxRounds: 9,
  suddenDeathRounds: 4,
  countdownMs: 3200,
  judgingMs: 15_000,
  roundResultMs: 5_500,
  disconnectGraceMs: 45_000,
};

export interface PlayerState {
  id: PlayerId;
  name: string;
  seat: 0 | 1;
  connected: boolean;
  /** Camera permission granted and a live track is attached. */
  cameraReady: boolean;
  ready: boolean;
  score: number;
  /** Rounds where this player produced a valid answer; shown in the recap. */
  validAnswers: number;
  joinedAt: number;
  rematchVote: boolean;
}

export interface AutoVerdict {
  matched: boolean;
  confidence: number;
  reason: string;
}

export interface PeerVerdict {
  approve: boolean;
  voterId: PlayerId;
  votedAt: number;
}

export interface Submission {
  playerId: PlayerId;
  /** Server clock. Never taken from the client. */
  submittedAt: number;
  /** Milliseconds from prompt reveal to submission, server-computed. */
  elapsedMs: number;
  evidenceId: string;
  auto?: AutoVerdict;
  peer?: PeerVerdict;
}

export type RoundReason =
  | 'faster'
  | 'only-valid'
  | 'both-failed'
  | 'both-perfect-tie'
  | 'no-submissions';

export interface PlayerRoundResult {
  valid: boolean;
  elapsedMs: number | null;
  note: string;
}

export interface RoundOutcome {
  roundNumber: number;
  challengeId: string;
  judging: JudgingMode;
  winnerId: PlayerId | null;
  reason: RoundReason;
  perPlayer: Record<PlayerId, PlayerRoundResult>;
}

export interface RoundState {
  id: string;
  number: number;
  challengeId: string;
  judging: JudgingMode;
  /** Server clock at prompt reveal. Elapsed times are measured from here. */
  startedAt: number;
  submissions: Record<PlayerId, Submission>;
  outcome: RoundOutcome | null;
}

export type MatchEndReason = 'target-reached' | 'rounds-exhausted' | 'draw' | 'abandoned';

export interface MatchState {
  roomCode: string;
  createdAt: number;
  settings: MatchSettings;
  phase: Phase;
  /** Server timestamp at which the current phase expires. */
  phaseEndsAt: number;
  /** Seat -> player id. Seats are stable so colours and sides never swap. */
  seats: [PlayerId | null, PlayerId | null];
  players: Record<PlayerId, PlayerState>;
  round: RoundState | null;
  roundNumber: number;
  playedChallengeIds: string[];
  recentModes: JudgingMode[];
  history: RoundOutcome[];
  /**
   * Matches won in this room, across rematches. It is what makes the rematch
   * button mean something: a match you lost 3-1 is still 1-1 on the night.
   */
  series: Record<PlayerId, number>;
  /** Non-null while a player is disconnected mid-match; all timers are frozen. */
  pausedAt: number | null;
  pauseDeadline: number | null;
  winnerId: PlayerId | null;
  endReason: MatchEndReason | null;
  /** Bumped on every accepted transition so clients can drop stale snapshots. */
  version: number;
}

export interface EngineContext {
  now: number;
  random?: RandomSource;
  /** Injected so round ids are deterministic in tests. */
  newId: () => string;
  /**
   * Restricts which challenges this match can draw from. Used by tests and by
   * rooms that opt into a themed or custom deck.
   */
  pool?: readonly Challenge[];
}

export type Action =
  | { type: 'join'; playerId: PlayerId; name: string }
  | { type: 'leave'; playerId: PlayerId }
  | { type: 'setConnected'; playerId: PlayerId; connected: boolean }
  | { type: 'setCameraReady'; playerId: PlayerId; cameraReady: boolean }
  | { type: 'setReady'; playerId: PlayerId; ready: boolean }
  | { type: 'submit'; playerId: PlayerId; roundId: string; evidenceId: string; auto?: AutoVerdict }
  | { type: 'vote'; playerId: PlayerId; roundId: string; targetId: PlayerId; approve: boolean }
  | { type: 'rematch'; playerId: PlayerId }
  /**
   * Converts an auto-judged round to peer judging. Issued by the server when it
   * has no usable baseline frame for a player and therefore cannot verify the
   * answer itself. Handing the call to the opponent is honest; quietly failing
   * the player for a dropped frame is not.
   */
  | { type: 'downgradeJudging'; roundId: string; reason: string };

export type ActionError =
  | 'room-full'
  | 'name-taken'
  | 'not-in-room'
  | 'wrong-phase'
  | 'wrong-round'
  | 'already-submitted'
  | 'already-voted'
  | 'cannot-vote-for-self'
  | 'no-such-target'
  | 'no-submission-to-judge'
  | 'camera-required'
  | 'match-paused';

export type Result =
  | { ok: true; state: MatchState }
  | { ok: false; error: ActionError };

export function createMatch(
  roomCode: string,
  now: number,
  settings: Partial<MatchSettings> = {},
): MatchState {
  return {
    roomCode,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    phase: 'lobby',
    phaseEndsAt: Number.POSITIVE_INFINITY,
    seats: [null, null],
    players: {},
    round: null,
    roundNumber: 0,
    playedChallengeIds: [],
    recentModes: [],
    history: [],
    series: {},
    pausedAt: null,
    pauseDeadline: null,
    winnerId: null,
    endReason: null,
    version: 0,
  };
}

export function playersInSeatOrder(state: MatchState): PlayerState[] {
  return state.seats
    .map((id) => (id ? state.players[id] : undefined))
    .filter((p): p is PlayerState => Boolean(p));
}

export function opponentOf(state: MatchState, playerId: PlayerId): PlayerState | null {
  if (!state.seats.includes(playerId)) return null;
  const other = state.seats.find((id) => id !== null && id !== playerId);
  return other ? state.players[other] ?? null : null;
}

export function isMatchActive(phase: Phase): boolean {
  return phase === 'countdown' || phase === 'challenge' || phase === 'judging' || phase === 'roundResult';
}

function bump(state: MatchState): MatchState {
  return { ...state, version: state.version + 1 };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export function reduce(state: MatchState, action: Action, ctx: EngineContext): Result {
  switch (action.type) {
    case 'join':
      return join(state, action.playerId, action.name, ctx);
    case 'leave':
      return leave(state, action.playerId, ctx);
    case 'setConnected':
      return setConnected(state, action.playerId, action.connected, ctx);
    case 'setCameraReady':
      return patchPlayer(state, action.playerId, (p) => ({
        ...p,
        cameraReady: action.cameraReady,
        // Losing the camera drops you out of the ready state; you cannot play blind.
        ready: action.cameraReady ? p.ready : false,
      }));
    case 'setReady':
      return setReady(state, action.playerId, action.ready, ctx);
    case 'submit':
      return submit(state, action, ctx);
    case 'vote':
      return vote(state, action, ctx);
    case 'rematch':
      return rematch(state, action.playerId, ctx);
    case 'downgradeJudging':
      return downgradeJudging(state, action.roundId);
  }
}

function downgradeJudging(state: MatchState, roundId: string): Result {
  if (state.phase !== 'countdown' && state.phase !== 'challenge') {
    return { ok: false, error: 'wrong-phase' };
  }
  if (!state.round || state.round.id !== roundId) return { ok: false, error: 'wrong-round' };
  if (state.round.judging === 'peer') return { ok: true, state };
  return {
    ok: true,
    state: bump({ ...state, round: { ...state.round, judging: 'peer' } }),
  };
}

function patchPlayer(
  state: MatchState,
  playerId: PlayerId,
  fn: (p: PlayerState) => PlayerState,
): Result {
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'not-in-room' };
  return {
    ok: true,
    state: bump({ ...state, players: { ...state.players, [playerId]: fn(player) } }),
  };
}

function join(state: MatchState, playerId: PlayerId, name: string, ctx: EngineContext): Result {
  const existing = state.players[playerId];
  if (existing) {
    // Reconnect of a known player: restore presence without disturbing the match.
    const reconnected = {
      ...state,
      players: { ...state.players, [playerId]: { ...existing, connected: true } },
    };
    return { ok: true, state: bump(resume(reconnected, ctx)) };
  }

  const seat = state.seats.findIndex((id) => id === null);
  if (seat === -1) return { ok: false, error: 'room-full' };

  const trimmed = name.trim();
  const clash = Object.values(state.players).some(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) return { ok: false, error: 'name-taken' };

  const seats: [PlayerId | null, PlayerId | null] = [...state.seats];
  seats[seat] = playerId;

  const player: PlayerState = {
    id: playerId,
    name: trimmed,
    seat: seat as 0 | 1,
    connected: true,
    cameraReady: false,
    ready: false,
    score: 0,
    validAnswers: 0,
    joinedAt: ctx.now,
    rematchVote: false,
  };

  return { ok: true, state: bump({ ...state, seats, players: { ...state.players, [playerId]: player } }) };
}

function leave(state: MatchState, playerId: PlayerId, ctx: EngineContext): Result {
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'not-in-room' };

  const players = { ...state.players };
  delete players[playerId];
  const seats: [PlayerId | null, PlayerId | null] = [...state.seats];
  seats[player.seat] = null;

  // A series is between two people. When one of them goes, it is over — the
  // alternative hands whoever takes the seat next a deficit they never played.
  let next: MatchState = {
    ...state,
    players,
    seats,
    series: {},
    pausedAt: null,
    pauseDeadline: null,
  };

  if (isMatchActive(state.phase)) {
    next = endMatch(next, 'abandoned', ctx);
  } else if (state.phase === 'matchResult') {
    // Leaving the results screen just frees the seat.
    next = { ...next, players: clearRematchVotes(players) };
  }
  return { ok: true, state: bump(next) };
}

function setConnected(
  state: MatchState,
  playerId: PlayerId,
  connected: boolean,
  ctx: EngineContext,
): Result {
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'not-in-room' };
  if (player.connected === connected) return { ok: true, state };

  const players = { ...state.players, [playerId]: { ...player, connected } };
  const next = { ...state, players };
  return { ok: true, state: bump(connected ? resume(next, ctx) : pauseIfNeeded(next, ctx)) };
}

/**
 * Freezes every phase timer while a player is away. A dropped wifi connection
 * mid-round should cost the round, not the match.
 */
function pauseIfNeeded(state: MatchState, ctx: EngineContext): MatchState {
  if (state.pausedAt !== null) return state;
  if (!isMatchActive(state.phase)) return state;
  if (playersInSeatOrder(state).every((p) => p.connected)) return state;
  return {
    ...state,
    pausedAt: ctx.now,
    pauseDeadline: ctx.now + state.settings.disconnectGraceMs,
  };
}

/** Unfreezes the match, shifting every deadline by however long we were paused. */
function resume(state: MatchState, ctx: EngineContext): MatchState {
  if (state.pausedAt === null) return state;
  if (!playersInSeatOrder(state).every((p) => p.connected)) return state;

  const frozenFor = Math.max(0, ctx.now - state.pausedAt);
  return {
    ...state,
    round: state.round
      ? { ...state.round, startedAt: state.round.startedAt + frozenFor }
      : null,
    phaseEndsAt: Number.isFinite(state.phaseEndsAt)
      ? state.phaseEndsAt + frozenFor
      : state.phaseEndsAt,
    pausedAt: null,
    pauseDeadline: null,
  };
}

function setReady(state: MatchState, playerId: PlayerId, ready: boolean, ctx: EngineContext): Result {
  if (state.phase !== 'lobby') return { ok: false, error: 'wrong-phase' };
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'not-in-room' };
  if (ready && !player.cameraReady) return { ok: false, error: 'camera-required' };

  const players = { ...state.players, [playerId]: { ...player, ready } };
  let next: MatchState = { ...state, players };

  const seated = playersInSeatOrder(next);
  const everyoneReady =
    seated.length === 2 && seated.every((p) => p.ready && p.cameraReady && p.connected);
  if (everyoneReady) next = startRound(next, ctx);

  return { ok: true, state: bump(next) };
}

function submit(
  state: MatchState,
  action: Extract<Action, { type: 'submit' }>,
  ctx: EngineContext,
): Result {
  if (state.pausedAt !== null) return { ok: false, error: 'match-paused' };
  if (state.phase !== 'challenge' || !state.round) return { ok: false, error: 'wrong-phase' };
  if (state.round.id !== action.roundId) return { ok: false, error: 'wrong-round' };
  if (!state.players[action.playerId]) return { ok: false, error: 'not-in-room' };
  if (state.round.submissions[action.playerId]) return { ok: false, error: 'already-submitted' };

  const submission: Submission = {
    playerId: action.playerId,
    submittedAt: ctx.now,
    elapsedMs: Math.max(0, ctx.now - state.round.startedAt),
    evidenceId: action.evidenceId,
    ...(action.auto ? { auto: action.auto } : {}),
  };

  const round: RoundState = {
    ...state.round,
    submissions: { ...state.round.submissions, [action.playerId]: submission },
  };
  let next: MatchState = { ...state, round };

  const seated = playersInSeatOrder(next);
  const everyoneAnswered = seated.every((p) => round.submissions[p.id]);

  if (round.judging === 'auto') {
    // An auto round is over the moment a valid answer lands: the race is the game.
    const someoneMatched = Object.values(round.submissions).some((s) => s.auto?.matched);
    if (someoneMatched || everyoneAnswered) next = closeChallenge(next, ctx);
  } else if (everyoneAnswered) {
    next = openJudging(next, ctx);
  }

  return { ok: true, state: bump(next) };
}

function vote(
  state: MatchState,
  action: Extract<Action, { type: 'vote' }>,
  ctx: EngineContext,
): Result {
  if (state.pausedAt !== null) return { ok: false, error: 'match-paused' };
  if (state.phase !== 'judging' || !state.round) return { ok: false, error: 'wrong-phase' };
  if (state.round.id !== action.roundId) return { ok: false, error: 'wrong-round' };
  if (!state.players[action.playerId]) return { ok: false, error: 'not-in-room' };
  if (action.targetId === action.playerId) return { ok: false, error: 'cannot-vote-for-self' };
  if (!state.players[action.targetId]) return { ok: false, error: 'no-such-target' };

  const target = state.round.submissions[action.targetId];
  if (!target) return { ok: false, error: 'no-submission-to-judge' };
  if (target.peer) return { ok: false, error: 'already-voted' };

  const round: RoundState = {
    ...state.round,
    submissions: {
      ...state.round.submissions,
      [action.targetId]: {
        ...target,
        peer: { approve: action.approve, voterId: action.playerId, votedAt: ctx.now },
      },
    },
  };
  let next: MatchState = { ...state, round };

  const pending = Object.values(round.submissions).filter((s) => !s.peer);
  if (pending.length === 0) next = resolveRound(next, ctx);

  return { ok: true, state: bump(next) };
}

function rematch(state: MatchState, playerId: PlayerId, ctx: EngineContext): Result {
  if (state.phase !== 'matchResult') return { ok: false, error: 'wrong-phase' };
  const player = state.players[playerId];
  if (!player) return { ok: false, error: 'not-in-room' };

  const players = { ...state.players, [playerId]: { ...player, rematchVote: true } };
  let next: MatchState = { ...state, players };

  const seated = playersInSeatOrder(next);
  if (seated.length === 2 && seated.every((p) => p.rematchVote && p.connected)) {
    next = resetForRematch(next, ctx);
  }
  return { ok: true, state: bump(next) };
}

// ---------------------------------------------------------------------------
// Phase transitions
// ---------------------------------------------------------------------------

function startRound(state: MatchState, ctx: EngineContext): MatchState {
  const challenge = pickChallenge({
    used: state.playedChallengeIds,
    roundNumber: state.roundNumber + 1,
    recentModes: state.recentModes,
    ...(ctx.random ? { random: ctx.random } : {}),
    ...(ctx.pool ? { pool: ctx.pool } : {}),
  });

  const roundNumber = state.roundNumber + 1;
  const round: RoundState = {
    id: ctx.newId(),
    number: roundNumber,
    challengeId: challenge.id,
    judging: challenge.judging,
    // Set for real when the countdown ends and the prompt is revealed.
    startedAt: ctx.now + state.settings.countdownMs,
    submissions: {},
    outcome: null,
  };

  return {
    ...state,
    phase: 'countdown',
    phaseEndsAt: ctx.now + state.settings.countdownMs,
    round,
    roundNumber,
    playedChallengeIds: [...state.playedChallengeIds, challenge.id],
    recentModes: [...state.recentModes, challenge.judging].slice(-4),
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, { ...p, ready: false }]),
    ),
  };
}

function beginChallenge(state: MatchState, ctx: EngineContext): MatchState {
  if (!state.round) return state;
  const challenge = getChallenge(state.round.challengeId);
  const duration = challenge?.durationMs ?? 25_000;
  return {
    ...state,
    phase: 'challenge',
    phaseEndsAt: ctx.now + duration,
    round: { ...state.round, startedAt: ctx.now },
  };
}

/** Challenge window is over: either resolve immediately, or open judging. */
function closeChallenge(state: MatchState, ctx: EngineContext): MatchState {
  if (!state.round) return state;
  if (state.round.judging === 'auto') return resolveRound(state, ctx);

  const hasSubmissions = Object.keys(state.round.submissions).length > 0;
  return hasSubmissions ? openJudging(state, ctx) : resolveRound(state, ctx);
}

function openJudging(state: MatchState, ctx: EngineContext): MatchState {
  return { ...state, phase: 'judging', phaseEndsAt: ctx.now + state.settings.judgingMs };
}

function resolveRound(state: MatchState, ctx: EngineContext): MatchState {
  const round = state.round;
  if (!round) return state;

  const seated = playersInSeatOrder(state);
  const perPlayer: Record<PlayerId, PlayerRoundResult> = {};
  const valid: { id: PlayerId; elapsedMs: number }[] = [];

  for (const player of seated) {
    const submission = round.submissions[player.id];
    if (!submission) {
      perPlayer[player.id] = { valid: false, elapsedMs: null, note: 'Ran out of time' };
      continue;
    }
    const isValid =
      round.judging === 'auto'
        ? Boolean(submission.auto?.matched)
        : // No vote by the deadline counts as approval: abstaining should never
          // be a cheaper way to deny a point than actually judging.
          submission.peer?.approve ?? true;

    perPlayer[player.id] = {
      valid: isValid,
      elapsedMs: submission.elapsedMs,
      note: isValid ? noteForValid(round.judging, submission) : noteForInvalid(round.judging, submission),
    };
    if (isValid) valid.push({ id: player.id, elapsedMs: submission.elapsedMs });
  }

  let winnerId: PlayerId | null = null;
  let reason: RoundReason;
  if (valid.length === 0) {
    reason = Object.keys(round.submissions).length === 0 ? 'no-submissions' : 'both-failed';
  } else if (valid.length === 1) {
    winnerId = valid[0]!.id;
    reason = 'only-valid';
  } else {
    const sorted = [...valid].sort((a, b) => a.elapsedMs - b.elapsedMs);
    if (sorted[0]!.elapsedMs === sorted[1]!.elapsedMs) {
      reason = 'both-perfect-tie';
    } else {
      winnerId = sorted[0]!.id;
      reason = 'faster';
    }
  }

  const outcome: RoundOutcome = {
    roundNumber: round.number,
    challengeId: round.challengeId,
    judging: round.judging,
    winnerId,
    reason,
    perPlayer,
  };
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [
      id,
      {
        ...p,
        score: p.score + (winnerId === id ? 1 : 0),
        validAnswers: p.validAnswers + (perPlayer[id]?.valid ? 1 : 0),
      },
    ]),
  );

  const next: MatchState = {
    ...state,
    players,
    phase: 'roundResult',
    phaseEndsAt: ctx.now + state.settings.roundResultMs,
    round: { ...round, outcome },
    history: [...state.history, outcome],
  };
  return next;
}

function noteForValid(judging: JudgingMode, s: Submission): string {
  if (judging === 'auto') return s.auto?.reason ?? 'Verified';
  if (!s.peer) return 'Unjudged — counted as good';
  return 'Approved by your opponent';
}

function noteForInvalid(judging: JudgingMode, s: Submission): string {
  if (judging === 'auto') return s.auto?.reason ?? 'Not detected';
  return 'Rejected by your opponent';
}

function afterRoundResult(state: MatchState, ctx: EngineContext): MatchState {
  const seated = playersInSeatOrder(state);
  const leader = [...seated].sort((a, b) => b.score - a.score)[0];
  const tied = seated.length === 2 && seated[0]!.score === seated[1]!.score;

  if (leader && leader.score >= state.settings.winTarget) {
    return endMatch(state, 'target-reached', ctx);
  }
  if (state.roundNumber >= state.settings.maxRounds) {
    if (!tied) return endMatch(state, 'rounds-exhausted', ctx);
    if (state.roundNumber >= state.settings.maxRounds + state.settings.suddenDeathRounds) {
      return endMatch(state, 'draw', ctx);
    }
  }
  return startRound(state, ctx);
}

function endMatch(state: MatchState, reason: MatchEndReason, _ctx: EngineContext): MatchState {
  const seated = playersInSeatOrder(state);
  const sorted = [...seated].sort((a, b) => b.score - a.score);
  const winnerId =
    reason === 'draw' || reason === 'abandoned'
      ? null
      : sorted.length === 2 && sorted[0]!.score === sorted[1]!.score
        ? null
        : sorted[0]?.id ?? null;

  return {
    ...state,
    phase: 'matchResult',
    phaseEndsAt: Number.POSITIVE_INFINITY,
    winnerId,
    endReason: reason,
    // An abandoned match is not a win; nobody outplayed anybody.
    series:
      winnerId && reason !== 'abandoned'
        ? { ...state.series, [winnerId]: (state.series[winnerId] ?? 0) + 1 }
        : state.series,
    pausedAt: null,
    pauseDeadline: null,
    players: clearRematchVotes(state.players),
  };
}

function clearRematchVotes(players: Record<PlayerId, PlayerState>): Record<PlayerId, PlayerState> {
  return Object.fromEntries(
    Object.entries(players).map(([id, p]) => [id, { ...p, rematchVote: false, ready: false }]),
  );
}

function resetForRematch(state: MatchState, _ctx: EngineContext): MatchState {
  return {
    ...state,
    phase: 'lobby',
    phaseEndsAt: Number.POSITIVE_INFINITY,
    round: null,
    roundNumber: 0,
    playedChallengeIds: [],
    recentModes: [],
    history: [],
    winnerId: null,
    endReason: null,
    pausedAt: null,
    pauseDeadline: null,
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [
        id,
        { ...p, score: 0, validAnswers: 0, ready: false, rematchVote: false },
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * Advances the single deadline-driven transition that is due, if any. The
 * server calls this on a fixed interval; tests call it with explicit
 * timestamps. Calling it again with the same `now` is a no-op.
 */
export function tick(state: MatchState, ctx: EngineContext): MatchState {
  if (state.pausedAt !== null) {
    if (state.pauseDeadline !== null && ctx.now >= state.pauseDeadline) {
      return bump(endMatch({ ...state, pausedAt: null, pauseDeadline: null }, 'abandoned', ctx));
    }
    return state;
  }

  if (!Number.isFinite(state.phaseEndsAt) || ctx.now < state.phaseEndsAt) return state;

  // Exactly one transition per call, and the next deadline is measured from
  // `now` rather than from the deadline we just missed. If the process stalls,
  // players get a late round rather than three rounds they never saw.
  switch (state.phase) {
    case 'countdown':
      return bump(beginChallenge(state, ctx));
    case 'challenge':
      return bump(closeChallenge(state, ctx));
    case 'judging':
      return bump(resolveRound(state, ctx));
    case 'roundResult':
      return bump(afterRoundResult(state, ctx));
    default:
      return state;
  }
}
