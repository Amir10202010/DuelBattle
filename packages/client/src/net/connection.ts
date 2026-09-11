import type { ClientMessage, ServerMessage } from '@battle/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'offline';

/**
 * The surface the store depends on. Narrow on purpose: it lets the store be
 * driven by a scripted server in tests without a socket anywhere in sight.
 */
export interface GameConnection {
  on<K extends keyof ConnectionEvents>(event: K, handler: ConnectionEvents[K]): void;
  connect(): void;
  close(): void;
  send(message: ClientMessage): void;
  readonly latencyMs: number | null;
  serverNow(): number;
}

export interface ConnectionEvents {
  message(message: ServerMessage): void;
  status(status: ConnectionStatus): void;
  /** Fired after every successful handshake, including reconnects. */
  ready(): void;
}

/**
 * Messages that would be wrong to replay, so a dropped socket discards them
 * instead of queueing them.
 *
 * The store re-sends the handshake itself on every `ready`; queueing it too
 * would send it twice, and asking to create a room twice is two rooms. A ping
 * held in a queue times the queue rather than the network. And a camera frame
 * from five seconds ago is worse than no frame — a round of them would flood
 * the socket the instant it reopened.
 */
const NEVER_QUEUED: ReadonlySet<ClientMessage['t']> = new Set([
  'hello',
  'createRoom',
  'joinRoom',
  'rejoin',
  'ping',
  'frame',
]);

const BACKOFF_MIN_MS = 400;
const BACKOFF_MAX_MS = 8_000;
const PING_INTERVAL_MS = 12_000;
/** Early pings converge the clock estimate before the first round starts. */
const PING_WARMUP_DELAYS_MS = [0, 600, 1_800];

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

/**
 * A resilient WebSocket to the game server.
 *
 * Owns three things the rest of the app should not have to think about:
 * reconnection with backoff, a send queue that survives a dropped socket, and a
 * running estimate of the offset between this browser's clock and the server's,
 * so every countdown on screen is drawn against server time.
 */
export class Connection implements GameConnection {
  private socket: WebSocket | null = null;
  private status: ConnectionStatus = 'connecting';
  private attempts = 0;
  private queue: ClientMessage[] = [];
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private warmupTimers: number[] = [];
  private readonly pending = new Map<number, number>();
  private nextPingId = 1;
  private bestRtt = Number.POSITIVE_INFINITY;
  private offsetMs = 0;
  private closedByUs = false;
  private readonly handlers: Partial<ConnectionEvents> = {};

  constructor(private readonly url: string = socketUrl()) {}

  on<K extends keyof ConnectionEvents>(event: K, handler: ConnectionEvents[K]): void {
    this.handlers[event] = handler;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  /** Round-trip time of the best sample so far, in milliseconds. */
  get latencyMs(): number | null {
    return Number.isFinite(this.bestRtt) ? Math.round(this.bestRtt) : null;
  }

  /** The server's clock, as best we can estimate it. */
  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.closedByUs = false;
    this.setStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.setStatus('open');
      // The handshake goes first. Everything in the queue needs a session to
      // land in, and a reconnected socket does not have one until the store
      // has re-entered the room — flushing ahead of that got every queued
      // action answered with "Join a room first." and dropped. Messages are
      // handled in order on the socket, so the rejoin is applied before them.
      this.handlers.ready?.();
      this.flush();
      this.startPings();
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (message.t === 'pong') {
        this.onPong(message.id, message.serverTime);
        return;
      }
      this.handlers.message?.(message);
    };

    socket.onclose = () => {
      this.stopPings();
      this.socket = null;
      if (this.closedByUs) {
        this.setStatus('offline');
        return;
      }
      this.scheduleReconnect();
    };

    socket.onerror = () => {
      // `close` always follows, and that is where reconnection is handled.
    };
  }

  /**
   * Queues a message when the socket is down, so a blip does not cost you the
   * round you were locking in. See NEVER_QUEUED for what is dropped instead.
   */
  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
      return;
    }
    if (NEVER_QUEUED.has(message.t)) return;
    if (this.queue.length < 32) this.queue.push(message);
  }

  close(): void {
    this.closedByUs = true;
    this.clearTimers();
    this.queue = [];
    this.socket?.close();
    this.socket = null;
    this.setStatus('offline');
  }

  private flush(): void {
    const queued = this.queue;
    this.queue = [];
    for (const message of queued) this.send(message);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.handlers.status?.(status);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) return;
    this.setStatus('reconnecting');
    const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** this.attempts);
    // Jitter keeps a whole lobby of clients from retrying in lockstep.
    const delay = base * (0.6 + Math.random() * 0.6);
    this.attempts++;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPings(): void {
    this.stopPings();
    for (const delay of PING_WARMUP_DELAYS_MS) {
      this.warmupTimers.push(window.setTimeout(() => this.ping(), delay));
    }
    this.pingTimer = window.setInterval(() => this.ping(), PING_INTERVAL_MS);
  }

  private stopPings(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    this.pingTimer = null;
    for (const timer of this.warmupTimers) window.clearTimeout(timer);
    this.warmupTimers = [];
    this.pending.clear();
  }

  private clearTimers(): void {
    this.stopPings();
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private ping(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const id = this.nextPingId++;
    this.pending.set(id, Date.now());
    // Bound the map in case a server stops answering.
    if (this.pending.size > 16) {
      const oldest = this.pending.keys().next().value;
      if (oldest !== undefined) this.pending.delete(oldest);
    }
    this.socket.send(JSON.stringify({ t: 'ping', id } satisfies ClientMessage));
  }

  private onPong(id: number, serverTime: number): void {
    const sentAt = this.pending.get(id);
    if (sentAt === undefined) return;
    this.pending.delete(id);

    const now = Date.now();
    const rtt = now - sentAt;
    // Keep the offset from the fastest round trip seen: the shortest sample is
    // the least distorted by queueing in either direction.
    if (rtt > this.bestRtt) return;
    this.bestRtt = rtt;
    this.offsetMs = serverTime + rtt / 2 - now;
  }
}
