import type { Challenge, JudgingMode } from './challenges.js';
import {
  MAX_CUSTOM_PER_PLAYER,
  allChallengesPool,
  promptExists,
  customChallenge,
  getChallenge,
  isAiVerifiable,
  pickChallenge,
} from './challenges.js';
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

/**
 * How long the round stays open after someone wins it.
 *
 * Ending an auto round the instant a valid answer lands means an opponent who
 * locked in fifty milliseconds later is recorded as never having answered, and
 * told they ran out of time — in the closest, best moment the game has. This
 * window lets both answers land so the round is decided on elapsed time and the
 * loser is told they were slower, which is what actually happened.
 */
/** How many recent prompts a room remembers between matches. */
const RECENT_CHALLENGE_MEMORY = 20;

export const PHOTO_FINISH_MS = 500;

/**
 * Match lengths the lobby offers, with the round cap each implies.
 *
 * The cap is three times the target so a match can go the distance without
 * running forever: at first-to-three that is nine rounds, which is about as
 * long as two people will hold something up to a camera in one sitting.
 */
export const MATCH_LENGTHS = [
  { winTarget: 2, maxRounds: 6, label: 'Quick' },
  { winTarget: 3, maxRounds: 9, label: 'Standard' },
  { winTarget: 5, maxRounds: 15, label: 'Long' },
] as const;

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
  | 'no-submissions'
  /** Somebody rejected an answer, which voids the round for both players. */
  | 'vetoed';

export interface PlayerRoundResult {
  valid: boolean;
  elapsedMs: number | null;
  note: string;
}

export interface RoundOutcome {
  /** Lets the recap find the snapshots that were taken for this round. */
  roundId: string;
  roundNumber: number;
  challengeId: string;
  judging: RoundJudging;
  winnerId: PlayerId | null;
  reason: RoundReason;
  perPlayer: Record<PlayerId, PlayerRoundResult>;
}

/**
 * Who is deciding this round.
 *
 * Wider than the catalogue's own `JudgingMode`, which only says whether a
 * detector exists. A prompt declared `peer` is played as `ai` when a referee is
 * configured and the prompt is one a photograph can settle — and falls back to
 * `peer` if that referee cannot answer.
 */
export type RoundJudging = JudgingMode | 'ai';

export interface RoundState {
  id: string;
  number: number;
  challengeId: string;
  judging: RoundJudging;
  /** True while an AI referee has the round and has not answered yet. */
  aiPending: boolean;
  /** Server clock at prompt reveal. Elapsed times are measured from here. */
  startedAt: number;
  submissions: Record<PlayerId, Submission>;
  /**
   * Players who gave up on this round, by the time they did.
   *
   * Staring at a timer for twenty seconds because there is genuinely nothing
   * purple in the room is the least fun the game has to offer, and if both
   * players are stuck it is twenty seconds of nothing at all.
   */
  passes: Record<PlayerId, number>;
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
  /**
   * Prompts this room has played lately, across matches.
   *
   * `playedChallengeIds` empties on a rematch, which is exactly when repetition
   * is most obvious: the same two people, the same room, the deck they have
   * this second put down. This one survives, so the picker has a reason to
   * reach for something else.
   */
  recentChallengeIds: string[];
  recentModes: JudgingMode[];
  history: RoundOutcome[];
  /** Prompts the players wrote themselves, drawn alongside the catalogue. */
  customChallenges: CustomChallenge[];
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

export interface CustomChallenge {
  id: string;
  prompt: string;
  /** Who wrote it, so only they can take it back out. */
  authorId: PlayerId;
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
  /**
   * Whether an AI referee is configured on this server. Rounds are dealt
   * differently when there is nobody to ask.
   */
  aiAvailable?: boolean;
}

export type Action =
  | { type: 'join'; playerId: PlayerId; name: string }
  | { type: 'leave'; playerId: PlayerId }
  | { type: 'setConnected'; playerId: PlayerId; connected: boolean }
  | { type: 'setCameraReady'; playerId: PlayerId; cameraReady: boolean }
  | { type: 'setReady'; playerId: PlayerId; ready: boolean }
  | { type: 'submit'; playerId: PlayerId; roundId: string; evidenceId: string; auto?: AutoVerdict }
  | { type: 'pass'; playerId: PlayerId; roundId: string }
  | { type: 'vote'; playerId: PlayerId; roundId: string; targetId: PlayerId; approve: boolean }
  | { type: 'rematch'; playerId: PlayerId }
  | { type: 'addChallenge'; playerId: PlayerId; prompt: string; id: string }
  | { type: 'removeChallenge'; playerId: PlayerId; id: string }
  | { type: 'setWinTarget'; playerId: PlayerId; winTarget: number }
  /**
   * Converts an auto-judged round to peer judging. Issued by the server when it
   * has no usable baseline frame for a player and therefore cannot verify the
   * answer itself. Handing the call to the opponent is honest; quietly failing
   * the player for a dropped frame is not.
   */
  | { type: 'downgradeJudging'; roundId: string; reason: string }
  /**
   * The referee answered, or gave up. `verdicts` of null means it could not
   * reach one, and the round falls back to the opponent.
   */
  | { type: 'aiFinished'; roundId: string; verdicts: Record<PlayerId, AutoVerdict> | null };

export type ActionError =
  | 'room-full'
  | 'name-taken'
  | 'not-in-room'
  | 'wrong-phase'
  | 'wrong-round'
  | 'already-submitted'
  | 'already-passed'
  | 'already-voted'
  | 'cannot-vote-for-self'
  | 'no-such-target'
  | 'no-submission-to-judge'
  | 'already-decided'
  | 'ai-judging'
  | 'camera-required'
  | 'match-paused'
  | 'deck-full'
  | 'duplicate-prompt'
  | 'not-your-prompt'
  | 'no-such-prompt'
  | 'bad-setting';

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
    recentChallengeIds: [],
    recentModes: [],
    history: [],
    customChallenges: [],
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

/**
 * Anything with two seats and the players in them — the authoritative match
 * state or the redacted view the client gets. Keeping the lookup in one place
 * matters more than it looks: written inline, "the seat that is not mine"
 * quietly returns the other player to somebody who is not seated at all.
 */
export interface SeatedState<P> {
  seats: readonly (PlayerId | null)[];
  players: Record<PlayerId, P>;
}

export function opponentIdOf(state: SeatedState<unknown>, playerId: PlayerId): PlayerId | null {
  if (!state.seats.includes(playerId)) return null;
  return state.seats.find((id) => id !== null && id !== playerId) ?? null;
}

export function opponentOf<P>(state: SeatedState<P>, playerId: PlayerId): P | null {
  const other = opponentIdOf(state, playerId);
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
    case 'pass':
      return pass(state, action, ctx);
    case 'vote':
      return vote(state, action, ctx);
    case 'rematch':
      return rematch(state, action.playerId, ctx);
    case 'downgradeJudging':
      return downgradeJudging(state, action.roundId);
    case 'aiFinished':
      return aiFinished(state, action, ctx);
    case 'addChallenge':
      return addChallenge(state, action);
    case 'removeChallenge':
      return removeChallenge(state, action);
    case 'setWinTarget':
      return setWinTarget(state, action);
  }
}

/**
 * Either player may set the length, and only between matches. It is a shared
 * decision about how long you are both going to be doing this, not a host
 * privilege, and changing it mid-match would move the finish line.
 */
function setWinTarget(
  state: MatchState,
  action: Extract<Action, { type: 'setWinTarget' }>,
): Result {
  if (state.phase !== 'lobby') return { ok: false, error: 'wrong-phase' };
  if (!state.players[action.playerId]) return { ok: false, error: 'not-in-room' };
  const length = MATCH_LENGTHS.find((l) => l.winTarget === action.winTarget);
  if (!length) return { ok: false, error: 'bad-setting' };
  if (state.settings.winTarget === length.winTarget) return { ok: true, state };

  return {
    ok: true,
    state: bump({
      ...state,
      settings: {
        ...state.settings,
        winTarget: length.winTarget,
        maxRounds: length.maxRounds,
      },
    }),
  };
}

/**
 * Prompts can only be added between matches. Changing the deck mid-match would
 * let someone add a round they have already set themselves up to win.
 */
function addChallenge(
  state: MatchState,
  action: Extract<Action, { type: 'addChallenge' }>,
): Result {
  if (state.phase !== 'lobby') return { ok: false, error: 'wrong-phase' };
  if (!state.players[action.playerId]) return { ok: false, error: 'not-in-room' };
  const theirs = state.customChallenges.filter((c) => c.authorId === action.playerId).length;
  if (theirs >= MAX_CUSTOM_PER_PLAYER) return { ok: false, error: 'deck-full' };
  const prompt = action.prompt;
  if (
    state.customChallenges.some((c) => c.prompt === prompt) ||
    promptExists(prompt)
  ) {
    return { ok: false, error: 'duplicate-prompt' };
  }

  return {
    ok: true,
    state: bump({
      ...state,
      customChallenges: [
        ...state.customChallenges,
        { id: action.id, prompt, authorId: action.playerId },
      ],
    }),
  };
}

function removeChallenge(
  state: MatchState,
  action: Extract<Action, { type: 'removeChallenge' }>,
): Result {
  if (state.phase !== 'lobby') return { ok: false, error: 'wrong-phase' };
  const existing = state.customChallenges.find((c) => c.id === action.id);
  if (!existing) return { ok: false, error: 'no-such-prompt' };
  if (existing.authorId !== action.playerId) return { ok: false, error: 'not-your-prompt' };

  return {
    ok: true,
    state: bump({
      ...state,
      customChallenges: state.customChallenges.filter((c) => c.id !== action.id),
    }),
  };
}

/**
 * The AI referee has answered, or has given up.
 *
 * An answer is written into the same `auto` slot a detector's verdict goes in,
 * because it is the same kind of thing: a machine reading of a photograph that
 * the opponent cannot overturn. Everything downstream — validity, the notes,
 * who is still owed a vote — already knows what to do with that.
 *
 * Giving up hands the round back to the opponent with a fresh window to judge
 * it in, rather than what is left of one spent waiting.
 */
function aiFinished(
  state: MatchState,
  action: Extract<Action, { type: 'aiFinished' }>,
  ctx: EngineContext,
): Result {
  if (!state.round || state.round.id !== action.roundId) return { ok: false, error: 'wrong-round' };
  if (state.phase !== 'judging') return { ok: false, error: 'wrong-phase' };
  if (!state.round.aiPending) return { ok: true, state };

  if (!action.verdicts) {
    return {
      ok: true,
      state: bump({
        ...state,
        round: { ...state.round, judging: 'peer', aiPending: false },
        phaseEndsAt: ctx.now + state.settings.judgingMs,
      }),
    };
  }

  const submissions: Record<PlayerId, Submission> = {};
  for (const [playerId, submission] of Object.entries(state.round.submissions)) {
    const verdict = action.verdicts[playerId];
    submissions[playerId] = verdict ? { ...submission, auto: verdict } : submission;
  }

  const next: MatchState = {
    ...state,
    round: { ...state.round, submissions, aiPending: false },
  };
  // Every answer the referee spoke for is settled, so unless somebody is still
  // owed a vote the round is over.
  return {
    ok: true,
    state: bump(
      awaitingVerdict(next, next.round!).length === 0 ? resolveRound(next, ctx) : next,
    ),
  };
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
    // Their prompts go with them; the next person did not write them and should
    // not have to play them.
    customChallenges: state.customChallenges.filter((c) => c.authorId !== playerId),
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
  const everyoneAnswered = seated.every((p) => isDone(round, p.id));

  if (everyoneAnswered) {
    next = closeChallenge(next, ctx);
  } else if (round.judging === 'auto' && Object.values(round.submissions).some((s) => s.auto?.matched)) {
    // The race is won, but hold the door open for a photo finish. Only ever
    // shortens the round: a late winner must not extend it.
    next = { ...next, phaseEndsAt: Math.min(next.phaseEndsAt, ctx.now + PHOTO_FINISH_MS) };
  }

  return { ok: true, state: bump(next) };
}

/** Whether a player has finished with this round, either way. */
function isDone(round: RoundState, playerId: PlayerId): boolean {
  return Boolean(round.submissions[playerId]) || round.passes[playerId] !== undefined;
}

function pass(
  state: MatchState,
  action: Extract<Action, { type: 'pass' }>,
  ctx: EngineContext,
): Result {
  if (state.pausedAt !== null) return { ok: false, error: 'match-paused' };
  if (state.phase !== 'challenge' || !state.round) return { ok: false, error: 'wrong-phase' };
  if (state.round.id !== action.roundId) return { ok: false, error: 'wrong-round' };
  if (!state.players[action.playerId]) return { ok: false, error: 'not-in-room' };
  if (state.round.submissions[action.playerId]) return { ok: false, error: 'already-submitted' };
  if (state.round.passes[action.playerId] !== undefined) return { ok: false, error: 'already-passed' };

  const round: RoundState = {
    ...state.round,
    passes: { ...state.round.passes, [action.playerId]: ctx.now },
  };
  let next: MatchState = { ...state, round };

  if (playersInSeatOrder(next).every((p) => isDone(round, p.id))) {
    next = closeChallenge(next, ctx);
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
  // A vote landing while the referee still has the round would shrink the set
  // of answers still owed a verdict, and could close the round out from under
  // the reply on its way back.
  if (state.round.aiPending) return { ok: false, error: 'ai-judging' };
  if (!state.players[action.playerId]) return { ok: false, error: 'not-in-room' };
  if (action.targetId === action.playerId) return { ok: false, error: 'cannot-vote-for-self' };
  if (!state.players[action.targetId]) return { ok: false, error: 'no-such-target' };

  const target = state.round.submissions[action.targetId];
  if (!target) return { ok: false, error: 'no-submission-to-judge' };
  if (target.peer) return { ok: false, error: 'already-voted' };
  // The camera already read this one. A vote cannot overturn it, so it is not
  // accepted rather than quietly recorded and ignored.
  if (target.auto) return { ok: false, error: 'already-decided' };

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

  if (awaitingVerdict(next, round).length === 0) next = resolveRound(next, ctx);

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
    avoid: state.recentChallengeIds,
    roundNumber: state.roundNumber + 1,
    recentModes: state.recentModes,
    ...(ctx.random ? { random: ctx.random } : {}),
    pool: deckFor(state, ctx),
  });

  const roundNumber = state.roundNumber + 1;
  const round: RoundState = {
    id: ctx.newId(),
    number: roundNumber,
    challengeId: challenge.id,
    judging:
      challenge.judging === 'peer' && ctx.aiAvailable && isAiVerifiable(challenge) ? 'ai' : challenge.judging,
    aiPending: false,
    // Set for real when the countdown ends and the prompt is revealed.
    startedAt: ctx.now + state.settings.countdownMs,
    submissions: {},
    passes: {},
    outcome: null,
  };

  return {
    ...state,
    phase: 'countdown',
    phaseEndsAt: ctx.now + state.settings.countdownMs,
    round,
    roundNumber,
    playedChallengeIds: [...state.playedChallengeIds, challenge.id],
    // One long match is fifteen rounds, so a window of twenty covers the match
    // just played and a little either side of it.
    recentChallengeIds: [...state.recentChallengeIds, challenge.id].slice(-RECENT_CHALLENGE_MEMORY),
    recentModes: [...state.recentModes, challenge.judging].slice(-4),
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [id, { ...p, ready: false }]),
    ),
  };
}

/**
 * Everything this room can draw from: the catalogue and the topic pool, plus
 * whatever the players wrote, or an explicit pool when one is supplied.
 */
function deckFor(state: MatchState, ctx: EngineContext): readonly Challenge[] {
  const base = ctx.pool ?? allChallengesPool();
  if (state.customChallenges.length === 0) return base;
  return [...base, ...state.customChallenges.map((c) => customChallenge(c.id, c.prompt))];
}

/** Resolves a challenge by id, including the ones this room wrote itself. */
export function challengeInRoom(state: MatchState, id: string): Challenge | undefined {
  const own = state.customChallenges.find((c) => c.id === id);
  return own ? customChallenge(own.id, own.prompt) : getChallenge(id);
}

function beginChallenge(state: MatchState, ctx: EngineContext): MatchState {
  if (!state.round) return state;
  const challenge = challengeInRoom(state, state.round.challengeId);
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

  // An AI round is not waiting on a vote; it is waiting on the referee, and it
  // only needs one photograph to have something to look at.
  if (state.round.judging === 'ai' && Object.keys(state.round.submissions).length > 0) {
    return openJudging(state, ctx);
  }

  // Opening judging when nobody is eligible to vote would be fifteen seconds of
  // both players looking at a question neither of them can answer.
  return awaitingVerdict(state, state.round).length > 0
    ? openJudging(state, ctx)
    : resolveRound(state, ctx);
}

/**
 * The submissions that can still receive a verdict.
 *
 * Only your opponent judges you, and only if they answered the round
 * themselves. That is the whole of "you do not get to judge a round you did
 * not play": a submission whose judge passed or ran out of time is not waiting
 * for anything, so the round is settled now and the person who sat it out
 * never gets a say. Otherwise passing would be a free way to deny a point you
 * never contested.
 */
function awaitingVerdict(state: MatchState, round: RoundState): PlayerId[] {
  // Nobody is asked to vote while a referee has the round.
  if (round.judging !== 'peer') return [];
  return playersInSeatOrder(state)
    .filter((player) => {
      const submission = round.submissions[player.id];
      if (!submission || submission.peer || submission.auto) return false;
      const judge = opponentIdOf(state, player.id);
      return judge !== null && round.submissions[judge] !== undefined;
    })
    .map((player) => player.id);
}

function openJudging(state: MatchState, ctx: EngineContext): MatchState {
  return {
    ...state,
    phase: 'judging',
    phaseEndsAt: ctx.now + state.settings.judgingMs,
    // Marked here rather than by the server, so there is never a moment where a
    // client is offered a vote on a round the referee is already holding. If no
    // answer arrives before the deadline, the tick resolves it as an ordinary
    // unjudged round.
    ...(state.round?.judging === 'ai' ? { round: { ...state.round, aiPending: true } } : {}),
  };
}

function resolveRound(state: MatchState, ctx: EngineContext): MatchState {
  const round = state.round;
  if (!round) return state;

  const seated = playersInSeatOrder(state);
  const perPlayer: Record<PlayerId, PlayerRoundResult> = {};
  const valid: { id: PlayerId; elapsedMs: number }[] = [];

  // A rejection voids the round for both players, including the one who cast
  // it.
  //
  // Your opponent is the only judge available for a prompt no camera can
  // settle, and they are also the person who gains when you are marked
  // invalid. Left alone that makes "No" the dominant move in every peer round:
  // it turns a race you might lose into a win you cannot. Voiding the round
  // takes the prize away. An honest rejection still stops a bogus answer from
  // scoring — it just costs the judge the round too, which is the thing that
  // makes a verdict worth believing.
  const vetoed = Object.values(round.submissions).some((s) => s.peer?.approve === false);

  for (const player of seated) {
    const submission = round.submissions[player.id];
    if (!submission) {
      perPlayer[player.id] = {
        valid: false,
        elapsedMs: null,
        note: round.passes[player.id] !== undefined ? 'Passed' : 'Ran out of time',
      };
      continue;
    }
    // Where the camera reached a verdict, that verdict is the answer. A round
    // downgrades to peer judging because *a* frame could not be read, not
    // because the ones that could should be re-tried by hand — and an opponent
    // must not be able to overturn a server-side reading in either direction.
    const isValid = submission.auto
      ? submission.auto.matched
      : round.judging === 'auto'
        ? false
        : // No vote by the deadline counts as approval: abstaining should never
          // be a cheaper way to deny a point than actually judging. An AI round
          // whose referee never answered lands here too, and is forgiven the
          // same way.
          submission.peer?.approve ?? true;
    const rejectedByThem = Object.values(round.submissions).some(
      (s) => s.peer?.approve === false && s.peer.voterId === player.id,
    );

    perPlayer[player.id] = {
      valid: isValid,
      elapsedMs: submission.elapsedMs,
      note: isValid
        ? noteForValid(round.judging, submission, rejectedByThem)
        : noteForInvalid(round.judging, submission),
    };
    if (isValid) valid.push({ id: player.id, elapsedMs: submission.elapsedMs });
  }

  let winnerId: PlayerId | null = null;
  let reason: RoundReason;
  if (vetoed) {
    reason = 'vetoed';
  } else if (valid.length === 0) {
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
    roundId: round.id,
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

function noteForValid(judging: RoundJudging, s: Submission, youRejectedTheirs: boolean): string {
  // A machine verdict explains itself, whichever machine reached it.
  if (s.auto) return s.auto.reason;
  if (judging === 'auto') return 'Verified';
  if (youRejectedTheirs) return 'You said no — the round counts for nobody';
  if (!s.peer) return 'Unjudged — counted as good';
  return 'Approved by your opponent';
}

function noteForInvalid(judging: RoundJudging, s: Submission): string {
  if (s.auto) return s.auto.reason;
  if (judging === 'auto') return 'Not detected';
  return 'Rejected by your opponent — the round counts for nobody';
}

/** How many of the finished rounds this player actually answered. */
export function roundsAnswered(history: readonly RoundOutcome[], playerId: PlayerId): number {
  return history.filter((round) => round.perPlayer[playerId]?.elapsedMs != null).length;
}

/**
 * Whether a finished match should move anybody's rating.
 *
 * Two rules, and both are about the same thing: a rating should only record
 * matches that happened. An abandoned match did not finish, and a match one
 * side sat out did not take place — which is also the cheapest way to inflate
 * a rating, by opening a second tab and letting it lose. Half the rounds is
 * the line: enough that a bad connection or a fumbled round is forgiven,
 * little enough that an idle seat never counts.
 */
export function countsForRating(state: MatchState): boolean {
  if (state.phase !== 'matchResult' || state.endReason === 'abandoned') return false;
  const seated = playersInSeatOrder(state);
  if (seated.length !== 2 || state.history.length === 0) return false;
  const needed = Math.ceil(state.history.length / 2);
  return seated.every((player) => roundsAnswered(state.history, player.id) >= needed);
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
    // recentChallengeIds deliberately survives: it is the whole point.
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
