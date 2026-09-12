import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  AVATAR_COLORS,
  AVATAR_SHAPES,
  PLACEMENT_MATCHES,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@battle/shared';
import { createApp, type App } from '../src/app.js';
import { Identities } from '../src/identity.js';
import { MemoryProfileStore, blankProfile } from '../src/profiles.js';

/**
 * The queue, the board and the card, over a real socket.
 *
 * These are the three things a player can now do without an opponent already
 * in hand, so they are worth proving against the actual server rather than
 * against the classes underneath it.
 */

const secret = Buffer.alloc(32, 11);
const identities = new Identities(secret);
const profiles = new MemoryProfileStore();

class Client {
  readonly received: ServerMessage[] = [];
  private readonly waiters: { match: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      this.received.push(message);
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const waiter = this.waiters[i]!;
        if (!waiter.match(message)) continue;
        this.waiters.splice(i, 1);
        waiter.resolve(message);
      }
    });
  }

  static async connect(port: number, identity?: string): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = new Client(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    await client.waitFor((m) => m.t === 'welcome');
    client.send({ t: 'hello', protocol: PROTOCOL_VERSION, ...(identity ? { identity } : {}) });
    await client.waitFor((m) => m.t === 'profile');
    return client;
  }

  send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor<T extends ServerMessage>(match: (m: ServerMessage) => boolean, timeoutMs = 8_000): Promise<T> {
    const existing = this.received.find(match);
    if (existing) return Promise.resolve(existing as T);
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out (${this.received.map((m) => m.t).join(',')})`)),
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

  close(): void {
    this.socket.close();
  }
}

let app: App;
let port: number;
const open: Client[] = [];

async function client(identity?: string): Promise<Client> {
  const made = await Client.connect(port, identity);
  open.push(made);
  return made;
}

beforeAll(async () => {
  app = createApp({
    tickMs: 25,
    // Every client here shares one address; the per-IP budget is exercised in
    // its own test rather than fighting this one.
    roomCreateLimit: { burst: 10_000, refillPerSec: 1_000 },
    identities,
    profiles,
  });
  port = await app.listen(0, '127.0.0.1');
});

// One address for the whole suite means the per-IP connection limit is twelve
// sockets, and a suite that leaves its clients open hits it around test six.
afterEach(() => {
  while (open.length) open.pop()!.close();
});

afterAll(async () => {
  for (const made of open) made.close();
  await app.close();
});

/** A settled record, so a client has a rating the queue can match on. */
function seed(name: string, rating: number, over: Record<string, unknown> = {}): string {
  const token = identities.issue();
  const id = identities.verify(token)!;
  profiles.save({
    ...blankProfile(id, Date.now()),
    name,
    rating,
    peakRating: rating,
    matchesPlayed: PLACEMENT_MATCHES + 5,
    wins: 6,
    losses: 4,
    ...over,
  });
  return token;
}

describe('finding an opponent', () => {
  it('tells somebody where they are the moment they join the queue', async () => {
    const alone = await client(seed('Alone', 1200));
    alone.send({ t: 'findMatch', name: 'Alone' });
    const queued = await alone.waitFor<Extract<ServerMessage, { t: 'queued' }>>((m) => m.t === 'queued');
    expect(queued).toMatchObject({ position: 1, waiting: 1 });
    alone.send({ t: 'cancelFind' });
    await alone.waitFor((m) => m.t === 'unqueued');
  });

  it('pairs two players of similar rating into one room', async () => {
    const one = await client(seed('Ada', 1200));
    const two = await client(seed('Grace', 1240));

    one.send({ t: 'findMatch', name: 'Ada' });
    two.send({ t: 'findMatch', name: 'Grace' });

    const first = await one.waitFor<Extract<ServerMessage, { t: 'joined' }>>((m) => m.t === 'joined');
    const second = await two.waitFor<Extract<ServerMessage, { t: 'joined' }>>((m) => m.t === 'joined');

    expect(first.roomCode).toBe(second.roomCode);
    expect(first.playerId).not.toBe(second.playerId);

    const state = await one.waitFor<Extract<ServerMessage, { t: 'state' }>>(
      (m) => m.t === 'state' && Object.keys(m.state.players).length === 2,
    );
    expect(Object.values(state.state.players).map((p) => p.name).sort()).toEqual(['Ada', 'Grace']);
  });

  it('seats them under the name they queued with', async () => {
    const one = await client(seed('Stored', 1300));
    const two = await client(seed('Other', 1310));
    one.send({ t: 'findMatch', name: 'Queued Name' });
    two.send({ t: 'findMatch', name: 'Other' });

    const state = await one.waitFor<Extract<ServerMessage, { t: 'state' }>>(
      (m) => m.t === 'state' && Object.keys(m.state.players).length === 2,
    );
    expect(Object.values(state.state.players).map((p) => p.name)).toContain('Queued Name');
  });

  it('refuses to sit one browser on both sides of a match', async () => {
    const token = seed('Twin', 1400);
    const tabOne = await client(token);
    const tabTwo = await client(token);

    tabOne.send({ t: 'findMatch', name: 'Twin' });
    tabTwo.send({ t: 'findMatch', name: 'Twin' });

    await new Promise((r) => setTimeout(r, 1_500));
    expect(tabOne.received.some((m) => m.t === 'joined')) .toBe(false);
    expect(tabTwo.received.some((m) => m.t === 'joined')).toBe(false);

    tabOne.send({ t: 'cancelFind' });
    tabTwo.send({ t: 'cancelFind' });
  });

  it('takes a player out of the queue when their socket goes', async () => {
    const leaver = await client(seed('Leaver', 1500));
    const waiter = await client(seed('Waiter', 1510));

    leaver.send({ t: 'findMatch', name: 'Leaver' });
    await leaver.waitFor((m) => m.t === 'queued');
    leaver.close();

    await new Promise((r) => setTimeout(r, 300));
    waiter.send({ t: 'findMatch', name: 'Waiter' });
    const queued = await waiter.waitFor<Extract<ServerMessage, { t: 'queued' }>>((m) => m.t === 'queued');
    expect(queued.waiting).toBe(1);
    waiter.send({ t: 'cancelFind' });
  });

  it('gives up the seat it was holding when a player goes looking again', async () => {
    const wanderer = await client(seed('Wanderer', 1600));
    wanderer.send({ t: 'createRoom', name: 'Wanderer' });
    const room = await wanderer.waitFor<Extract<ServerMessage, { t: 'joined' }>>((m) => m.t === 'joined');

    wanderer.send({ t: 'findMatch', name: 'Wanderer' });
    await wanderer.waitFor((m) => m.t === 'queued');

    const lookup = await fetch(`http://127.0.0.1:${port}/api/rooms/${room.roomCode}`);
    expect(await lookup.json()).toMatchObject({ players: 0 });
    wanderer.send({ t: 'cancelFind' });
  });
});

describe('the leaderboard over the wire', () => {
  it('ranks settled records and leaves placement out', async () => {
    seed('Settled', 1900);
    seed('Rookie', 2400, { matchesPlayed: 1 });
    const viewer = await client(seed('Viewer', 1000));

    viewer.send({ t: 'leaderboard', board: 'rating' });
    const board = await viewer.waitFor<Extract<ServerMessage, { t: 'leaderboard' }>>(
      (m) => m.t === 'leaderboard',
    );
    expect(board.entries.map((e) => e.name)).not.toContain('Rookie');
    expect(board.entries[0]!.position).toBe(1);
    expect(board.entries.map((e) => e.rating)).toEqual([...board.entries.map((e) => e.rating)].sort((a, b) => b - a));
  });

  it('finds the viewer their own row', async () => {
    const token = seed('Findable', 1050);
    const viewer = await client(token);
    viewer.send({ t: 'leaderboard', board: 'rating' });
    const board = await viewer.waitFor<Extract<ServerMessage, { t: 'leaderboard' }>>(
      (m) => m.t === 'leaderboard',
    );
    expect(board.you?.name).toBe('Findable');
  });

  it('falls back rather than trusting a board name off the wire', async () => {
    const viewer = await client(seed('Curious', 1100));
    viewer.send({ t: 'leaderboard', board: 'not-a-board' });
    const board = await viewer.waitFor<Extract<ServerMessage, { t: 'leaderboard' }>>(
      (m) => m.t === 'leaderboard',
    );
    expect(board.board).toBe('rating');
  });

  it('never puts a history on a scoreboard', async () => {
    const viewer = await client(seed('Private', 1150, { history: [{ at: 1, opponentName: 'X', result: 'win', ratingBefore: 1, ratingAfter: 2, yourScore: 3, theirScore: 0 }] }));
    viewer.send({ t: 'leaderboard', board: 'rating' });
    const board = await viewer.waitFor<Extract<ServerMessage, { t: 'leaderboard' }>>(
      (m) => m.t === 'leaderboard',
    );
    for (const entry of board.entries) expect(entry).not.toHaveProperty('history');
  });
});

describe('the card a browser carries', () => {
  it('remembers a name and a mark across connections', async () => {
    const token = seed('Before', 1200);
    const first = await client(token);
    first.send({ t: 'setProfile', name: 'After', avatar: { shape: 3, color: 5 } });
    const saved = await first.waitFor<Extract<ServerMessage, { t: 'profile' }>>(
      (m) => m.t === 'profile' && m.profile.name === 'After',
    );
    expect(saved.profile.avatar).toEqual({ shape: 3, color: 5 });

    first.close();
    const again = await client(token);
    const card = again.received.find((m) => m.t === 'profile');
    expect(card && card.t === 'profile' && card.profile.name).toBe('After');
  });

  it('folds a mark index that could not be drawn back into range', async () => {
    // The schema bounds it loosely; the palette bounds it exactly. An index
    // past the end of the list is a drawing bug, not an error worth refusing.
    // Seeded at zero so the reply can be told apart from the card that arrives
    // with `hello`, whose mark is derived from the identity.
    const person = await client(seed('Clamped', 1200, { avatar: { shape: 0, color: 0 } }));
    person.send({ t: 'setProfile', avatar: { shape: 61, color: 63 } });
    const saved = await person.waitFor<Extract<ServerMessage, { t: 'profile' }>>(
      (m) => m.t === 'profile' && m.profile.avatar.shape !== 0,
    );
    expect(saved.profile.avatar.shape).toBe(61 % AVATAR_SHAPES.length);
    expect(saved.profile.avatar.color).toBe(63 % AVATAR_COLORS.length);
  });

  it('refuses a name the wire schema will not carry', async () => {
    const person = await client(seed('Strict', 1200));
    person.send({ t: 'setProfile', name: 'x'.repeat(200) } as ClientMessage);
    const error = await person.waitFor<Extract<ServerMessage, { t: 'error' }>>((m) => m.t === 'error');
    expect(error.code).toBe('bad-message');
  });
});
