import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GameEngine } from '../server/game';
import { Store } from '../server/store';
import { canTransition, type RoomSnapshot } from '../shared/protocol';
import type { VerificationProvider } from '../server/verification';

const jpeg =
  'data:image/jpeg;base64,' +
  Buffer.from([0xff, 0xd8, 0xff, ...Array(110).fill(0), 0xff, 0xd9]).toString('base64');
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
  function submit(id = a, socket = 'a', nonce = randomUUID()) {
    game.submit(code, id, socket, snap().round!.id, nonce, jpeg);
  }
  function win(id = a) {
    submit(id, id === a ? 'a' : 'b');
    const attempt = snap().round!.attempts.at(-1)!;
    game.review(code, id === a ? b : a, id === a ? 'b' : 'a', snap().round!.id, attempt.id, true);
  }
  function next() {
    advance(3500);
    if (snap().state === 'NEXT_ROUND') {
      advance(1200);
      advance(3000);
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
  it('starts only when both ready, charges both once, and enforces a server countdown', () => {
    lobby();
    game.ready(code, a, 'a', true);
    expect(snap().state).toBe('READY');
    game.ready(code, b, 'b', true);
    expect(snap().state).toBe('COUNTDOWN');
    expect(snap().round!.startsAt).toBe(now + 3000);
    expect(() => submit()).toThrow('no longer accepting');
    advance(2999);
    expect(snap().state).toBe('COUNTDOWN');
    advance(1);
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    expect(store.profile({ id: a, csrf: '', expiresAt: 0 }, now).remaining).toBe(2);
    expect(store.profile({ id: b, csrf: '', expiresAt: 0 }, now).remaining).toBe(2);
    expect(() => game.ready(code, b, 'b', true)).toThrow('already started');
  });
  it('a player cannot award themselves a win or use stale, duplicate or malformed evidence', () => {
    start();
    advance(3000);
    const nonce = randomUUID();
    submit(a, 'a', nonce);
    const round = snap().round!;
    expect(snap().players[0].score).toBe(0);
    expect(() => game.review(code, a, 'a', round.id, round.attempts[0].id, true)).toThrow(
      'Only the opponent',
    );
    expect(() => submit(a, 'a', nonce)).toThrow('already been submitted');
    expect(() => game.submit(code, b, 'b', randomUUID(), randomUUID(), jpeg)).toThrow(
      'no longer accepting',
    );
    expect(() =>
      game.submit(code, b, 'b', round.id, randomUUID(), 'data:image/jpeg;base64,AAAA'),
    ).toThrow('fresh camera');
    expect(() =>
      game.review(code, b, 'forged-socket', round.id, round.attempts[0].id, true),
    ).toThrow('Join this battle');
  });
  it('orders simultaneous submissions by server receipt and blocks a later accepted attempt', () => {
    start();
    advance(3000);
    submit();
    submit(b, 'b');
    const round = snap().round!;
    game.review(code, a, 'a', round.id, round.attempts[1].id, true);
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    game.review(code, b, 'b', round.id, round.attempts[0].id, true);
    expect(snap().round!.winnerId).toBe(a);
    expect(snap().players.map((p) => p.score)).toEqual([1, 0]);
  });
  it('lets a later confirmed snapshot win if the earlier one is rejected', () => {
    start();
    advance(3000);
    submit();
    submit(b, 'b');
    const r = snap().round!;
    game.review(code, a, 'a', r.id, r.attempts[1].id, true);
    game.review(code, b, 'b', r.id, r.attempts[0].id, false);
    expect(snap().round!.winnerId).toBe(b);
  });
  it('expires ignored reviews, permits retries, and limits attempts to three per player', () => {
    start();
    advance(3000);
    for (let n = 0; n < 3; n++) {
      submit();
      advance(8000);
    }
    expect(snap().round!.attempts.every((x) => x.status === 'expired' && x.image === '')).toBe(
      true,
    );
    expect(() => submit()).toThrow('three snapshots');
    advance(6000);
    expect(snap().state).toBe('ROUND_RESULT');
    expect(snap().round!.winnerId).toBe(null);
  });
  it('resolves review receipt after the race deadline, but refuses late submissions', () => {
    start();
    advance(3000);
    advance(29_500);
    submit();
    advance(500);
    expect(snap().state).toBe('CHALLENGE_ACTIVE');
    expect(() => submit(b, 'b')).toThrow('Time is up');
    const r = snap().round!;
    game.review(code, b, 'b', r.id, r.attempts[0].id, true);
    expect(snap().round!.winnerId).toBe(a);
  });
  it('expires an earlier pending attempt and awards a later already-confirmed one', () => {
    start();
    advance(3000);
    submit();
    advance(100);
    submit(b, 'b');
    const r = snap().round!;
    game.review(code, a, 'a', r.id, r.attempts[1].id, true);
    advance(7900);
    expect(snap().round!.winnerId).toBe(b);
  });
  it('plays first to three, selects new challenges, persists metadata, and rematches with both votes', () => {
    start();
    advance(3000);
    const challengeIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      challengeIds.push(snap().round!.challenge.id);
      win();
      expect(snap().state).toBe('ROUND_RESULT');
      next();
    }
    expect(new Set(challengeIds).size).toBe(3);
    expect(snap().state).toBe('MATCH_RESULT');
    expect(snap().winnerId).toBe(a);
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
  it('supports a close five-round match with the correct winner', () => {
    start();
    advance(3000);
    for (const id of [a, b, a, b, b]) {
      win(id);
      next();
    }
    expect(snap().state).toBe('MATCH_RESULT');
    expect(snap().winnerId).toBe(b);
    expect(snap().players.map((p) => p.score)).toEqual([2, 3]);
  });
  it('caps a stalled match and declares a draw without invented points', () => {
    start();
    advance(3000);
    for (let i = 0; i < 12; i++) {
      advance(30_000);
      next();
    }
    expect(snap().state).toBe('MATCH_RESULT');
    expect(snap().winnerId).toBeNull();
    expect(snap().history).toHaveLength(12);
  });
  it('pauses on disconnect, reclaims a slot, waits for camera, and restarts with a fresh round token', () => {
    start();
    advance(3000);
    submit();
    const old = snap().round!.id;
    game.disconnect(a, 'a');
    expect(snap().state).toBe('RECONNECTING');
    expect(() => game.submit(code, a, 'a', old, randomUUID(), jpeg)).toThrow('Join this battle');
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
    advance(3000);
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
  it('an unavailable verification provider falls back to human review', () => {
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
    );
    code = game.create(a, 'Alex', 'a').code;
    start();
    advance(3000);
    submit();
    expect(snap().round!.attempts[0].status).toBe('pending');
    expect(snap().players[0].score).toBe(0);
    expect(snap().message).toContain('unavailable');
  });
});
