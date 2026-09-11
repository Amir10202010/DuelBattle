import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GameEngine } from '../server/game';
import { Store } from '../server/store';
import { canTransition, type RoomSnapshot } from '../shared/protocol';
import type { VerificationProvider } from '../server/verification';
import { emptyRoomFrame, heldObjectFrame, RED } from './evidence-helpers';

const before = emptyRoomFrame();
const held = heldObjectFrame(RED);

describe('authoritative multiplayer engine', () => {
  let store: Store;
  let game: GameEngine;
  let now: number;
  let a: string;
  let b: string;
  let code: string;
  let events: RoomSnapshot[];
  beforeEach(() => {
    now = Date.parse('2026-09-10T12:00:00Z');
    store = new Store(':memory:');
    a = store.createSession(now).session.id;
    b = store.createSession(now).session.id;
    events = [];
    game = new GameEngine(
      store,
      (r) => events.push(r),
      () => now,
      {},
      undefined,
      () => 0,
    );
    code = game.create(a, 'Alex', 'a').code;
  });
  afterEach(() => store.close());
  const snap = () => game.snapshot(code);
  /** The race clock belongs to the selected challenge, not to a constant. */
  const roundMs = () => snap().round!.challenge!.timeLimit * 1000;
  function lobby() {
    game.join(code, b, 'Jamie', 'b');
    game.media(code, a, 'a', true, false);
    game.media(code, b, 'b', true, false);
  }
  function start() {
    lobby();
    game.ready(code, a, 'a', true);
    game.ready(code, b, 'b', true);
  }
  function advance(ms: number) {
    now += ms;
    game.tick();
  }
  /** Run the countdown, including the pre-reveal baseline both cameras send. */
  function reveal() {
    game.baseline(code, a, 'a', snap().round!.id, before);
    game.baseline(code, b, 'b', snap().round!.id, before);
    advance(3000);
  }
  function submit(id = a, socket = 'a', nonce = randomUUID()) {
    return game.submit(code, id, socket, snap().round!.id, nonce, held);
  }
  async function win(id = a) {
    await submit(id, id === a ? 'a' : 'b');
    const attempt = snap().round!.attempts.at(-1)!;
    game.review(code, id === a ? b : a, id === a ? 'b' : 'a', snap().round!.id, attempt.id, true);
  }
  /** Let the race clock run out without a confirmed snapshot. */
  function timeOut() {
    advance(roundMs() + 100);
  }
  function next() {
    advance(3500);
    if (snap().state === 'NEXT_ROUND') {
      advance(1200);
      reveal();
    }
  }

  it('creates an uncharged private room with server identity and fresh code', () => {
    expect(code).toMatch(/^[A-F0-9]{10}$/);
    expect(snap().state).toBe('WAITING_FOR_PLAYER');
    expect(snap().hostId).toBe(a);
    expect(snap().players[0].score).toBe(0);
    expect(store.profile({ id: a, csrf: '', expiresAt: 0 }, now).remaining).toBe(3);
  });
  it('joins once, is idempotent for the same socket, and rejects another tab and third slot', () => {
    game.join(code, b, 'Jamie', 'b');
    game.join(code, b, 'Spoof', 'b');
    expect(snap().players).toHaveLength(2);
    expect(snap().players[1].name).toBe('Jamie');
    expect(() => game.join(code, b, 'Jamie', 'duplicate')).toThrow('another tab');
    const c = store.createSession(now).session.id;
    expect(() => game.join(code, c, 'Sam', 'c')).toThrow('two players');
  });
  it('rejects unknown rooms, foreign membership, illegal transitions and unready cameras', () => {
    expect(() => game.join('0000000000', b, 'Jamie', 'b')).toThrow('no longer exists');
    expect(() => game.ready(code, b, 'b', true)).toThrow('Join this battle');
    expect(() => game.ready(code, a, 'a', true)).toThrow('camera');
    expect(canTransition('READY', 'MATCH_RESULT')).toBe(false);
    expect(canTransition('CANCELLED', 'COUNTDOWN')).toBe(false);
  });
  it('starts only when both ready, charges both once, and enforces a server countdown', async () => {
    lobby();
    game.ready(code, a, 'a', true);
    expect(snap().state).toBe('READY');
    game.ready(code, b, 'b', true);
    expect(snap().state).toBe('COUNTDOWN');
    expect(snap().round!.startsAt).toBe(now + 3000);
    await expect(submit()).rejects.toThrow('no longer accepting');
    advance(2999);
    expect(snap().state).toBe('COUNTDOWN');
    advance(1);
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    expect(store.profile({ id: a, csrf: '', expiresAt: 0 }, now).remaining).toBe(2);
    expect(store.profile({ id: b, csrf: '', expiresAt: 0 }, now).remaining).toBe(2);
    expect(() => game.ready(code, b, 'b', true)).toThrow('already started');
  });
  it('withholds the challenge until the countdown ends, and takes only a pre-reveal baseline', () => {
    lobby();
    game.ready(code, a, 'a', true);
    game.ready(code, b, 'b', true);
    expect(snap().state).toBe('COUNTDOWN');
    expect(snap().round!.challenge).toBeNull();
    // The race length would narrow the catalogue down on its own.
    expect(snap().round!.endsAt).toBe(snap().round!.startsAt);
    game.baseline(code, a, 'a', snap().round!.id, before);
    advance(3000);
    expect(snap().round!.challenge).not.toBeNull();
    expect(() => game.baseline(code, a, 'a', snap().round!.id, before)).toThrow(
      'baseline window has closed',
    );
  });
  it('a player cannot award themselves a win or use stale, duplicate or malformed evidence', async () => {
    start();
    reveal();
    const nonce = randomUUID();
    await submit(a, 'a', nonce);
    const round = snap().round!;
    expect(snap().players[0].score).toBe(0);
    expect(() => game.review(code, a, 'a', round.id, round.attempts[0].id, true)).toThrow(
      'Only the opponent',
    );
    await expect(submit(a, 'a', nonce)).rejects.toThrow('already been submitted');
    await expect(game.submit(code, b, 'b', randomUUID(), randomUUID(), held)).rejects.toThrow(
      'no longer accepting',
    );
    await expect(
      game.submit(code, b, 'b', round.id, randomUUID(), 'data:image/jpeg;base64,AAAA'),
    ).rejects.toThrow('fresh camera');
    expect(() =>
      game.review(code, b, 'forged-socket', round.id, round.attempts[0].id, true),
    ).toThrow('Join this battle');
  });
  it('orders simultaneous submissions by server receipt and blocks a later accepted attempt', async () => {
    start();
    reveal();
    await submit();
    await submit(b, 'b');
    const round = snap().round!;
    game.review(code, a, 'a', round.id, round.attempts[1].id, true);
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    game.review(code, b, 'b', round.id, round.attempts[0].id, true);
    expect(snap().round!.winnerId).toBe(a);
    expect(snap().players.map((p) => p.score)).toEqual([1, 0]);
  });
  it('lets a later confirmed snapshot win if the earlier one is rejected', async () => {
    start();
    reveal();
    await submit();
    await submit(b, 'b');
    const r = snap().round!;
    game.review(code, a, 'a', r.id, r.attempts[1].id, true);
    game.review(code, b, 'b', r.id, r.attempts[0].id, false);
    expect(snap().round!.winnerId).toBe(b);
  });
  it('expires ignored reviews, permits retries, and limits attempts to three per player', async () => {
    start();
    reveal();
    await submit();
    advance(8000);
    await submit();
    advance(8000);
    expect(snap().round!.attempts.every((x) => x.status === 'expired' && x.image === '')).toBe(
      true,
    );
    await submit();
    const third = snap().round!.attempts.at(-1)!;
    game.review(code, b, 'b', snap().round!.id, third.id, false);
    await expect(submit()).rejects.toThrow('three snapshots');
    timeOut();
    expect(snap().state).toBe('ROUND_RESULT');
    expect(snap().history.at(-1)!.winnerId).toBe(null);
  });
  it('resolves review receipt after the race deadline, but refuses late submissions', async () => {
    start();
    reveal();
    advance(roundMs() - 500);
    await submit();
    advance(500);
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    await expect(submit(b, 'b')).rejects.toThrow('Time is up');
    const r = snap().round!;
    game.review(code, b, 'b', r.id, r.attempts[0].id, true);
    expect(snap().round!.winnerId).toBe(a);
  });
  it('expires an earlier pending attempt and awards a later already-confirmed one', async () => {
    start();
    reveal();
    await submit();
    advance(100);
    await submit(b, 'b');
    const r = snap().round!;
    game.review(code, a, 'a', r.id, r.attempts[1].id, true);
    advance(7900);
    expect(snap().round!.winnerId).toBe(b);
  });
  it('plays first to three, selects new challenges, persists metadata, and rematches with both votes', async () => {
    start();
    reveal();
    const challengeIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      challengeIds.push(snap().round!.challenge!.id);
      await win();
      expect(snap().state).toBe('ROUND_RESULT');
      next();
    }
    expect(new Set(challengeIds).size).toBe(3);
    expect(snap().state).toBe('MATCH_RESULT');
    expect(snap().winnerId).toBe(a);
    expect(snap().history.at(-1)!.elapsedMs[a]).toBeGreaterThanOrEqual(0);
    expect(snap().history.at(-1)!.elapsedMs[b]).toBeNull();
    const stored = store.db.prepare('SELECT summary FROM match_results').get()!;
    expect(String(stored.summary)).not.toContain('data:image');
    expect(String(stored.summary)).toContain('Alex');
    const oldMatch = snap().matchId;
    game.rematch(code, a, 'a');
    expect(snap().state).toBe('MATCH_RESULT');
    game.rematch(code, b, 'b');
    expect(snap().state).toBe('COUNTDOWN');
    expect(snap().matchId).not.toBe(oldMatch);
    expect(snap().players.map((p) => p.score)).toEqual([0, 0]);
    expect(snap().history).toEqual([]);
    expect(store.profile({ id: a, csrf: '', expiresAt: 0 }, now).remaining).toBe(1);
  });
  it('opens a match with a colour-assisted round and never repeats a prompt', () => {
    start();
    reveal();
    expect(snap().round!.challenge!.color).toBeTruthy();
    expect(snap().round!.challenge!.subjective).toBe(false);
    const prompts: string[] = [];
    for (let i = 0; i < 6; i++) {
      prompts.push(snap().round!.challenge!.prompt);
      timeOut();
      next();
    }
    expect(new Set(prompts).size).toBe(prompts.length);
  });
  it('supports a close five-round match with the correct winner', async () => {
    start();
    reveal();
    for (const id of [a, b, a, b, b]) {
      await win(id);
      next();
    }
    expect(snap().state).toBe('MATCH_RESULT');
    expect(snap().winnerId).toBe(b);
    expect(snap().players.map((p) => p.score)).toEqual([2, 3]);
  });
  it('caps a stalled match and declares a draw without invented points', () => {
    start();
    reveal();
    for (let i = 0; i < 12; i++) {
      timeOut();
      next();
    }
    expect(snap().state).toBe('MATCH_RESULT');
    expect(snap().winnerId).toBeNull();
    expect(snap().history).toHaveLength(12);
  });
  it('pauses on disconnect, reclaims a slot, waits for camera, and restarts with a fresh round token', async () => {
    start();
    reveal();
    await submit();
    const old = snap().round!.id;
    game.disconnect(a, 'a');
    expect(snap().state).toBe('RECONNECTING');
    await expect(game.submit(code, a, 'a', old, randomUUID(), held)).rejects.toThrow(
      'Join this battle',
    );
    game.join(code, a, 'Ignored', 'new-a');
    expect(snap().state).toBe('RECONNECTING');
    game.media(code, a, 'new-a', true, false);
    expect(snap().state).toBe('COUNTDOWN');
    expect(snap().round!.id).not.toBe(old);
    expect(snap().round!.attempts).toEqual([]);
    game.disconnect(a, 'a');
    expect(snap().players[0].connected).toBe(true);
    expect(store.profile({ id: a, csrf: '', expiresAt: 0 }, now).remaining).toBe(2);
  });
  it('pauses when a camera is switched off, then resumes when enabled', () => {
    start();
    reveal();
    game.media(code, a, 'a', false, false);
    expect(snap().state).toBe('RECONNECTING');
    game.media(code, a, 'a', true, false);
    expect(snap().state).toBe('COUNTDOWN');
  });
  it('cancels abandoned games, rejects late reconnects, cleans stale rooms and releases memberships', () => {
    start();
    game.disconnect(a, 'a');
    advance(30_000);
    expect(snap().state).toBe('CANCELLED');
    expect(snap().winnerId).toBeNull();
    expect(() => game.join(code, a, 'Alex', 'a2')).toThrow('ended');
    const fresh = game.create(a, 'Alex', 'a2');
    expect(fresh.code).not.toBe(code);
    advance(60_000);
    expect(() => snap()).toThrow('no longer exists');
    advance(30 * 60_000);
    expect(game.size).toBe(0);
  });
  it('leave ends a room and clients cannot mutate returned snapshots', () => {
    lobby();
    const external = snap();
    external.players[0].score = 99;
    expect(snap().players[0].score).toBe(0);
    game.leave(code, a, 'a');
    expect(snap().state).toBe('CANCELLED');
    expect(events.at(-1)?.state).toBe('CANCELLED');
  });
  it('an unavailable verification provider falls back to human review', async () => {
    const provider: VerificationProvider = {
      id: 'offline',
      evaluate: () => {
        throw new Error('provider offline');
      },
    };
    game = new GameEngine(
      store,
      () => {},
      () => now,
      {},
      provider,
      () => 0,
    );
    code = game.create(a, 'Alex', 'a').code;
    start();
    reveal();
    await submit();
    expect(snap().round!.attempts[0].status).toBe('pending');
    expect(snap().players[0].score).toBe(0);
    expect(snap().message).toContain('unavailable');
  });
  it('a provider cannot award a point; its verdict is only an observation', async () => {
    const eager: VerificationProvider = {
      id: 'over-eager',
      evaluate: () => ({ kind: 'human-review', reviewForMs: 8000, observation: 'You win!' }),
    };
    game = new GameEngine(
      store,
      () => {},
      () => now,
      {},
      eager,
      () => 0,
    );
    code = game.create(a, 'Alex', 'a').code;
    start();
    reveal();
    await submit();
    expect(snap().round!.attempts[0].status).toBe('pending');
    expect(snap().players[0].score).toBe(0);
    expect(snap().round!.winnerId).toBeNull();
    expect(snap().round!.attempts[0].observation).toBe('You win!');
  });
  it('gives no colour assistance for an object that was already in the room', async () => {
    start();
    reveal();
    // The baseline already contains red furniture; nothing new enters frame.
    await game.submit(code, a, 'a', snap().round!.id, randomUUID(), before);
    expect(snap().round!.attempts[0].observation).toContain('inconclusive');
  });
  it('needs several frames before it will report colour assistance', async () => {
    start();
    reveal();
    expect(snap().round!.challenge!.color).toBe('red');
    await submit();
    // One still frame is not temporal evidence, whatever it shows.
    expect(snap().round!.attempts[0].observation).toContain('inconclusive');
  });
  it('offers colour assistance when the object is held up across several frames', async () => {
    start();
    reveal();
    await game.submit(code, a, 'a', snap().round!.id, randomUUID(), held, [held, held]);
    expect(snap().round!.attempts[0].observation).toContain('New red pixels');
    expect(snap().round!.attempts[0].status).toBe('pending');
    expect(snap().players[0].score).toBe(0);
  });
});
