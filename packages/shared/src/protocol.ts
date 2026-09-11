import type {
  MatchEndReason,
  MatchState,
  Phase,
  PlayerId,
  RoundOutcome,
  Submission,
} from './game.js';

export const PROTOCOL_VERSION = 1;

/** Hard ceiling on a single evidence image, enforced by the server. */
export const MAX_IMAGE_BYTES = 220_000;
/** Live thumbnails are small and frequent; they get their own tighter ceiling. */
export const MAX_FRAME_BYTES = 60_000;
export const MAX_NAME_LENGTH = 18;

/**
 * Everything a client may send. Declared here rather than inferred from the
 * schema so the client can speak the protocol without importing a validator it
 * will never run.
 */
export type ClientMessage =
  | { t: 'hello'; protocol: number }
  | { t: 'createRoom'; name: string }
  | { t: 'joinRoom'; code: string; name: string }
  | { t: 'rejoin'; code: string; token: string }
  | { t: 'cameraReady'; ready: boolean }
  | { t: 'ready'; ready: boolean }
  | { t: 'submit'; roundId: string; image: string }
  | { t: 'vote'; roundId: string; targetId: PlayerId; approve: boolean }
  | { t: 'rematch' }
  | { t: 'leave' }
  | { t: 'ping'; id: number }
  | { t: 'frame'; image: string; seq: number };

export type ErrorCode =
  | 'bad-message'
  | 'protocol-mismatch'
  | 'room-not-found'
  | 'room-full'
  | 'name-taken'
  | 'not-in-room'
  | 'rate-limited'
  | 'rejected'
  | 'session-expired'
  | 'server-error';

// ---------------------------------------------------------------------------
// Public (redacted) view of the match
// ---------------------------------------------------------------------------

export interface PublicPlayer {
  id: PlayerId;
  name: string;
  seat: 0 | 1;
  connected: boolean;
  cameraReady: boolean;
  ready: boolean;
  score: number;
  validAnswers: number;
  rematchVote: boolean;
  /** True once this player has locked in an answer for the live round. */
  submitted: boolean;
}

export interface PublicSubmission {
  playerId: PlayerId;
  elapsedMs: number;
  evidenceId: string;
  auto?: { matched: boolean; confidence: number; reason: string };
  peer?: { approve: boolean; voterId: PlayerId };
}

export interface PublicRound {
  id: string;
  number: number;
  challengeId: string;
  judging: 'auto' | 'peer';
  startedAt: number;
  outcome: RoundOutcome | null;
  /** Only populated once submissions are no longer secret. */
  submissions: Record<PlayerId, PublicSubmission>;
}

export interface PublicMatchState {
  roomCode: string;
  phase: Phase;
  /** Server clock deadline for the current phase; Infinity is sent as null. */
  phaseEndsAt: number | null;
  seats: [PlayerId | null, PlayerId | null];
  players: Record<PlayerId, PublicPlayer>;
  round: PublicRound | null;
  roundNumber: number;
  /** Every resolved round, oldest first. Drives the end-of-match recap. */
  history: RoundOutcome[];
  /** Matches won in this room so far, by player id. */
  series: Record<PlayerId, number>;
  /**
   * Everything the client needs to draw the match without guessing. The phase
   * durations are here because a timer bar has to know what a full bar means,
   * and hard-coding them client-side makes the bar silently wrong the moment a
   * room is configured differently.
   */
  settings: {
    winTarget: number;
    maxRounds: number;
    countdownMs: number;
    judgingMs: number;
    roundResultMs: number;
  };
  paused: { since: number; deadline: number } | null;
  winnerId: PlayerId | null;
  endReason: MatchEndReason | null;
  version: number;
}

function publicSubmission(s: Submission, revealVerdicts: boolean): PublicSubmission {
  return {
    playerId: s.playerId,
    elapsedMs: s.elapsedMs,
    evidenceId: s.evidenceId,
    ...(revealVerdicts && s.auto ? { auto: s.auto } : {}),
    ...(revealVerdicts && s.peer ? { peer: { approve: s.peer.approve, voterId: s.peer.voterId } } : {}),
  };
}

/**
 * Projects authoritative state into what a client is allowed to know. Verdicts
 * stay hidden while the round is live so neither player can read the detector's
 * answer off their opponent's screen.
 */
export function toPublicState(state: MatchState): PublicMatchState {
  const revealVerdicts = state.phase === 'roundResult' || state.phase === 'matchResult';
  const showSubmissions = revealVerdicts || state.phase === 'judging';
  const round = state.round;

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    phaseEndsAt: Number.isFinite(state.phaseEndsAt) ? state.phaseEndsAt : null,
    seats: [...state.seats],
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, p]) => [
        id,
        {
          id: p.id,
          name: p.name,
          seat: p.seat,
          connected: p.connected,
          cameraReady: p.cameraReady,
          ready: p.ready,
          score: p.score,
          validAnswers: p.validAnswers,
          rematchVote: p.rematchVote,
          submitted: Boolean(round?.submissions[id]),
        } satisfies PublicPlayer,
      ]),
    ),
    round: round
      ? {
          id: round.id,
          number: round.number,
          challengeId: round.challengeId,
          judging: round.judging,
          startedAt: round.startedAt,
          outcome: round.outcome,
          submissions: showSubmissions
            ? Object.fromEntries(
                Object.entries(round.submissions).map(([id, s]) => [
                  id,
                  publicSubmission(s, revealVerdicts),
                ]),
              )
            : {},
        }
      : null,
    roundNumber: state.roundNumber,
    history: state.history,
    series: state.series,
    settings: {
      winTarget: state.settings.winTarget,
      maxRounds: state.settings.maxRounds,
      countdownMs: state.settings.countdownMs,
      judgingMs: state.settings.judgingMs,
      roundResultMs: state.settings.roundResultMs,
    },
    paused:
      state.pausedAt !== null
        ? { since: state.pausedAt, deadline: state.pauseDeadline ?? state.pausedAt }
        : null,
    winnerId: state.winnerId,
    endReason: state.endReason,
    version: state.version,
  };
}

export type ServerMessage =
  | { t: 'welcome'; protocol: number; serverTime: number }
  | { t: 'joined'; roomCode: string; playerId: PlayerId; token: string }
  | { t: 'state'; state: PublicMatchState; serverTime: number }
  | { t: 'evidence'; roundId: string; playerId: PlayerId; image: string }
  | { t: 'peerFrame'; playerId: PlayerId; image: string; seq: number }
  | { t: 'toast'; kind: 'info' | 'warn'; message: string }
  | { t: 'error'; code: ErrorCode; message: string; fatal?: boolean }
  | { t: 'pong'; id: number; serverTime: number };
