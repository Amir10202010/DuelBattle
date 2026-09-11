import { z } from 'zod';
import type {
  MatchEndReason,
  MatchState,
  Phase,
  PlayerId,
  RoundOutcome,
  Submission,
} from './game.js';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './ids.js';

export const PROTOCOL_VERSION = 1;

/** Hard ceiling on a single evidence image, enforced by the server. */
export const MAX_IMAGE_BYTES = 220_000;
/** Live thumbnails are small and frequent; they get their own tighter ceiling. */
export const MAX_FRAME_BYTES = 60_000;
export const MAX_NAME_LENGTH = 18;

/**
 * Control characters, zero-width marks and bidi overrides are the cheap way to
 * grief a scoreboard; reject them at the edge rather than defending at every
 * render site.
 */
const UNSAFE_NAME_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]',
);

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Pick a name')
  .max(MAX_NAME_LENGTH, `Keep it under ${MAX_NAME_LENGTH} characters`)
  .refine((v) => !UNSAFE_NAME_CHARS.test(v), 'Unsupported characters');

export const roomCodeSchema = z
  .string()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), 'That room code looks wrong');

/**
 * Evidence is JPEG-only because the server decodes it to re-run the detector
 * itself. Allowing a format the verifier cannot read would mean silently
 * trusting the client's own verdict.
 */
const evidenceImageSchema = z
  .string()
  .max(MAX_IMAGE_BYTES, 'Snapshot too large')
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Unsupported snapshot format');

/**
 * Live camera frames. These are relayed to the opponent, and the last one that
 * lands before a prompt is revealed becomes that round's baseline, so they are
 * held to the same JPEG-only rule as evidence.
 */
const frameImageSchema = z
  .string()
  .max(MAX_FRAME_BYTES, 'Frame too large')
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Unsupported frame format');

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('hello'), protocol: z.number().int() }),
  z.object({ t: z.literal('createRoom'), name: nameSchema }),
  z.object({ t: z.literal('joinRoom'), code: roomCodeSchema, name: nameSchema }),
  z.object({ t: z.literal('rejoin'), code: roomCodeSchema, token: z.string().min(8).max(128) }),
  z.object({ t: z.literal('cameraReady'), ready: z.boolean() }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('submit'), roundId: z.string().min(1).max(64), image: evidenceImageSchema }),
  z.object({
    t: z.literal('vote'),
    roundId: z.string().min(1).max(64),
    targetId: z.string().min(1).max(64),
    approve: z.boolean(),
  }),
  z.object({ t: z.literal('rematch') }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('ping'), id: z.number().int() }),
  z.object({ t: z.literal('frame'), image: frameImageSchema, seq: z.number().int().nonnegative() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

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
  settings: { winTarget: number; maxRounds: number };
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
    settings: { winTarget: state.settings.winTarget, maxRounds: state.settings.maxRounds },
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
