import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  STARTING_RATING,
  normalizeAvatar,
  normalizeRoomCode,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@battle/shared';
import { clientMessageSchema } from '@battle/shared/validation';
import type { Room } from './room.js';
import type { Identities } from './identity.js';
import { publicView, type ProfileStore } from './profiles.js';
import { profileFor } from './standings.js';
import { buildBoard, isBoardKind } from './leaderboard.js';
import { MatchQueue } from './queue.js';
import { RoomCapacityError, type RoomManager } from './rooms.js';
import { config } from './config.js';
import { TokenBuckets, type LimiterOptions } from './limiter.js';
import { log } from './log.js';
import type { AuthService } from './auth.js';

/** Ceiling on a single frame, above the largest legal message by a small margin. */
const MAX_MESSAGE_BYTES = 300_000;

/**
 * Per-IP budget for opening rooms.
 *
 * Nothing else stops one client filling the global room table: at the message
 * rate a socket is already allowed, five hundred rooms takes twenty seconds,
 * and each one occupies its slot for five minutes after the last person leaves.
 * That is a denial of service anyone could run from a browser console.
 *
 * Per IP rather than per connection, because opening another connection is
 * exactly what the attack would do next.
 */
function defaultCreateLimit(): LimiterOptions {
  return {
    burst: config.roomCreateBurst,
    refillPerSec: config.roomCreatePerMin / 60,
  };
}
interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

function drain(bucket: TokenBucket, ratePerSec: number, burst: number, now: number): boolean {
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.lastRefill = now;
  bucket.tokens = Math.min(burst, bucket.tokens + elapsed * ratePerSec);
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

let nextSessionKey = 1;

interface Session {
  language: 'en' | 'ru';
  authToken: string;
  guestIdentity: string | null;
  mode: 'ranked' | 'casual';
  /** Stable for the life of the socket. Only the queue needs one. */
  key: string;
  socket: WebSocket;
  ip: string;
  room: Room | null;
  playerId: string | null;
  /** Who this browser is across visits, once `hello` has established it. */
  identity: string | null;
  /** The name they last asked to play under, for a queued match. */
  queuedName: string;
  connectedAt: number;
  alive: boolean;
  messages: TokenBucket;
  images: TokenBucket;
  /** Set once a violation has been reported, so we warn at most once. */
  warnedRateLimit: boolean;
}

export class Gateway {
  private readonly wss: WebSocketServer;
  private readonly sessions = new Set<Session>();
  private readonly perIp = new Map<string, number>();
  private readonly createLimiter: TokenBuckets;
  private readonly queue = new MatchQueue();
  private readonly queued = new Map<string, Session>();
  private heartbeat: NodeJS.Timeout | null = null;
  private readonly boardLimiter = new TokenBuckets({ burst: 6, refillPerSec: 0.5 });
  private readonly recentOpponents = new Map<string, string[]>();

  constructor(
    private readonly rooms: RoomManager,
    createLimit: LimiterOptions | undefined = undefined,
    private readonly identities: Identities | null = null,
    private readonly profiles: ProfileStore | null = null,
    private readonly auth: AuthService | null = null,
  ) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
    this.createLimiter = new TokenBuckets(createLimit ?? defaultCreateLimit());
  }

  start(): void {
    this.heartbeat = setInterval(() => this.sweepSockets(), config.heartbeatMs);
    this.heartbeat.unref?.();
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const session of this.sessions) session.socket.terminate();
    this.wss.close();
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.isOriginAllowed(request)) {
      log.warn('rejected upgrade from disallowed origin', { origin: request.headers.origin });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const ip = clientIp(request);
    if ((this.perIp.get(ip) ?? 0) >= config.maxConnectionsPerIp) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (ws) =>
      this.onConnection(ws, ip, this.auth?.token(request) ?? ''),
    );
  }

  /**
   * An empty allow-list means same-origin only, which is what the single-service
   * deployment wants. Browsers always send Origin for a WebSocket handshake, so
   * a missing one is a non-browser client and is allowed through: it cannot be
   * a cross-site request forgery.
   */
  private isOriginAllowed(request: IncomingMessage): boolean {
    const origin = request.headers.origin;
    if (!origin) return true;
    if (config.allowedOrigins.length > 0) return config.allowedOrigins.includes(origin);
    const host = request.headers.host;
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  private onConnection(socket: WebSocket, ip: string, authToken: string): void {
    const now = Date.now();
    const session: Session = {
      key: `s${nextSessionKey++}`,
      language: 'en',
      authToken,
      guestIdentity: null,
      mode: 'casual',
      socket,
      ip,
      room: null,
      playerId: null,
      identity: this.auth?.resolve(authToken)?.id ?? null,
      queuedName: '',
      connectedAt: now,
      alive: true,
      messages: { tokens: config.messageRatePerSec, lastRefill: now },
      images: { tokens: config.imageRatePerSec, lastRefill: now },
      warnedRateLimit: false,
    };
    this.sessions.add(session);
    this.perIp.set(ip, (this.perIp.get(ip) ?? 0) + 1);

    socket.on('pong', () => {
      session.alive = true;
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        this.fail(session, 'bad-message', 'Binary frames are not supported.', true);
        return;
      }
      this.onMessage(session, data.toString());
    });
    socket.on('close', () => this.onClose(session));
    socket.on('error', (err) => {
      log.debug('socket error', { error: err.message });
    });

    send(socket, { t: 'welcome', protocol: PROTOCOL_VERSION, serverTime: now });
  }

  private onClose(session: Session): void {
    if (!this.sessions.delete(session)) return;
    this.dequeue(session);
    const remaining = (this.perIp.get(session.ip) ?? 1) - 1;
    if (remaining <= 0) this.perIp.delete(session.ip);
    else this.perIp.set(session.ip, remaining);

    if (session.room && session.playerId) {
      session.room.detach(session.playerId, Date.now());
    }
  }

  private onMessage(session: Session, raw: string): void {
    const now = Date.now();
    if (!drain(session.messages, config.messageRatePerSec, config.messageRatePerSec * 2, now)) {
      this.rateLimited(session);
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.fail(session, 'bad-message', 'Malformed message.');
      return;
    }

    const result = clientMessageSchema.safeParse(parsed);
    if (!result.success) {
      // Live frames are best-effort and arrive several times a second. Telling
      // the client about a bad one would put an error on screen four times a
      // second; dropping it costs a quarter of a second of video.
      if (isFrameMessage(parsed)) return;
      this.fail(session, 'bad-message', result.error.issues[0]?.message ?? 'Unsupported message.');
      return;
    }
    const message = result.data;

    if (message.t === 'submit' || message.t === 'frame') {
      if (!drain(session.images, config.imageRatePerSec, config.imageRatePerSec * 2, now)) {
        // Frames are best-effort; dropping one silently is better than a toast
        // storm, and the next frame is 250ms away.
        if (message.t === 'submit') this.rateLimited(session);
        return;
      }
    }

    try {
      this.route(session, message, now);
    } catch (err) {
      log.error('message handler threw', {
        type: message.t,
        errorType: err instanceof Error ? err.name : 'unknown',
      });
      this.fail(session, 'server-error', 'Something went wrong on our side.');
    }
  }

  private route(session: Session, message: ClientMessage, now: number): void {
    if (this.auth && session.identity && !this.auth.resolve(session.authToken)) {
      this.fail(session, 'session-expired', 'Your session ended. Sign in again.', true);
      return;
    }
    switch (message.t) {
      case 'hello': {
        if (message.protocol !== PROTOCOL_VERSION) {
          this.fail(
            session,
            'protocol-mismatch',
            'This tab is running an old version. Reload to continue.',
            true,
          );
          return;
        }
        session.language = message.language ?? 'en';
        if (session.language === 'ru') session.room?.useRussianTopics();
        if (session.room || this.queued.has(session.key)) return;
        if (!this.identities) return;
        // An unsigned or unrecognised token is not an error worth telling
        // anybody about: it is a first visit, or a browser that cleared its
        // storage. Either way they get a new name and carry on.
        const known = this.identities.verify(message.identity);
        if (known) {
          session.guestIdentity = known;
        } else {
          const token = this.identities.issue();
          session.guestIdentity = this.identities.verify(token);
          send(session.socket, { t: 'identity', token });
        }
        // Legacy identities are only supported by injected test stores. Production
        // progression always requires a revocable account session.
        if (!this.auth && config.nodeEnv === 'test') session.identity = session.guestIdentity;
        if (session.identity && this.profiles) {
          // The front page can greet a returning player by rank rather than
          // waiting for a match to tell them.
          send(session.socket, {
            t: 'profile',
            profile: publicView(profileFor(this.profiles, session.identity, '', now), true),
          });
        }
        return;
      }
      case 'ping':
        send(session.socket, { t: 'pong', id: message.id, serverTime: now });
        return;
      case 'createRoom':
        this.createRoom(session, message.name, now);
        return;
      case 'joinRoom':
        this.joinRoom(session, message.code, message.name, now);
        return;
      case 'rejoin':
        this.rejoinRoom(session, message.code, message.token, now);
        return;
      case 'findMatch':
        this.enqueue(
          session,
          message.name,
          now,
          message.mode ?? (session.identity ? 'ranked' : 'casual'),
        );
        return;
      case 'cancelFind':
        if (this.dequeue(session)) send(session.socket, { t: 'unqueued' });
        return;
      case 'setProfile':
        this.updateProfile(session, message, now);
        return;
      case 'leaderboard':
        this.sendBoard(session, message.board, message.offset ?? 0);
        return;
      default:
        break;
    }

    if (!session.room || !session.playerId) {
      this.fail(session, 'not-in-room', 'Join a room first.');
      return;
    }
    session.room.handle(session.playerId, message, now);
    if (message.t === 'leave') {
      this.clearMembership(session);
      this.refreshProfile(session, now);
    }
  }

  private createRoom(session: Session, name: string, now: number): void {
    if (!this.createLimiter.take(session.ip, now)) {
      this.fail(session, 'rate-limited', 'That is a lot of rooms. Give it a moment.');
      return;
    }
    this.leaveCurrentRoom(session, now);
    let room: Room;
    try {
      room = this.rooms.create(now);
    } catch (err) {
      if (err instanceof RoomCapacityError) {
        this.fail(session, 'server-error', 'The server is at capacity. Try again shortly.', true);
        return;
      }
      throw err;
    }
    this.seat(session, room, room.join(name, now), now);
  }

  private joinRoom(session: Session, code: string, name: string, now: number): void {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) {
      this.fail(session, 'room-not-found', 'No room with that code. Check the letters?');
      return;
    }
    // Releasing the current seat first — even when it is in this same room —
    if (room.ranked) {
      this.fail(
        session,
        'rejected',
        'Ranked seats are assigned by matchmaking. Reconnect with your original seat.',
      );
      return;
    }
    // is what stops one socket from occupying both sides of a match.
    this.leaveCurrentRoom(session, now);
    this.seat(session, room, room.join(name, now), now);
  }

  private rejoinRoom(session: Session, code: string, token: string, now: number): void {
    const room = this.rooms.get(normalizeRoomCode(code));
    if (!room) {
      this.fail(session, 'room-not-found', 'That room has closed.');
      return;
    }
    const outcome = room.rejoin(token, now, session.identity);
    // Only give up the seat we hold once the new one is known to be valid.
    if (outcome.ok && (session.room !== room || session.playerId !== outcome.playerId)) {
      this.leaveCurrentRoom(session, now);
    }
    this.seat(session, room, outcome, now);
  }

  private seat(session: Session, room: Room, outcome: ReturnType<Room['join']>, now: number): void {
    if (!outcome.ok || !outcome.playerId || !outcome.token) {
      this.fail(session, outcome.error ?? 'rejected', outcome.message ?? 'Could not join.');
      return;
    }
    session.room = room;
    session.playerId = outcome.playerId;
    if (session.language === 'ru') room.useRussianTopics();
    // Disconnect stale transports BEFORE attach, so their close event cannot
    // mark the newly attached seat offline or continue submitting for it.
    for (const other of this.sessions) {
      if (other !== session && other.room === room && other.playerId === outcome.playerId) {
        this.clearMembership(other);
        this.fail(other, 'session-expired', 'This seat is open in another tab.', true);
      }
    }
    send(session.socket, {
      t: 'joined',
      roomCode: room.code,
      playerId: outcome.playerId,
      token: outcome.token,
    });
    room.attach(outcome.playerId, (msg) => send(session.socket, msg), now);
    if (session.identity) room.identify(outcome.playerId, session.identity, now);
  }

  // -- Matchmaking ---------------------------------------------------------

  /**
   * Joins the queue.
   *
   * The room budget is spent here rather than when a pair is found, because a
   * queue entry is a promise of at most one room and this is the moment the
   * player asked for one. Charging at pairing time would let somebody queue
   * from twenty tabs for free and then hand the bill to whoever they matched.
   */
  private enqueue(session: Session, name: string, now: number, mode: 'ranked' | 'casual'): void {
    if (mode === 'ranked' && !session.identity) {
      this.fail(
        session,
        'rejected',
        'Sign in to unlock ranked battles. Guest play is available in friendly mode.',
      );
      return;
    }
    if (
      [...this.sessions].some(
        (s) =>
          s !== session &&
          session.identity &&
          s.identity === session.identity &&
          (s.room || this.queued.has(s.key)),
      )
    ) {
      this.fail(session, 'rejected', 'Finish your other match or leave its queue first.');
      return;
    }
    if (!this.createLimiter.take(session.ip, now)) {
      this.fail(session, 'rate-limited', 'That is a lot of matches. Give it a moment.');
      return;
    }
    // Looking for a new match means leaving whatever room you were in: a seat
    // held in one room while queueing for another is how a ghost is made.
    this.leaveCurrentRoom(session, now);

    session.queuedName = name;
    if (mode === 'ranked' && session.identity && this.rooms.hasActiveIdentity(session.identity)) {
      this.fail(
        session,
        'rejected',
        'Your ranked seat is still open. Reconnect to finish that match first.',
      );
      return;
    }
    const blockedUntil =
      mode === 'ranked' && session.identity
        ? (this.profiles?.queueCooldown?.(session.identity) ?? 0)
        : 0;
    if (blockedUntil > now) {
      this.fail(
        session,
        'rejected',
        `Ranked play reopens in ${Math.ceil((blockedUntil - now) / 60000)} minutes after leaving a match. Friendly rooms are still available.`,
      );
      return;
    }
    session.mode = mode;
    const rating =
      session.identity && this.profiles
        ? profileFor(this.profiles, session.identity, name, now).rating
        : STARTING_RATING;

    this.queue.add({
      key: session.key,
      identity: session.identity ?? session.guestIdentity,
      rating,
      joinedAt: now,
      mode,
      recentOpponents: this.recentOpponents.get(session.identity ?? '') ?? [],
    });
    this.queued.set(session.key, session);
    this.announceQueue();
  }

  private dequeue(session: Session): boolean {
    this.queued.delete(session.key);
    const was = this.queue.remove(session.key);
    if (was) this.announceQueue();
    return was;
  }

  /** Everybody waiting is told where they are, whenever the line changes. */
  private announceQueue(): void {
    const waiting = this.queue.size;
    for (const [key, session] of this.queued) {
      send(session.socket, { t: 'queued', position: this.queue.positionOf(key), waiting });
    }
  }

  /**
   * Pairs whoever can be paired and puts them in a room together.
   *
   * Called on the same clock that ticks the matches. A pair that cannot be
   * seated — the room table is full, or one of them closed their laptop in the
   * half second it took to get here — puts whoever is left back in the queue
   * rather than dropping them silently.
   */
  matchmake(now: number): void {
    for (const session of this.queued.values()) {
      if (this.auth && session.identity && !this.auth.resolve(session.authToken)) {
        this.dequeue(session);
        this.fail(session, 'session-expired', 'Your session ended. Sign in again.', true);
      }
    }
    const pairs = this.queue.pairs(now);
    if (pairs.length === 0) return;

    for (const [one, two] of pairs) {
      const first = this.queued.get(one.key);
      const second = this.queued.get(two.key);
      this.queued.delete(one.key);
      this.queued.delete(two.key);

      const live = [first, second].filter(
        (s): s is Session => Boolean(s) && s!.socket.readyState === s!.socket.OPEN,
      );
      if (live.length < 2) {
        // One of them is gone. Put the other back where they were, at the front.
        const survivor = live[0];
        const entry = survivor === first ? one : two;
        if (survivor) {
          this.queue.add({ ...entry, joinedAt: entry.joinedAt });
          this.queued.set(survivor.key, survivor);
        }
        continue;
      }

      let room: Room;
      try {
        room = this.rooms.create(now, first!.mode === 'ranked');
      } catch (err) {
        if (!(err instanceof RoomCapacityError)) throw err;
        for (const session of live) {
          this.fail(session, 'server-error', 'The server is at capacity. Try again shortly.');
          send(session.socket, { t: 'unqueued' });
        }
        continue;
      }

      for (const session of live) {
        this.seat(session, room, room.join(session.queuedName || 'Player', now), now);
      }
      if (first?.identity && second?.identity) {
        for (const [id, other] of [
          [first.identity, second.identity],
          [second.identity, first.identity],
        ] as const) {
          this.recentOpponents.set(
            id,
            [other, ...(this.recentOpponents.get(id) ?? [])].slice(0, 3),
          );
        }
        if (this.recentOpponents.size > 10000)
          this.recentOpponents.delete(this.recentOpponents.keys().next().value!);
      }
    }

    this.announceQueue();
  }

  // -- Identity ------------------------------------------------------------

  /**
   * The name and avatar this browser plays under.
   *
   * Stored against the identity rather than in the browser, so the name follows
   * a player onto the leaderboard and back after they clear their cache — which
   * is the whole of what an account would have bought them here.
   */
  private updateProfile(
    session: Session,
    message: Extract<ClientMessage, { t: 'setProfile' }>,
    now: number,
  ): void {
    if (!session.identity || !this.profiles) {
      this.fail(session, 'rejected', 'Sign in to unlock your player profile.');
      return;
    }
    const current = profileFor(this.profiles, session.identity, '', now);
    const updated = {
      ...current,
      ...(message.name ? { name: message.name } : {}),
      ...(message.avatar ? { avatar: normalizeAvatar(message.avatar) } : {}),
      lastSeenAt: now,
    };
    this.profiles.save(updated);
    send(session.socket, { t: 'profile', profile: publicView(updated, true) });
  }

  private sendBoard(session: Session, board: string, offset: number): void {
    if (!this.profiles || !session.identity) {
      this.fail(session, 'rejected', 'Sign in to unlock the leaderboard.');
      return;
    }
    if (!this.boardLimiter.take(session.ip, Date.now())) {
      this.fail(session, 'rate-limited', 'The board is refreshing too quickly. Try again shortly.');
      return;
    }
    const kind = isBoardKind(board) ? board : 'rating';
    const built = buildBoard(this.profiles, kind, session.identity, 25, offset);
    send(session.socket, {
      t: 'leaderboard',
      board: built.kind,
      offset: built.offset,
      entries: built.entries,
      total: built.total,
      you: built.you,
    });
  }

  private leaveCurrentRoom(session: Session, now: number): void {
    if (!session.room || !session.playerId) return;
    session.room.remove(session.playerId, now);
    this.clearMembership(session);
    this.refreshProfile(session, now);
  }

  private refreshProfile(session: Session, now: number): void {
    if (session.identity && this.profiles) {
      send(session.socket, {
        t: 'profile',
        profile: publicView(profileFor(this.profiles, session.identity, '', now), true),
      });
    }
  }

  private clearMembership(session: Session): void {
    session.room = null;
    session.playerId = null;
  }

  private rateLimited(session: Session): void {
    if (session.warnedRateLimit) return;
    session.warnedRateLimit = true;
    this.fail(session, 'rate-limited', 'Slow down a moment.');
    setTimeout(() => {
      session.warnedRateLimit = false;
    }, 2_000).unref?.();
  }

  private fail(session: Session, code: ErrorCode, message: string, fatal = false): void {
    send(session.socket, { t: 'error', code, message, ...(fatal ? { fatal: true } : {}) });
    if (fatal) session.socket.close(4000, code);
  }

  private sweepSockets(): void {
    const now = Date.now();
    for (const session of this.sessions) {
      if (!session.alive) {
        session.socket.terminate();
        continue;
      }
      if (!session.room && now - session.connectedAt > config.idleSocketTtlMs) {
        session.socket.close(4001, 'idle');
        continue;
      }
      session.alive = false;
      session.socket.ping();
    }
  }
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function isFrameMessage(parsed: unknown): boolean {
  return typeof parsed === 'object' && parsed !== null && (parsed as { t?: unknown }).t === 'frame';
}

function clientIp(request: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first) return first.trim();
  }
  return request.socket.remoteAddress ?? 'unknown';
}
