// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { ClientMessage, ServerMessage } from '@battle/shared';
import type { ConnectionEvents, ConnectionStatus, GameConnection } from '../src/net/connection.js';
import { MatchStore, recoverableSession } from '../src/net/store.js';
import { publicMatch } from './fixtures.js';

/** A scripted server: records what the client sends, replays what we choose. */
class FakeConnection implements GameConnection {
  readonly sent: ClientMessage[] = [];
  latencyMs: number | null = 21;
  bufferedBytes = 0;
  private readonly handlers: Partial<ConnectionEvents> = {};

  on<K extends keyof ConnectionEvents>(event: K, handler: ConnectionEvents[K]): void {
    this.handlers[event] = handler;
  }

  connect(): void {
    this.open();
  }

  close(): void {
    this.handlers.status?.('offline');
  }

  send(message: ClientMessage): void {
    this.sent.push(message);
  }

  serverNow(): number {
    return Date.now();
  }

  /** Simulates a (re)connection completing its handshake. */
  open(): void {
    this.handlers.status?.('open');
    this.handlers.ready?.();
  }

  drop(status: ConnectionStatus = 'reconnecting'): void {
    this.handlers.status?.(status);
  }

  deliver(message: ServerMessage): void {
    this.handlers.message?.(message);
  }

  sentTypes(): string[] {
    return this.sent.map((m) => m.t);
  }

  lastOfType<T extends ClientMessage['t']>(t: T): Extract<ClientMessage, { t: T }> | undefined {
    return [...this.sent].reverse().find((m): m is Extract<ClientMessage, { t: T }> => m.t === t);
  }
}

function setup() {
  const connection = new FakeConnection();
  const store = new MatchStore(connection);
  store.start();
  return { connection, store };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('joining', () => {
  it('says hello before anything else on every connection', () => {
    const { connection } = setup();
    expect(connection.sentTypes()[0]).toBe('hello');
  });

  it('seats the player and remembers the room', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });

    const snapshot = store.getSnapshot();
    expect(snapshot.screen).toBe('room');
    expect(snapshot.you).toBe('p1');
    expect(snapshot.roomCode).toBe('AB12C');
    expect(snapshot.joining).toBe(false);
  });

  it('replays the pending join when the socket comes back', () => {
    const { connection, store } = setup();
    store.joinRoom('AB12C', 'Ada');
    connection.drop();
    connection.open();

    const joins = connection.sent.filter((m) => m.t === 'joinRoom');
    expect(joins).toHaveLength(2);
  });

  it('reconnects into the same seat rather than joining again', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });

    connection.drop();
    connection.open();

    expect(connection.lastOfType('rejoin')).toMatchObject({ code: 'AB12C', token: 'tok-1' });
    // Crucially it does not open a second room.
    expect(connection.sent.filter((m) => m.t === 'createRoom')).toHaveLength(1);
  });
});

describe('seat ownership', () => {
  it('never lets a second tab walk into the first tab\u2019s seat', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });

    // A second tab of the same browser: localStorage is shared, sessionStorage
    // is not. Opening the same invite link must not hand over the live seat.
    sessionStorage.clear();
    const second = setup();
    expect(second.store.resumeSession('AB12C')).toBe(false);
    expect(second.connection.lastOfType('rejoin')).toBeUndefined();
  });

  it('offers a browser-level seat back instead of taking it silently', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });

    // The tab was closed: the browser still remembers, this tab does not.
    sessionStorage.clear();
    expect(recoverableSession('AB12C')).toEqual({ name: 'Ada' });

    const fresh = setup();
    expect(fresh.store.recoverSession('AB12C')).toBe(true);
    expect(fresh.connection.lastOfType('rejoin')?.token).toBe('tok-1');
  });

  it('does not offer a seat this tab already holds', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });
    expect(recoverableSession('AB12C')).toBeNull();
  });

  it('keeps sessions for different rooms apart', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AAAAA', playerId: 'p1', token: 'tok-a' });
    store.joinRoom('BBBBB', 'Ada');
    connection.deliver({ t: 'joined', roomCode: 'BBBBB', playerId: 'p2', token: 'tok-b' });

    expect(store.resumeSession('AAAAA')).toBe(true);
    expect(connection.lastOfType('rejoin')?.token).toBe('tok-a');
  });

  it('forgets an expired session instead of retrying it forever', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });
    connection.deliver({
      t: 'error',
      code: 'session-expired',
      message: 'That session has expired.',
    });

    expect(store.getSnapshot().screen).toBe('home');
    expect(store.getSnapshot().joinError).toMatch(/expired/);
    expect(store.resumeSession('AB12C')).toBe(false);

    const before = connection.sent.length;
    connection.open();
    // Nothing is replayed: the intent is gone with the seat.
    expect(connection.sent.slice(before).map((m) => m.t)).toEqual(['hello']);
  });

  it('does not strand a player in a room that no longer exists', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });
    connection.deliver({ t: 'state', state: publicMatch(), serverTime: 0 });
    expect(store.getSnapshot().screen).toBe('room');

    // The server restarted; the room went with it.
    connection.deliver({ t: 'error', code: 'room-not-found', message: 'That room has closed.' });

    const snapshot = store.getSnapshot();
    expect(snapshot.screen).toBe('home');
    expect(snapshot.match).toBeNull();
    expect(snapshot.joinError).toBe('That room has closed.');
    expect(store.resumeSession('AB12C')).toBe(false);
  });

  it('leaves the home screen alone when a join is simply refused', () => {
    const { connection, store } = setup();
    store.joinRoom('AB12C', 'Ada');
    connection.deliver({ t: 'error', code: 'room-full', message: 'That room is full.' });
    expect(store.getSnapshot().screen).toBe('home');
    expect(store.getSnapshot().joinError).toBe('That room is full.');
  });

  it('drops the session when the player leaves on purpose', () => {
    const { connection, store } = setup();
    store.createRoom('Ada');
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });
    store.leave();

    // A state already in flight must not return the player to the room.
    connection.deliver({ t: 'state', state: publicMatch(), serverTime: 0 });

    expect(store.getSnapshot().screen).toBe('home');
    expect(store.getSnapshot().roomCode).toBeNull();
    expect(store.resumeSession('AB12C')).toBe(false);
    expect(recoverableSession('AB12C')).toBeNull();
  });
});

describe('errors', () => {
  it('shows a failed join inline rather than as a passing toast', () => {
    const { connection, store } = setup();
    store.joinRoom('AB12C', 'Ada');
    connection.deliver({ t: 'error', code: 'room-not-found', message: 'No room with that code.' });

    expect(store.getSnapshot().joinError).toBe('No room with that code.');
    expect(store.getSnapshot().joining).toBe(false);
    expect(store.getSnapshot().toasts).toHaveLength(0);
  });

  it('does not retry a join that was refused', () => {
    const { connection, store } = setup();
    store.joinRoom('AB12C', 'Ada');
    connection.deliver({ t: 'error', code: 'room-full', message: 'That room is full.' });

    const before = connection.sent.length;
    connection.open();
    expect(connection.sent.slice(before).map((m) => m.t)).toEqual(['hello']);
  });

  it('surfaces an in-match rejection as a toast and carries on', () => {
    const { connection, store } = setup();
    connection.deliver({ t: 'error', code: 'rejected', message: 'Too late.' });
    expect(store.getSnapshot().toasts.map((t) => t.message)).toEqual(['Too late.']);
    expect(store.getSnapshot().fatalError).toBeNull();
  });

  it('blocks the UI only for something a retry cannot fix', () => {
    const { connection, store } = setup();
    connection.deliver({
      t: 'error',
      code: 'protocol-mismatch',
      message: 'Reload to continue.',
      fatal: true,
    });
    expect(store.getSnapshot().fatalError).toBe('Reload to continue.');
  });

  it('keeps at most a few toasts on screen', () => {
    const { connection, store } = setup();
    for (let i = 0; i < 8; i++) {
      connection.deliver({ t: 'toast', kind: 'info', message: `note ${i}` });
    }
    expect(store.getSnapshot().toasts.length).toBeLessThanOrEqual(3);
  });
});

describe('match traffic', () => {
  it('keeps the latest state', () => {
    const { connection, store } = setup();
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });
    connection.deliver({ t: 'state', state: publicMatch({ version: 4 }), serverTime: 0 });
    connection.deliver({
      t: 'state',
      state: publicMatch({ version: 5, phase: 'countdown' }),
      serverTime: 0,
    });
    expect(store.getSnapshot().match?.version).toBe(5);
    expect(store.getSnapshot().match?.phase).toBe('countdown');
  });

  it('files evidence under its round and player', () => {
    const { connection, store } = setup();
    connection.deliver({
      t: 'evidence',
      roundId: 'r1',
      playerId: 'p2',
      image: 'data:image/jpeg;base64,AAA',
    });
    expect(store.getSnapshot().evidence['r1:p2']).toBe('data:image/jpeg;base64,AAA');
  });

  it('routes live frames past React entirely', () => {
    const { connection, store } = setup();
    const seen: string[] = [];
    const unsubscribe = store.onPeerFrame((image, from) => seen.push(`${from}:${image}`));

    const before = store.getSnapshot();
    connection.deliver({
      t: 'peerFrame',
      playerId: 'p2',
      image: 'data:image/jpeg;base64,BBB',
      seq: 1,
    });

    expect(seen).toEqual(['p2:data:image/jpeg;base64,BBB']);
    // No new snapshot, so nothing re-renders for a video frame.
    expect(store.getSnapshot()).toBe(before);
    unsubscribe();
  });

  it('notifies subscribers when something actually changes', () => {
    const { connection, store } = setup();
    connection.deliver({ t: 'joined', roomCode: 'AB12C', playerId: 'p1', token: 'tok-1' });
    let calls = 0;
    store.subscribe(() => calls++);
    connection.deliver({ t: 'state', state: publicMatch(), serverTime: 0 });
    expect(calls).toBe(1);
  });
});
