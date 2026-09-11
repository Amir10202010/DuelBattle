import { randomBytes, randomUUID } from 'node:crypto';
import { selectChallenge, type Challenge } from '../shared/challenges';
import { firstConfirmed } from '../shared/adjudication';
import type { Frame } from '../shared/vision/frame';
import {
  canTransition,
  type GameState,
  type Player,
  type Round,
  type RoomSnapshot,
} from '../shared/protocol';
import { requireRule } from './errors';
import { Store } from './store';
import {
  decodeEvidence,
  evaluateEvidence,
  OpponentVerificationProvider,
  type VerificationProvider,
} from './verification';

interface InternalRoom extends RoomSnapshot {
  round: (Round & { challenge: Challenge }) | null;
  baselines: Map<string, { frame: Frame; at: number }>;
  createdAt: number;
  touchedAt: number;
  sockets: Map<string, string>;
  nonces: Set<string>;
  resume: { state: GameState; remaining: number | null } | null;
  selected: string[];
}
export interface GameConfig {
  countdownMs: number;
  resultMs: number;
  nextMs: number;
  reconnectMs: number;
  roomTtlMs: number;
  maxRooms: number;
  maxRounds: number;
}
const defaultConfig: GameConfig = {
  countdownMs: 3000,
  resultMs: 3500,
  nextMs: 1200,
  reconnectMs: 30_000,
  roomTtlMs: 30 * 60_000,
  maxRooms: 500,
  maxRounds: 12,
};

export class GameEngine {
  private rooms = new Map<string, InternalRoom>();
  private memberships = new Map<string, string>();
  readonly config: GameConfig;
  constructor(
    private store: Store,
    private emit: (snapshot: RoomSnapshot) => void,
    private now: () => number = Date.now,
    config: Partial<GameConfig> = {},
    private verifier: VerificationProvider = new OpponentVerificationProvider(),
    private random = Math.random,
  ) {
    this.config = { ...defaultConfig, ...config };
  }
  get size() {
    return this.rooms.size;
  }
  private change(room: InternalRoom, state: GameState, deadline: number | null = null) {
    requireRule(
      canTransition(room.state, state),
      'INVALID_STATE',
      'That action is not available right now.',
    );
    room.state = state;
    room.deadline = deadline;
  }
  snapshot(code: string): RoomSnapshot {
    const r = this.get(code);
    return structuredClone({
      code: r.code,
      hostId: r.hostId,
      state: r.state,
      players: r.players,
      bestOf: r.bestOf,
      matchId: r.matchId,
      round: r.round ? this.projectRound(r) : null,
      history: r.history,
      deadline: r.deadline,
      winnerId: r.winnerId,
      message: r.message,
      revision: r.revision,
      serverNow: this.now(),
    });
  }
  /**
   * Before the reveal the client learns that a round exists and when it starts,
   * and nothing else. The prompt is withheld, and so is the race length — a 20
   * second round and a 40 second round would otherwise narrow the catalogue down
   * for anyone reading the socket. Both are reissued at reveal anyway.
   */
  private projectRound(room: InternalRoom): Round {
    const round = room.round!;
    const hidden =
      room.state === 'COUNTDOWN' ||
      (room.state === 'RECONNECTING' && room.resume?.state === 'COUNTDOWN');
    return hidden
      ? { ...round, challenge: null, endsAt: round.startsAt }
      : { ...round, challenge: round.challenge };
  }
  private publish(room: InternalRoom) {
    room.revision++;
    room.touchedAt = this.now();
    this.emit(this.snapshot(room.code));
  }
  private get(code: string) {
    const room = this.rooms.get(code);
    requireRule(room, 'ROOM_NOT_FOUND', 'This battle no longer exists. Start a new one.');
    return room;
  }
  private member(code: string, userId: string, socketId: string) {
    const room = this.get(code);
    const player = room.players.find((p) => p.id === userId);
    requireRule(
      player && room.sockets.get(userId) === socketId && player.connected,
      'NOT_MEMBER',
      'Join this battle to play.',
    );
    return { room, player };
  }
  authorize(code: string, userId: string, socketId: string) {
    return this.member(code, userId, socketId).room;
  }
  private newPlayer(id: string, name: string): Player {
    return {
      id,
      name,
      connected: true,
      ready: false,
      camera: false,
      microphone: false,
      rematch: false,
      score: 0,
    };
  }
  create(userId: string, name: string, socketId: string) {
    const current = this.memberships.get(userId);
    if (current) {
      const existing = this.rooms.get(current);
      if (existing && existing.state !== 'CANCELLED') {
        requireRule(
          existing.sockets.get(userId) === socketId,
          'DUPLICATE_JOIN',
          'You already have a battle open in another tab.',
        );
        return { code: current };
      }
    }
    requireRule(
      this.rooms.size < this.config.maxRooms,
      'BUSY',
      'All arenas are busy. Try again in a moment.',
    );
    const profile = this.store.profile({ id: userId, csrf: '', expiresAt: 0 }, this.now());
    requireRule(
      profile.remaining !== 0,
      'USAGE_LIMIT',
      "You've reached today's free battle limit. Come back after midnight UTC.",
    );
    requireRule(
      !profile.nextBattleAt,
      'USAGE_LIMIT',
      'Your next Premium battle unlocks one hour after your last.',
    );
    let code: string;
    do {
      code = randomBytes(5).toString('hex').toUpperCase();
    } while (this.rooms.has(code));
    const room: InternalRoom = {
      code,
      hostId: userId,
      state: 'WAITING_FOR_PLAYER',
      players: [this.newPlayer(userId, name)],
      bestOf: 5,
      matchId: null,
      round: null,
      history: [],
      deadline: null,
      winnerId: null,
      message: null,
      revision: 0,
      serverNow: this.now(),
      createdAt: this.now(),
      touchedAt: this.now(),
      sockets: new Map([[userId, socketId]]),
      nonces: new Set(),
      baselines: new Map(),
      resume: null,
      selected: [],
    };
    this.rooms.set(code, room);
    this.memberships.set(userId, code);
    this.publish(room);
    return { code };
  }
  join(code: string, userId: string, name: string, socketId: string) {
    const room = this.get(code);
    requireRule(
      room.state !== 'CANCELLED',
      'ROOM_CLOSED',
      'This battle has ended. Start a new one.',
    );
    const current = this.memberships.get(userId);
    requireRule(
      !current || current === code || this.rooms.get(current)?.state === 'CANCELLED',
      'OTHER_ROOM',
      'Leave your current battle before joining another.',
    );
    const player = room.players.find((p) => p.id === userId);
    if (player) {
      const oldSocket = room.sockets.get(userId);
      requireRule(
        !player.connected || oldSocket === socketId,
        'DUPLICATE_JOIN',
        'This battle is open in another tab. Use that tab, or close it first.',
      );
      if (oldSocket === socketId && player.connected) return this.snapshot(code);
      player.connected = true;
      player.camera = false;
      player.microphone = false;
      player.ready = false;
      room.sockets.set(userId, socketId);
      // A paused race resumes only once both cameras are re-enabled, not merely after a socket reconnect.
      this.tryResume(room);
    } else {
      requireRule(
        room.players.length < 2 && room.state === 'WAITING_FOR_PLAYER',
        'ROOM_FULL',
        'This battle already has two players.',
      );
      room.players.push(this.newPlayer(userId, name));
      room.sockets.set(userId, socketId);
      this.change(room, 'READY');
    }
    this.memberships.set(userId, code);
    this.publish(room);
    return this.snapshot(code);
  }
  media(code: string, userId: string, socketId: string, camera: boolean, microphone: boolean) {
    const { room, player } = this.member(code, userId, socketId);
    requireRule(room.state !== 'CANCELLED', 'ROOM_CLOSED', 'This battle has ended.');
    if (player.camera === camera && player.microphone === microphone) return;
    player.camera = camera;
    player.microphone = microphone;
    if (!camera) {
      player.ready = false;
      player.rematch = false;
    }
    if (
      !camera &&
      ['COUNTDOWN', 'CHALLENGE_ACTIVE', 'ROUND_RESULT', 'NEXT_ROUND'].includes(room.state)
    )
      this.pause(room, 'A camera is off. Turn it back on to resume.');
    this.tryResume(room);
    this.publish(room);
  }
  ready(code: string, userId: string, socketId: string, ready: boolean) {
    const { room, player } = this.member(code, userId, socketId);
    requireRule(
      room.state === 'READY' || room.state === 'WAITING_FOR_PLAYER',
      'INVALID_STATE',
      'The battle has already started.',
    );
    requireRule(
      !ready || player.camera,
      'CAMERA_REQUIRED',
      'Turn on your camera before getting ready.',
    );
    player.ready = ready;
    if (
      room.players.length === 2 &&
      room.players.every((p) => p.ready && p.connected && p.camera)
    ) {
      try {
        this.startMatch(room);
      } catch (error) {
        room.players.forEach((p) => (p.ready = false));
        this.publish(room);
        throw error;
      }
    }
    this.publish(room);
  }
  private startMatch(room: InternalRoom) {
    this.store.consumeBattle(
      room.players.map((p) => p.id),
      this.now(),
    );
    room.matchId = randomUUID();
    room.history = [];
    room.winnerId = null;
    room.round = null;
    room.message = null;
    room.players.forEach((p) => {
      p.score = 0;
      p.rematch = false;
    });
    this.prepareRound(room);
  }
  private prepareRound(room: InternalRoom) {
    const challenge = selectChallenge(room.selected, this.random, room.history.length + 1);
    room.baselines.clear();
    room.selected.push(challenge.id);
    room.selected = room.selected.slice(-100);
    room.nonces.clear();
    const startsAt = this.now() + this.config.countdownMs;
    room.round = {
      id: randomUUID(),
      number: room.history.length + 1,
      challenge,
      startsAt,
      endsAt: startsAt + challenge.timeLimit * 1000,
      attempts: [],
      winnerId: null,
      reason: null,
    };
    this.change(room, 'COUNTDOWN', startsAt);
  }
  baseline(code: string, userId: string, socketId: string, roundId: string, image: string) {
    const { room, player } = this.member(code, userId, socketId);
    requireRule(
      room.state === 'COUNTDOWN' && room.round?.id === roundId && this.now() < room.round.startsAt,
      'INVALID_ROUND',
      'The baseline window has closed.',
    );
    requireRule(player.camera, 'CAMERA_REQUIRED', 'Turn on your camera first.');
    // One pre-reveal image per player and round. Never accepted after the prompt.
    if (!room.baselines.has(userId))
      room.baselines.set(userId, { frame: decodeEvidence(image), at: this.now() });
  }
  async submit(
    code: string,
    userId: string,
    socketId: string,
    roundId: string,
    nonce: string,
    image: string,
    contextImages: string[] = [],
  ) {
    const { room, player } = this.member(code, userId, socketId);
    const round = room.round;
    requireRule(
      room.state === 'CHALLENGE_ACTIVE' && round?.id === roundId,
      'INVALID_ROUND',
      'That round is no longer accepting snapshots.',
    );
    requireRule(
      this.now() >= round.startsAt && this.now() < round.endsAt,
      'ROUND_OVER',
      'Time is up for this round.',
    );
    requireRule(player.camera, 'CAMERA_REQUIRED', 'Turn on your camera to submit.');
    requireRule(
      !room.nonces.has(nonce),
      'DUPLICATE_ATTEMPT',
      'That snapshot has already been submitted.',
    );
    requireRule(
      !round.attempts.some(
        (a) => a.playerId === userId && ['checking', 'pending', 'accepted'].includes(a.status),
      ),
      'PENDING_REVIEW',
      'Your snapshot is already with your opponent.',
    );
    requireRule(
      round.attempts.filter((a) => a.playerId === userId).length < 3,
      'ATTEMPT_LIMIT',
      'You have used all three snapshots this round.',
    );
    const receivedAt = this.now();
    requireRule(contextImages.length <= 2, 'BAD_EVIDENCE', 'Too many evidence frames.');
    const frames = [...contextImages, image].map(decodeEvidence);
    room.nonces.add(nonce);
    const attempt: Round['attempts'][number] = {
      id: randomUUID(),
      playerId: userId,
      receivedAt,
      expiresAt: receivedAt + 10_000,
      status: 'checking',
      image,
      contextImages,
    };
    round.attempts.push(attempt);
    this.publish(room);
    const baseline = room.baselines.get(userId);
    const { decision, fallback } = await evaluateEvidence(this.verifier, {
      challenge: round.challenge,
      image,
      frames,
      baseline: baseline && round.startsAt - baseline.at <= 4_000 ? baseline.frame : undefined,
    });
    // Async providers cannot write into a cancelled, restarted or reassigned round.
    requireRule(
      room.state === 'CHALLENGE_ACTIVE' &&
        room.round === round &&
        round.attempts.includes(attempt) &&
        attempt.status === 'checking' &&
        room.sockets.get(userId) === socketId &&
        player.connected &&
        player.camera,
      'INVALID_ROUND',
      'That round is no longer accepting snapshots.',
    );
    if (fallback)
      room.message = 'Verification is unavailable. Your opponent will review your snapshot.';
    if (decision.kind === 'rejected') {
      attempt.status = 'rejected';
      attempt.image = '';
      attempt.contextImages = [];
      attempt.observation = decision.reason;
    } else {
      attempt.status = 'pending';
      attempt.expiresAt = Math.min(receivedAt + 10_000, this.now() + decision.reviewForMs);
      attempt.observation = decision.observation;
    }
    this.settle(room);
    this.publish(room);
  }
  review(
    code: string,
    userId: string,
    socketId: string,
    roundId: string,
    attemptId: string,
    accept: boolean,
  ) {
    const { room } = this.member(code, userId, socketId);
    requireRule(
      room.state === 'CHALLENGE_ACTIVE' && room.round?.id === roundId,
      'INVALID_ROUND',
      'That round has finished.',
    );
    const attempt = room.round.attempts.find((a) => a.id === attemptId);
    requireRule(
      attempt && attempt.playerId !== userId,
      'INVALID_REVIEW',
      'Only the opponent can review this snapshot.',
    );
    requireRule(
      attempt.status === 'pending' && this.now() < attempt.expiresAt,
      'REVIEW_EXPIRED',
      'This review has expired.',
    );
    attempt.status = accept ? 'accepted' : 'rejected';
    attempt.image = '';
    attempt.contextImages = [];
    this.settle(room);
    this.publish(room);
  }
  private settle(room: InternalRoom) {
    const round = room.round!;
    const winner = firstConfirmed(round.attempts, this.now());
    if (winner)
      this.finishRound(room, winner.playerId, 'First valid snapshot, confirmed by the opponent.');
  }
  private finishRound(room: InternalRoom, winnerId: string | null, reason: string) {
    const round = room.round!;
    round.winnerId = winnerId;
    round.reason = reason;
    if (winnerId) room.players.find((p) => p.id === winnerId)!.score++;
    const elapsedMs = Object.fromEntries(
      room.players.map((player) => {
        const confirmed = round.attempts.find(
          (a) => a.playerId === player.id && a.status === 'accepted',
        );
        return [player.id, confirmed ? Math.max(0, confirmed.receivedAt - round.startsAt) : null];
      }),
    );
    room.history.push({
      number: round.number,
      prompt: round.challenge.prompt,
      winnerId,
      reason,
      elapsedMs,
    });
    room.baselines.clear();
    round.attempts = []; // Images are ephemeral and never leave this round.
    this.change(room, 'ROUND_RESULT', this.now() + this.config.resultMs);
  }
  rematch(code: string, userId: string, socketId: string) {
    const { room, player } = this.member(code, userId, socketId);
    requireRule(
      room.state === 'MATCH_RESULT',
      'INVALID_STATE',
      'Finish this match before a rematch.',
    );
    requireRule(player.camera, 'CAMERA_REQUIRED', 'Turn on your camera before the rematch.');
    player.rematch = true;
    if (room.players.every((p) => p.rematch && p.connected && p.camera)) {
      try {
        this.startMatch(room);
      } catch (error) {
        room.players.forEach((p) => (p.rematch = false));
        this.publish(room);
        throw error;
      }
    }
    this.publish(room);
  }
  disconnect(userId: string, socketId: string) {
    const code = this.memberships.get(userId);
    if (!code) return;
    const room = this.rooms.get(code);
    if (!room || room.sockets.get(userId) !== socketId) return;
    const p = room.players.find((p) => p.id === userId)!;
    p.connected = false;
    p.camera = false;
    p.microphone = false;
    p.ready = false;
    room.sockets.delete(userId);
    if (room.state !== 'CANCELLED' && room.state !== 'RECONNECTING')
      this.pause(room, 'Your opponent disconnected. Holding the arena for 30 seconds.');
    this.publish(room);
  }
  private pause(room: InternalRoom, message: string) {
    if (room.round && ['COUNTDOWN', 'CHALLENGE_ACTIVE'].includes(room.state)) {
      room.round.attempts = [];
      room.baselines.clear();
    }
    room.resume = {
      state: room.state,
      remaining: room.deadline === null ? null : Math.max(0, room.deadline - this.now()),
    };
    this.change(room, 'RECONNECTING', this.now() + this.config.reconnectMs);
    room.message = message;
  }
  private tryResume(room: InternalRoom) {
    if (room.state !== 'RECONNECTING' || !room.resume || !room.players.every((p) => p.connected))
      return;
    const { state, remaining } = room.resume;
    const active = ['COUNTDOWN', 'CHALLENGE_ACTIVE', 'NEXT_ROUND'].includes(state);
    if (active && !room.players.every((p) => p.camera)) return;
    if (room.deadline !== null && this.now() >= room.deadline) {
      this.cancel(room, 'The reconnect window ended. Start a new battle.');
      return;
    }
    room.resume = null;
    room.message = null;
    if (state === 'CHALLENGE_ACTIVE' || state === 'COUNTDOWN') {
      room.round!.id = randomUUID();
      room.round!.attempts = [];
      room.nonces.clear();
      room.baselines.clear();
      room.round!.startsAt = this.now() + this.config.countdownMs;
      room.round!.endsAt = room.round!.startsAt + room.round!.challenge.timeLimit * 1000;
      this.change(room, 'COUNTDOWN', room.round!.startsAt);
    } else this.change(room, state, remaining === null ? null : this.now() + remaining);
  }
  leave(code: string, userId: string, socketId: string) {
    const { room } = this.member(code, userId, socketId);
    if (room.state !== 'CANCELLED')
      this.cancel(room, 'A player left the battle. Start a new arena.');
    this.memberships.delete(userId);
    room.sockets.delete(userId);
    room.players.find((p) => p.id === userId)!.connected = false;
    this.publish(room);
  }
  private cancel(room: InternalRoom, message: string) {
    this.change(room, 'CANCELLED');
    room.message = message;
    if (room.round) room.round.attempts = [];
    room.baselines.clear();
    for (const p of room.players)
      if (this.memberships.get(p.id) === room.code) this.memberships.delete(p.id);
  }
  tick() {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      if (
        now - room.touchedAt >= this.config.roomTtlMs ||
        (room.state === 'CANCELLED' && now - room.touchedAt >= 60_000) ||
        now - room.createdAt >= 2 * 60 * 60_000
      ) {
        if (room.state !== 'CANCELLED') {
          this.cancel(room, 'This arena expired. Start a new battle.');
          this.publish(room);
        }
        this.rooms.delete(code);
        continue;
      }
      if (room.state === 'CHALLENGE_ACTIVE') {
        let changed = false;
        for (const attempt of room.round!.attempts)
          if (['checking', 'pending'].includes(attempt.status) && now >= attempt.expiresAt) {
            attempt.status = 'expired';
            attempt.image = '';
            attempt.contextImages = [];
            changed = true;
          }
        if (changed) this.settle(room);
        if (
          room.state === 'CHALLENGE_ACTIVE' &&
          now >= room.round!.endsAt &&
          !room.round!.attempts.some((a) => ['checking', 'pending'].includes(a.status))
        ) {
          this.finishRound(room, null, 'No confirmed snapshot in time. No points this round.');
          changed = true;
        }
        if (changed) this.publish(room);
      } else if (room.deadline !== null && now >= room.deadline) {
        switch (room.state) {
          case 'COUNTDOWN':
            if (!room.players.every((p) => p.connected && p.camera)) {
              this.pause(room, 'A camera is off. Turn it back on to resume.');
              break;
            }
            // Reveal owns the race clock: a delayed tick must not steal playing time.
            room.round!.startsAt = now;
            room.round!.endsAt = now + room.round!.challenge.timeLimit * 1000;
            this.change(room, 'CHALLENGE_ACTIVE', room.round!.endsAt);
            break;
          case 'ROUND_RESULT': {
            const winner = room.players.find((p) => p.score >= Math.ceil(room.bestOf / 2));
            if (winner || room.history.length >= this.config.maxRounds) {
              const [a, b] = room.players;
              room.winnerId =
                winner?.id ?? (a.score === b.score ? null : a.score > b.score ? a.id : b.id);
              // Persist before exposing final state; a transient DB failure is retried by the next tick.
              this.store.saveResult(this.snapshot(code), now);
              this.change(room, 'MATCH_RESULT');
            } else this.change(room, 'NEXT_ROUND', now + this.config.nextMs);
            break;
          }
          case 'NEXT_ROUND':
            this.prepareRound(room);
            break;
          case 'RECONNECTING':
            this.cancel(
              room,
              'Your opponent disconnected or a camera stayed off. The battle was cancelled.',
            );
            break;
        }
        this.publish(room);
      }
    }
  }
}
