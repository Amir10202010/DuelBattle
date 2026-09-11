import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  getChallenge,
  type ClientMessage,
  type PublicMatchState,
  type ServerMessage,
} from '@battle/shared';
import { createApp, type App } from '../src/app.js';
import { emptyRoomFrame, passingFrameFor } from './helpers.js';

/** A test client that speaks the real protocol over a real socket. */
class Player {
  readonly received: ServerMessage[] = [];
  playerId = '';
  token = '';
  private readonly waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.received.push(message);
      if (message.t === 'joined') {
        this.playerId = message.playerId;
        this.token = message.token;
      }
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const waiter = this.waiters[i]!;
        if (!waiter.match(message)) continue;
        this.waiters.splice(i, 1);
        waiter.resolve(message);
      }
    });
  }

  static async connect(port: number): Promise<Player> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const player = new Player(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    await player.waitFor((m) => m.t === 'welcome');
    player.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    return player;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor<T extends ServerMessage>(
    match: (m: ServerMessage) => boolean,
    timeoutMs = 4_000,
  ): Promise<T> {
    const existing = this.received.find(match);
    if (existing) return Promise.resolve(existing as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for a message (${this.received.length} seen)`)),
        timeoutMs,
      );
      this.waiters.push({
        match,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as T);
        },
      });
    });
  }

  waitForState(predicate: (s: PublicMatchState) => boolean, timeoutMs = 6_000) {
    return this.waitFor<Extract<ServerMessage, { t: 'state' }>>(
      (m) => m.t === 'state' && predicate(m.state),
      timeoutMs,
    ).then((m) => m.state);
  }

  get state(): PublicMatchState {
    const last = [...this.received].reverse().find((m) => m.t === 'state');
    if (!last || last.t !== 'state') throw new Error('no state yet');
    return last.state;
  }

  onClose(handler: (code: number) => void): void {
    this.socket.once('close', handler);
  }

  close(): void {
    this.socket.close();
  }
}

let app: App;
let port: number;

beforeAll(async () => {
  app = createApp({ tickMs: 25 });
  port = await app.listen(0, '127.0.0.1');
});

afterAll(async () => {
  await app.close();
});

async function pair(): Promise<{ host: Player; guest: Player; code: string }> {
  const host = await Player.connect(port);
  host.send({ t: 'createRoom', name: 'Ada' });
  const joined = await host.waitFor<Extract<ServerMessage, { t: 'joined' }>>((m) => m.t === 'joined');

  const guest = await Player.connect(port);
  guest.send({ t: 'joinRoom', code: joined.roomCode, name: 'Grace' });
  await guest.waitFor((m) => m.t === 'joined');
  await host.waitForState((s) => Object.keys(s.players).length === 2);

  return { host, guest, code: joined.roomCode };
}

describe('http surface', () => {
  it('reports health', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it('answers room lookups so the join screen can fail fast', async () => {
    const { code } = await pair();
    const found = await fetch(`http://127.0.0.1:${port}/api/rooms/${code}`);
    expect(await found.json()).toMatchObject({ exists: true, hasFreeSeat: false, players: 2 });

    const missing = await fetch(`http://127.0.0.1:${port}/api/rooms/ZZZZZ`);
    expect(missing.status).toBe(404);
  });

  it('rejects a malformed room code without touching the registry', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/rooms/%2e%2e%2fetc`);
    expect(res.status).toBe(404);
  });

  it('refuses writes', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`, { method: 'POST' });
    expect(res.status).toBe(405);
  });

  it('refuses a WebSocket upgrade on any other path', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/nope`);
    const error = await new Promise<Error>((resolve) => socket.once('error', resolve));
    expect(error).toBeInstanceOf(Error);
  });

  // Last in this block on purpose: it exhausts the lookup budget for this IP,
  // which every other lookup test in here shares.
  it('will not let anyone sweep the code space for open rooms', async () => {
    // The lookup exists so the join screen can fail fast, not so a stranger can
    // hunt for rooms with a free seat and drop in on them.
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/rooms/ZZZZ${i % 10}`);
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    // The first few still answer, so a real player typing a code is unaffected.
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
  });
});

describe('a full match over the wire', () => {
  it('plays a round from lobby to a scored result', async () => {
    const { host, guest } = await pair();

    host.send({ t: 'cameraReady', ready: true });
    guest.send({ t: 'cameraReady', ready: true });
    await host.waitForState((s) => Object.values(s.players).every((p) => p.cameraReady));

    // Live frames double as the opponent's view and as the detector's baseline.
    host.send({ t: 'frame', image: emptyRoomFrame(), seq: 1 });
    guest.send({ t: 'frame', image: emptyRoomFrame(), seq: 1 });
    await guest.waitFor((m) => m.t === 'peerFrame');

    host.send({ t: 'ready', ready: true });
    guest.send({ t: 'ready', ready: true });
    const countdown = await host.waitForState((s) => s.phase === 'countdown');
    expect(countdown.round?.number).toBe(1);

    // Keep the camera alive through the countdown, as the real client does.
    const keepAlive = setInterval(() => {
      host.send({ t: 'frame', image: emptyRoomFrame(), seq: 2 });
      guest.send({ t: 'frame', image: emptyRoomFrame(), seq: 2 });
    }, 120);

    const live = await host.waitForState((s) => s.phase === 'challenge');
    clearInterval(keepAlive);

    const challenge = getChallenge(live.round!.challengeId)!;
    // Round one is always camera-judged; which detector it draws is random.
    expect(challenge.judging).toBe('auto');

    host.send({
      t: 'submit',
      roundId: live.round!.id,
      image: passingFrameFor(challenge.detector!),
    });

    const result = await host.waitForState((s) => s.phase === 'roundResult');
    expect(result.round?.outcome?.winnerId).toBe(host.playerId);
    expect(result.players[host.playerId]?.score).toBe(1);

    // Both players see the same authoritative outcome.
    const guestView = await guest.waitForState((s) => s.phase === 'roundResult');
    expect(guestView.round?.outcome?.winnerId).toBe(host.playerId);
    expect(guestView.version).toBe(result.version);

    host.close();
    guest.close();
  }, 20_000);

  it('restores a player’s seat after a reload', async () => {
    const { host, guest, code } = await pair();
    host.send({ t: 'cameraReady', ready: true });
    await guest.waitForState((s) => s.players[host.playerId]?.cameraReady === true);

    const token = host.token;
    const playerId = host.playerId;
    host.close();
    await guest.waitForState((s) => s.players[playerId]?.connected === false);

    const returning = await Player.connect(port);
    returning.send({ t: 'rejoin', code, token });
    const rejoined = await returning.waitFor<Extract<ServerMessage, { t: 'joined' }>>(
      (m) => m.t === 'joined',
    );
    expect(rejoined.playerId).toBe(playerId);

    const state = await returning.waitForState((s) => s.players[playerId]?.connected === true);
    // Camera consent and the seat both survive the reload.
    expect(state.players[playerId]?.cameraReady).toBe(true);
    expect(Object.keys(state.players)).toHaveLength(2);

    returning.close();
    guest.close();
  }, 20_000);
});

describe('rounds the players write themselves', () => {
  it('adds a prompt, shows it to both, and lets only its author remove it', async () => {
    const { host, guest } = await pair();

    host.send({ t: 'addChallenge', prompt: '  show me the worst gift you ever got ' });
    const added = await guest.waitForState((s) => s.customChallenges.length === 1);
    const entry = added.customChallenges[0]!;
    // Normalised on the server, not trusted from the client.
    expect(entry.prompt).toBe('SHOW ME THE WORST GIFT YOU EVER GOT');
    expect(entry.authorId).toBe(host.playerId);

    // The opponent cannot take out a prompt they did not write.
    guest.send({ t: 'removeChallenge', id: entry.id });
    const refusal = await guest.waitFor<Extract<ServerMessage, { t: 'error' }>>(
      (m) => m.t === 'error',
    );
    expect(refusal.message).toMatch(/whoever wrote it/i);
    expect(guest.state.customChallenges).toHaveLength(1);

    host.send({ t: 'removeChallenge', id: entry.id });
    await guest.waitForState((s) => s.customChallenges.length === 0);

    host.close();
    guest.close();
  });

  it('refuses a prompt the rules do not allow, whatever the client sends', async () => {
    const { host, guest } = await pair();

    for (const prompt of ['go', 'X'.repeat(120), 'SHOW <b>THIS</b>']) {
      host.send({ t: 'addChallenge', prompt });
      const error = await host.waitFor<Extract<ServerMessage, { t: 'error' }>>(
        (m) => m.t === 'error',
        3_000,
      );
      expect(error.code).toBe('rejected');
      host.received.length = 0;
    }
    expect(guest.state.customChallenges).toHaveLength(0);

    host.close();
    guest.close();
  });
});

describe('hostile clients', () => {
  it('rejects a protocol version it does not speak', async () => {
    const player = await Player.connect(port);
    player.send({ t: 'hello', protocol: 999 } as ClientMessage);
    const error = await player.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('protocol-mismatch');
  });

  it('rejects a malformed message without dropping the connection', async () => {
    const player = await Player.connect(port);
    player.send({ t: 'joinRoom', code: 'nope', name: '' } as unknown as ClientMessage);
    const error = await player.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('bad-message');

    player.send({ t: 'ping', id: 1 });
    const pong = await player.waitFor((m) => m.t === 'pong');
    expect(pong.t).toBe('pong');
    player.close();
  });

  it('refuses to act on game messages before joining a room', async () => {
    const player = await Player.connect(port);
    player.send({ t: 'ready', ready: true });
    const error = await player.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('not-in-room');
    player.close();
  });

  it('refuses a third player', async () => {
    const { host, guest, code } = await pair();
    const gatecrasher = await Player.connect(port);
    gatecrasher.send({ t: 'joinRoom', code, name: 'Alan' });
    const error = await gatecrasher.waitFor<Extract<ServerMessage, { t: 'error' }>>(
      (m) => m.t === 'error',
    );
    expect(error.code).toBe('room-full');
    gatecrasher.close();
    host.close();
    guest.close();
  });

  it('will not let one socket occupy both seats', async () => {
    const host = await Player.connect(port);
    host.send({ t: 'createRoom', name: 'Ada' });
    const joined = await host.waitFor<Extract<ServerMessage, { t: 'joined' }>>((m) => m.t === 'joined');
    const firstSeat = host.playerId;

    // The same connection tries to take the other seat under a second name.
    host.send({ t: 'joinRoom', code: joined.roomCode, name: 'Grace' });
    const state = await host.waitForState((s) => s.players[firstSeat] === undefined);
    expect(Object.keys(state.players)).toHaveLength(1);
    expect(Object.values(state.players)[0]?.name).toBe('Grace');

    // And the room is genuinely open again, not merely reported as open.
    const other = await Player.connect(port);
    other.send({ t: 'joinRoom', code: joined.roomCode, name: 'Alan' });
    await other.waitFor((m) => m.t === 'joined');
    host.close();
    other.close();
  });

  it('keeps the current seat when a rejoin token is rejected', async () => {
    const { host, guest, code } = await pair();
    const seat = host.playerId;
    host.send({ t: 'rejoin', code, token: 'this-is-not-a-valid-token' });
    const error = await host.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('session-expired');

    // A failed recovery attempt must not cost the player the seat they hold.
    guest.send({ t: 'cameraReady', ready: true });
    const state = await guest.waitForState((s) => s.players[guest.playerId]?.cameraReady === true);
    expect(state.players[seat]).toBeDefined();
    expect(state.players[seat]?.connected).toBe(true);
    host.close();
    guest.close();
  });

  it('drops a bad live frame quietly instead of shouting about it', async () => {
    const { host, guest } = await pair();
    host.received.length = 0;

    // Frames arrive several times a second; an error per bad one would put a
    // message on screen four times a second and make the game unplayable.
    host.send({ t: 'frame', image: 'not-a-data-url', seq: 1 } as ClientMessage);
    host.send({ t: 'frame', image: `data:image/jpeg;base64,${'A'.repeat(250_000)}`, seq: 2 });

    // A genuinely malformed non-frame message still gets an answer, which is
    // how we know the connection is alive and the silence was deliberate.
    host.send({ t: 'joinRoom', code: 'nope', name: '' } as unknown as ClientMessage);
    const error = await host.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('bad-message');
    expect(host.received.filter((m) => m.t === 'error')).toHaveLength(1);

    host.close();
    guest.close();
  });

  it('rate limits a client that floods the socket', async () => {
    const player = await Player.connect(port);
    for (let i = 0; i < 200; i++) player.send({ t: 'ping', id: i });
    const error = await player.waitFor<Extract<ServerMessage, { t: 'error' }>>(
      (m) => m.t === 'error' && m.code === 'rate-limited',
    );
    expect(error.code).toBe('rate-limited');
    player.close();
  });

  it('rejects an oversized snapshot before it reaches the decoder', async () => {
    const { host, guest } = await pair();
    // Over the schema's ceiling but inside the frame limit, so it reaches zod.
    const oversized = `data:image/jpeg;base64,${'A'.repeat(250_000)}`;
    host.send({ t: 'submit', roundId: 'x', image: oversized });
    const error = await host.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('bad-message');
    host.close();
    guest.close();
  });

  it('drops a client that sends a frame larger than the transport allows', async () => {
    const player = await Player.connect(port);
    const closed = new Promise<number>((resolve) => player.onClose(resolve));
    player.send({ t: 'submit', roundId: 'x', image: 'A'.repeat(400_000) } as ClientMessage);
    // 1009 is "message too big"; the point is that it never reaches our parser.
    expect(await closed).toBe(1009);
  });
});
