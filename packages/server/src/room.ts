import { randomBytes } from 'node:crypto';
import {
  challengeInRoom,
  createMatch,
  randomId,
  reduce,
  tick,
  toPublicState,
  validateCustomPrompt,
  type Action,
  type ActionError,
  type AutoVerdict,
  type ClientMessage,
  type EngineContext,
  type ErrorCode,
  type Frame,
  type MatchState,
  type Phase,
  type PlayerId,
  type ServerMessage,
} from '@battle/shared';
import { DecodeError, decodeEvidence, verifySubmission } from './verify.js';
import { log } from './log.js';

export type Send = (message: ServerMessage) => void;

/** A live frame is only usable as a baseline while it still reflects the room. */
const BASELINE_MAX_AGE_MS = 4_000;

/** Live frames are relayed at most this often, regardless of what a client sends. */
const FRAME_RELAY_INTERVAL_MS = 150;

interface Seat {
  token: string;
  send: Send | null;
  /** Raw JPEG data URL of the most recent live frame, kept for one relay hop. */
  lastFrame: { image: string; at: number } | null;
  lastRelayAt: number;
  /** Decoded baseline for the round named by `baselineRoundId`. */
  baseline: Frame | null;
  baselineRoundId: string | null;
}

export interface JoinOutcome {
  ok: boolean;
  playerId?: PlayerId;
  token?: string;
  error?: ErrorCode;
  message?: string;
}

const ACTION_ERROR_COPY: Record<ActionError, string> = {
  'room-full': 'That room already has two players.',
  'name-taken': 'Someone in there is already using that name.',
  'not-in-room': 'You are not in this room any more.',
  'wrong-phase': 'That is not possible right now.',
  'wrong-round': 'That round has already moved on.',
  'already-submitted': 'You have already locked in this round.',
  'already-voted': 'You have already judged that answer.',
  'cannot-vote-for-self': 'You cannot judge your own answer.',
  'no-such-target': 'That player is not here.',
  'no-submission-to-judge': 'There is nothing to judge yet.',
  'camera-required': 'Turn your camera on first.',
  'match-paused': 'Waiting for your opponent to reconnect.',
  'deck-full': 'That is as many of your own as one room can hold.',
  'duplicate-prompt': 'That one is already in the deck.',
  'not-your-prompt': 'Only whoever wrote it can take it out.',
  'no-such-prompt': 'That prompt is already gone.',
};

const PROMPT_ERROR_COPY: Record<string, string> = {
  'too-short': 'A few more words than that.',
  'too-long': 'Too long to read at a glance — keep it short.',
  'unsupported-characters': 'Letters, numbers and ordinary punctuation only.',
  duplicate: 'That one is already in the deck.',
  'deck-full': 'That is as many of your own as one room can hold.',
};

/**
 * One room: the authoritative match state plus everything transient that hangs
 * off it (sessions, live frames, evidence snapshots).
 *
 * Deliberately transport-agnostic — it takes `send` callbacks rather than
 * sockets — so the whole room lifecycle is testable without a network.
 */
export class Room {
  readonly code: string;
  private state: MatchState;
  private readonly seats = new Map<PlayerId, Seat>();
  private readonly tokens = new Map<string, PlayerId>();
  /**
   * roundId -> playerId -> evidence image.
   *
   * Only ever the round in play: judging and the result screen both show the
   * current round, and a reconnecting player is re-sent that same round. It is
   * the largest term in a room's memory, so it holds exactly what is used.
   */
  private readonly evidence = new Map<string, Map<PlayerId, string>>();
  private lastBroadcastVersion = -1;
  private lastPhase: Phase = 'lobby';
  private lastRoundId: string | null = null;
  emptySince: number | null;

  constructor(code: string, now: number) {
    this.code = code;
    this.state = createMatch(code, now);
    this.emptySince = now;
  }

  get createdAt(): number {
    return this.state.createdAt;
  }

  get playerCount(): number {
    return Object.keys(this.state.players).length;
  }

  get connectedCount(): number {
    return [...this.seats.values()].filter((s) => s.send !== null).length;
  }

  get hasFreeSeat(): boolean {
    return this.state.seats.some((id) => id === null);
  }

  get phase(): Phase {
    return this.state.phase;
  }

  private ctx(now: number): EngineContext {
    return { now, newId: () => randomId(10) };
  }

  private dispatch(action: Action, now: number): ActionError | null {
    const result = reduce(this.state, action, this.ctx(now));
    if (!result.ok) return result.error;
    this.state = result.state;
    return null;
  }

  // -------------------------------------------------------------------------
  // Membership
  // -------------------------------------------------------------------------

  join(name: string, now: number): JoinOutcome {
    const playerId = randomId(14);
    const error = this.dispatch({ type: 'join', playerId, name }, now);
    if (error) {
      return {
        ok: false,
        error: error === 'room-full' ? 'room-full' : error === 'name-taken' ? 'name-taken' : 'rejected',
        message: ACTION_ERROR_COPY[error],
      };
    }
    const token = randomBytes(24).toString('base64url');
    this.seats.set(playerId, {
      token,
      send: null,
      lastFrame: null,
      lastRelayAt: 0,
      baseline: null,
      baselineRoundId: null,
    });
    this.tokens.set(token, playerId);
    return { ok: true, playerId, token };
  }

  /** Re-attaches an existing seat after a refresh or a dropped connection. */
  rejoin(token: string, now: number): JoinOutcome {
    const playerId = this.tokens.get(token);
    if (!playerId || !this.state.players[playerId]) {
      return { ok: false, error: 'session-expired', message: 'That session has expired.' };
    }
    this.dispatch({ type: 'setConnected', playerId, connected: true }, now);
    return { ok: true, playerId, token };
  }

  attach(playerId: PlayerId, send: Send, now: number): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    // A second connection for the same seat replaces the first: a refreshed tab
    // should take over rather than fight the stale one for the same player.
    if (seat.send) {
      seat.send({ t: 'error', code: 'session-expired', message: 'Opened in another tab.', fatal: true });
    }
    seat.send = send;
    this.emptySince = null;
    this.dispatch({ type: 'setConnected', playerId, connected: true }, now);
    send({ t: 'state', state: toPublicState(this.state), serverTime: now });
    this.sendVisibleEvidence(playerId, send);
    this.broadcastIfChanged(now);
  }

  detach(playerId: PlayerId, now: number): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;
    seat.send = null;
    seat.lastFrame = null;
    this.dispatch({ type: 'setConnected', playerId, connected: false }, now);
    if (this.connectedCount === 0) this.emptySince = now;
    this.broadcastIfChanged(now);
  }

  /** Permanently gives up the seat, as opposed to a recoverable disconnect. */
  remove(playerId: PlayerId, now: number): void {
    const seat = this.seats.get(playerId);
    if (seat) this.tokens.delete(seat.token);
    this.seats.delete(playerId);
    this.dispatch({ type: 'leave', playerId }, now);
    if (this.connectedCount === 0) this.emptySince = now;
    this.broadcastIfChanged(now);
  }

  // -------------------------------------------------------------------------
  // Client messages
  // -------------------------------------------------------------------------

  handle(playerId: PlayerId, message: ClientMessage, now: number): void {
    const seat = this.seats.get(playerId);
    if (!seat) return;

    switch (message.t) {
      case 'cameraReady':
        this.reportError(seat, this.dispatch({ type: 'setCameraReady', playerId, cameraReady: message.ready }, now));
        break;
      case 'ready':
        this.reportError(seat, this.dispatch({ type: 'setReady', playerId, ready: message.ready }, now));
        break;
      case 'frame':
        this.onFrame(playerId, seat, message.image, message.seq, now);
        break;
      case 'submit':
        this.onSubmit(playerId, seat, message.roundId, message.image, now);
        break;
      case 'vote':
        this.reportError(
          seat,
          this.dispatch(
            { type: 'vote', playerId, roundId: message.roundId, targetId: message.targetId, approve: message.approve },
            now,
          ),
        );
        break;
      case 'rematch':
        this.reportError(seat, this.dispatch({ type: 'rematch', playerId }, now));
        break;
      case 'addChallenge':
        this.onAddChallenge(playerId, seat, message.prompt, now);
        break;
      case 'removeChallenge':
        this.reportError(
          seat,
          this.dispatch({ type: 'removeChallenge', playerId, id: message.id }, now),
        );
        break;
      case 'leave':
        this.remove(playerId, now);
        return;
      default:
        return;
    }
    this.broadcastIfChanged(now);
  }

  /**
   * The prompt is normalised and checked here, on the server, so a client
   * cannot put anything into the deck that the rules would not allow.
   */
  private onAddChallenge(playerId: PlayerId, seat: Seat, raw: string, now: number): void {
    const state = toPublicState(this.state);
    const check = validateCustomPrompt(raw, state.customChallenges);
    if (!check.ok) {
      seat.send?.({
        t: 'error',
        code: 'rejected',
        message: PROMPT_ERROR_COPY[check.error] ?? 'That prompt cannot be used.',
      });
      return;
    }
    this.reportError(
      seat,
      this.dispatch(
        { type: 'addChallenge', playerId, prompt: check.prompt, id: `c-${randomId(8)}` },
        now,
      ),
    );
  }

  private reportError(seat: Seat, error: ActionError | null): void {
    if (!error || !seat.send) return;
    seat.send({ t: 'error', code: 'rejected', message: ACTION_ERROR_COPY[error] });
  }

  private onFrame(playerId: PlayerId, seat: Seat, image: string, seq: number, now: number): void {
    seat.lastFrame = { image, at: now };
    if (now - seat.lastRelayAt < FRAME_RELAY_INTERVAL_MS) return;
    seat.lastRelayAt = now;
    for (const [otherId, other] of this.seats) {
      if (otherId === playerId || !other.send) continue;
      other.send({ t: 'peerFrame', playerId, image, seq });
    }
  }

  private onSubmit(
    playerId: PlayerId,
    seat: Seat,
    roundId: string,
    image: string,
    now: number,
  ): void {
    const round = this.state.round;
    if (!round || round.id !== roundId || this.state.phase !== 'challenge') {
      this.reportError(seat, round && round.id !== roundId ? 'wrong-round' : 'wrong-phase');
      return;
    }

    let auto: AutoVerdict | undefined;

    if (round.judging === 'auto') {
      const challenge = challengeInRoom(this.state, round.challengeId);
      if (!challenge) {
        log.error('round references an unknown challenge', { roundId, challengeId: round.challengeId });
        this.reportError(seat, 'wrong-round');
        return;
      }
      let frame: Frame;
      try {
        frame = decodeEvidence(image);
      } catch (err) {
        if (seat.send) {
          seat.send({
            t: 'error',
            code: 'bad-message',
            message: 'That snapshot could not be read. Try again.',
          });
        }
        log.warn('evidence decode failed', {
          playerId,
          error: err instanceof DecodeError ? err.message : String(err),
        });
        return;
      }
      const baseline = seat.baselineRoundId === round.id ? seat.baseline ?? undefined : undefined;
      const outcome = verifySubmission(challenge, baseline, frame);
      if (outcome.kind === 'verdict') {
        auto = outcome.verdict;
      } else {
        // We cannot decide this one ourselves, so we say so and hand the round
        // to the opponent rather than inventing a verdict.
        this.dispatch(
          { type: 'downgradeJudging', roundId: round.id, reason: outcome.kind },
          now,
        );
        this.broadcast({
          t: 'toast',
          kind: 'warn',
          message: 'Camera check unavailable — your opponent judges this round.',
        });
      }
    }

    const error = this.dispatch(
      {
        type: 'submit',
        playerId,
        roundId,
        evidenceId: `${roundId}:${playerId}`,
        ...(auto ? { auto } : {}),
      },
      now,
    );
    if (error) {
      this.reportError(seat, error);
      return;
    }
    this.storeEvidence(roundId, playerId, image);
  }

  // -------------------------------------------------------------------------
  // Time and broadcasting
  // -------------------------------------------------------------------------

  tick(now: number): void {
    const next = tick(this.state, this.ctx(now));
    if (next !== this.state) this.state = next;
    this.broadcastIfChanged(now);
  }

  private broadcastIfChanged(now: number): void {
    if (this.state.version === this.lastBroadcastVersion) return;
    this.lastBroadcastVersion = this.state.version;

    this.onPhaseChanged(now);

    const payload: ServerMessage = { t: 'state', state: toPublicState(this.state), serverTime: now };
    this.broadcast(payload);
  }

  private onPhaseChanged(now: number): void {
    const round = this.state.round;
    const phase = this.state.phase;
    const roundChanged = (round?.id ?? null) !== this.lastRoundId;

    if (phase === 'challenge' && (this.lastPhase !== 'challenge' || roundChanged) && round) {
      this.captureBaselines(round.id, now);
    }
    if (phase === 'judging' && this.lastPhase !== 'judging' && round) {
      this.deliverEvidence(round.id, 'judging');
    }
    if (phase === 'roundResult' && this.lastPhase !== 'roundResult' && round) {
      this.deliverEvidence(round.id, 'result');
    }
    if (roundChanged && round) this.pruneEvidenceExcept(round.id);

    this.lastPhase = phase;
    this.lastRoundId = round?.id ?? null;
  }

  /**
   * Freezes each player's "before" frame at the instant the prompt is revealed.
   * Everything the detector scores is measured against this, which is what
   * stops a challenge being answered by furniture that never moved.
   */
  private captureBaselines(roundId: string, now: number): void {
    for (const [playerId, seat] of this.seats) {
      seat.baseline = null;
      seat.baselineRoundId = null;
      const frame = seat.lastFrame;
      if (!frame || now - frame.at > BASELINE_MAX_AGE_MS) {
        log.info('no usable baseline frame', { room: this.code, playerId });
        continue;
      }
      try {
        seat.baseline = decodeEvidence(frame.image);
        seat.baselineRoundId = roundId;
      } catch (err) {
        log.warn('baseline decode failed', {
          room: this.code,
          playerId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private storeEvidence(roundId: string, playerId: PlayerId, image: string): void {
    let round = this.evidence.get(roundId);
    if (!round) {
      round = new Map();
      this.evidence.set(roundId, round);
    }
    round.set(playerId, image);
  }

  /** Everything but the round in play is dead weight. */
  private pruneEvidenceExcept(roundId: string): void {
    for (const key of [...this.evidence.keys()]) {
      if (key !== roundId) this.evidence.delete(key);
    }
  }

  /** How many rounds of snapshots this room is holding. Asserted by the tests. */
  get retainedEvidenceRounds(): number {
    return this.evidence.size;
  }

  /**
   * During judging each player sees only the answer they are judging; once the
   * round resolves, both answers are shown to both players.
   */
  private deliverEvidence(roundId: string, when: 'judging' | 'result'): void {
    const images = this.evidence.get(roundId);
    if (!images) return;
    for (const [viewerId, seat] of this.seats) {
      if (!seat.send) continue;
      for (const [ownerId, image] of images) {
        if (when === 'judging' && ownerId === viewerId) continue;
        seat.send({ t: 'evidence', roundId, playerId: ownerId, image });
      }
    }
  }

  /** Re-sends whatever the reconnecting player is currently entitled to see. */
  private sendVisibleEvidence(viewerId: PlayerId, send: Send): void {
    const round = this.state.round;
    if (!round) return;
    const phase = this.state.phase;
    if (phase !== 'judging' && phase !== 'roundResult' && phase !== 'matchResult') return;
    const images = this.evidence.get(round.id);
    if (!images) return;
    for (const [ownerId, image] of images) {
      if (phase === 'judging' && ownerId === viewerId) continue;
      send({ t: 'evidence', roundId: round.id, playerId: ownerId, image });
    }
  }

  broadcast(message: ServerMessage): void {
    for (const seat of this.seats.values()) seat.send?.(message);
  }

  isCollectable(now: number, emptyTtlMs: number, maxAgeMs: number): boolean {
    if (now - this.state.createdAt > maxAgeMs) return true;
    return this.emptySince !== null && now - this.emptySince > emptyTtlMs;
  }
}
