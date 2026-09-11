import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  normalizeRoomCode,
  type ClientMessage,
  type ErrorCode,
  type ServerMessage,
} from '@battle/shared';
import { clientMessageSchema } from '@battle/shared/validation';
import type { Room } from './room.js';
import { RoomCapacityError, type RoomManager } from './rooms.js';
import { config } from './config.js';
import { log } from './log.js';

/** Ceiling on a single frame, above the largest legal message by a small margin. */
const MAX_MESSAGE_BYTES = 300_000;
/** A connection that has not joined a room within this window is dropped. */
const JOIN_GRACE_MS = 30_000;

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

interface Session {
  socket: WebSocket;
  ip: string;
  room: Room | null;
  playerId: string | null;
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
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(private readonly rooms: RoomManager) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
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
    this.wss.handleUpgrade(request, socket, head, (ws) => this.onConnection(ws, ip));
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

  private onConnection(socket: WebSocket, ip: string): void {
    const now = Date.now();
    const session: Session = {
      socket,
      ip,
      room: null,
      playerId: null,
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
        error: err instanceof Error ? err.stack ?? err.message : String(err),
      });
      this.fail(session, 'server-error', 'Something went wrong on our side.');
    }
  }

  private route(session: Session, message: ClientMessage, now: number): void {
    switch (message.t) {
      case 'hello':
        if (message.protocol !== PROTOCOL_VERSION) {
          this.fail(
            session,
            'protocol-mismatch',
            'This tab is running an old version. Reload to continue.',
            true,
          );
        }
        return;
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
      default:
        break;
    }

    if (!session.room || !session.playerId) {
      this.fail(session, 'not-in-room', 'Join a room first.');
      return;
    }
    session.room.handle(session.playerId, message, now);
    if (message.t === 'leave') this.clearMembership(session);
  }

  private createRoom(session: Session, name: string, now: number): void {
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
    const outcome = room.rejoin(token, now);
    // Only give up the seat we hold once the new one is known to be valid.
    if (outcome.ok && (session.room !== room || session.playerId !== outcome.playerId)) {
      this.leaveCurrentRoom(session, now);
    }
    this.seat(session, room, outcome, now);
  }

  private seat(
    session: Session,
    room: Room,
    outcome: ReturnType<Room['join']>,
    now: number,
  ): void {
    if (!outcome.ok || !outcome.playerId || !outcome.token) {
      this.fail(session, outcome.error ?? 'rejected', outcome.message ?? 'Could not join.');
      return;
    }
    session.room = room;
    session.playerId = outcome.playerId;
    send(session.socket, {
      t: 'joined',
      roomCode: room.code,
      playerId: outcome.playerId,
      token: outcome.token,
    });
    room.attach(outcome.playerId, (msg) => send(session.socket, msg), now);
  }

  private leaveCurrentRoom(session: Session, now: number): void {
    if (!session.room || !session.playerId) return;
    session.room.remove(session.playerId, now);
    this.clearMembership(session);
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
      if (!session.room && now - session.connectedAt > JOIN_GRACE_MS) {
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

function clientIp(request: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = request.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first) return first.trim();
  }
  return request.socket.remoteAddress ?? 'unknown';
}
