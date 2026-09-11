// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerMessage } from '@battle/shared';
import { Connection } from '../src/net/connection.js';

/** A stand-in for the browser's WebSocket that the test drives by hand. */
class MockSocket {
  static readonly instances: MockSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = 0;
  readonly sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    MockSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = this.CLOSED;
    this.onclose?.();
  }

  accept(): void {
    this.readyState = this.OPEN;
    this.onopen?.();
  }

  drop(): void {
    this.readyState = this.CLOSED;
    this.onclose?.();
  }

  deliver(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  parsed(): { t: string; [k: string]: unknown }[] {
    return this.sent.map((s) => JSON.parse(s) as { t: string });
  }
}

beforeEach(() => {
  MockSocket.instances.length = 0;
  vi.stubGlobal('WebSocket', MockSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function latest(): MockSocket {
  const socket = MockSocket.instances.at(-1);
  if (!socket) throw new Error('no socket was opened');
  return socket;
}

describe('sending', () => {
  it('queues an in-room action taken while the socket is down', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    connection.send({ t: 'pass', roundId: 'r1' });
    expect(latest().sent).toHaveLength(0);

    latest().accept();
    expect(latest().parsed()).toContainEqual({ t: 'pass', roundId: 'r1' });
  });

  it('does not queue what the store re-sends on ready', () => {
    // Otherwise a socket coming back sends the handshake twice, and asking to
    // create a room twice is two rooms.
    const connection = new Connection('ws://test/ws');
    connection.on('ready', () => connection.send({ t: 'createRoom', name: 'Ada' }));
    connection.connect();
    connection.send({ t: 'createRoom', name: 'Ada' });

    latest().accept();
    expect(latest().parsed().filter((m) => m.t === 'createRoom')).toHaveLength(1);
  });

  it('re-enters the room before it sends anything that was waiting', () => {
    // A queued action needs a session to land in. Flushed ahead of the rejoin,
    // every one of them came back as "Join a room first." and was lost.
    const connection = new Connection('ws://test/ws');
    connection.on('ready', () => connection.send({ t: 'rejoin', code: 'ABCDE', token: 'tok' }));
    connection.connect();
    latest().accept();

    latest().drop();
    connection.send({ t: 'vote', roundId: 'r4', targetId: 'p2', approve: true });
    vi.advanceTimersByTime(5_000);
    latest().accept();

    const order = latest().parsed().map((m) => m.t);
    expect(order.indexOf('rejoin')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('rejoin')).toBeLessThan(order.indexOf('vote'));
  });

  it('drops live frames rather than queueing stale video', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    connection.send({ t: 'frame', image: 'data:image/jpeg;base64,AAA', seq: 1 });
    connection.send({ t: 'ready', ready: true });
    latest().accept();

    expect(latest().parsed().map((m) => m.t)).toEqual(['ready']);
  });

  it('does not let the queue grow without bound', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    for (let i = 0; i < 200; i++) connection.send({ t: 'ping', id: i });
    latest().accept();
    expect(latest().sent.length).toBeLessThanOrEqual(64);
  });
});

describe('reconnection', () => {
  it('reports status through the whole cycle', () => {
    const connection = new Connection('ws://test/ws');
    const seen: string[] = [];
    connection.on('status', (s) => seen.push(s));

    // It starts out 'connecting', so the first change a listener sees is 'open'.
    expect(connection.connectionStatus).toBe('connecting');
    connection.connect();
    latest().accept();
    latest().drop();
    expect(seen).toEqual(['open', 'reconnecting']);
  });

  it('opens a new socket after backing off', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    latest().accept();
    latest().drop();

    expect(MockSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(MockSocket.instances).toHaveLength(2);
  });

  it('backs off further on repeated failures', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    for (let i = 0; i < 4; i++) {
      latest().accept();
      latest().drop();
      vi.advanceTimersByTime(10_000);
    }
    // Still retrying rather than giving up.
    expect(MockSocket.instances.length).toBeGreaterThanOrEqual(4);
  });

  it('announces readiness on every successful handshake', () => {
    const connection = new Connection('ws://test/ws');
    let readies = 0;
    connection.on('ready', () => readies++);

    connection.connect();
    latest().accept();
    latest().drop();
    vi.advanceTimersByTime(2_000);
    latest().accept();
    expect(readies).toBe(2);
  });

  it('stays closed once closed deliberately', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    latest().accept();
    connection.close();
    vi.advanceTimersByTime(30_000);
    expect(MockSocket.instances).toHaveLength(1);
  });
});

describe('clock sync', () => {
  it('estimates the server clock from the fastest round trip', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const connection = new Connection('ws://test/ws');
    connection.connect();
    latest().accept();
    vi.advanceTimersByTime(0); // flush the immediate first ping without moving the clock

    const ping = latest().parsed().find((m) => m.t === 'ping');
    expect(ping).toBeDefined();

    // A 100ms round trip to a server whose clock reads 5s ahead.
    vi.advanceTimersByTime(100);
    const serverTime = Date.now() + 5_000 - 50;
    latest().deliver({ t: 'pong', id: ping!.id as number, serverTime });

    expect(connection.latencyMs).toBe(100);
    expect(connection.serverNow() - Date.now()).toBeCloseTo(5_000, -1);
  });

  it('ignores a slower sample that would skew the estimate', () => {
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const connection = new Connection('ws://test/ws');
    connection.connect();
    latest().accept();
    vi.advanceTimersByTime(0);

    const pings = () => latest().parsed().filter((m) => m.t === 'ping');
    vi.advanceTimersByTime(20);
    latest().deliver({ t: 'pong', id: pings()[0]!.id as number, serverTime: Date.now() - 10 });
    const fast = connection.serverNow() - Date.now();

    vi.advanceTimersByTime(600);
    const second = pings()[1];
    if (second) {
      vi.advanceTimersByTime(900);
      latest().deliver({ t: 'pong', id: second.id as number, serverTime: Date.now() + 400 });
    }
    expect(connection.latencyMs).toBe(20);
    expect(connection.serverNow() - Date.now()).toBeCloseTo(fast, 0);
  });

  it('never treats a pong it did not ask for as a sample', () => {
    const connection = new Connection('ws://test/ws');
    connection.connect();
    latest().accept();
    vi.advanceTimersByTime(0);
    latest().deliver({ t: 'pong', id: 9999, serverTime: Date.now() + 60_000 });
    expect(Math.abs(connection.serverNow() - Date.now())).toBeLessThan(1_000);
  });
});

describe('message handling', () => {
  it('passes server messages through but keeps pongs to itself', () => {
    const connection = new Connection('ws://test/ws');
    const seen: ServerMessage[] = [];
    connection.on('message', (m) => seen.push(m));

    connection.connect();
    latest().accept();
    latest().deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 't' });
    latest().deliver({ t: 'pong', id: 1, serverTime: 0 });

    expect(seen.map((m) => m.t)).toEqual(['joined']);
  });

  it('survives a malformed frame', () => {
    const connection = new Connection('ws://test/ws');
    const seen: ServerMessage[] = [];
    connection.on('message', (m) => seen.push(m));

    connection.connect();
    latest().accept();
    expect(() => latest().onmessage?.({ data: 'not json' })).not.toThrow();
    latest().deliver({ t: 'toast', kind: 'info', message: 'still here' });
    expect(seen).toHaveLength(1);
  });
});
