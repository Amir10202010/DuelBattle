import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '../server/game';
import { Store } from '../server/store';

describe('live matchmaking queue', () => {
  let store: Store;
  let game: GameEngine;
  let now: number;
  let ids: string[];
  beforeEach(() => {
    now = Date.now();
    store = new Store(':memory:');
    ids = Array.from({ length: 5 }, () => store.createSession(now).session.id);
    game = new GameEngine(
      store,
      () => {},
      () => now,
      { searchMs: 1000 },
      undefined,
      () => 0,
    );
  });
  afterEach(() => {
    game.close();
    store.close();
  });
  const find = (i: number) => game.find(ids[i], `Player${i}`, `socket${i}`);

  it('pairs two searching players once, then starts a separate queue for the third', () => {
    const first = find(0);
    expect(game.snapshot(first.code)).toMatchObject({
      mode: 'random',
      state: 'WAITING_FOR_PLAYER',
      deadline: now + 1000,
    });
    expect(find(0)).toEqual(first);
    expect(find(1)).toEqual(first);
    expect(game.snapshot(first.code).players.map((p) => p.id)).toEqual(ids.slice(0, 2));
    expect(game.snapshot(first.code)).toMatchObject({ state: 'READY', deadline: null });
    const third = find(2);
    expect(third.code).not.toBe(first.code);
    expect(find(3)).toEqual(third);
    for (const id of ids)
      expect(store.profile({ id, csrf: '', expiresAt: 0 }, now).remaining).toBe(3);
  });
  it('keeps private friend lobbies out of random matchmaking and rejects invite bypasses', () => {
    const privateRoom = game.create(ids[0], 'Friend', 'socket0');
    const queued = find(1);
    expect(queued.code).not.toBe(privateRoom.code);
    expect(() => game.join(queued.code, ids[2], 'Intruder', 'socket2')).toThrow('Find opponent');
    expect(() => find(0)).toThrow('Leave your current');
    expect(game.join(privateRoom.code, ids[2], 'Friend2', 'socket2').players).toHaveLength(2);
  });
  it('prevents duplicate identities and another tab from matching itself', () => {
    const queued = find(0);
    expect(() => game.find(ids[0], 'Duplicate', 'another-tab')).toThrow('another tab');
    expect(() => game.create(ids[0], 'Duplicate', 'socket0')).toThrow('Leave your current');
    expect(game.snapshot(queued.code).players).toHaveLength(1);
  });
  it('removes cancelled, disconnected and timed-out searches', () => {
    const cancelled = find(0);
    game.leave(cancelled.code, ids[0], 'socket0');
    const disconnected = find(1);
    game.disconnect(ids[1], 'socket1');
    const expired = find(2);
    now += 1001;
    game.tick();
    const next = find(3);
    for (const previous of [cancelled, disconnected, expired]) {
      expect(game.snapshot(previous.code).state).toBe('CANCELLED');
      expect(next.code).not.toBe(previous.code);
    }
    expect(find(0)).toEqual(next);
  });
  it('checks allowance before matching and charges only after both players are ready', () => {
    for (let i = 0; i < 3; i++) store.consumeBattle([ids[1], ids[2]], now);
    const waiting = find(0);
    expect(() => find(1)).toThrow('limit');
    expect(game.snapshot(waiting.code).players).toHaveLength(1);
    find(3);
    game.media(waiting.code, ids[0], 'socket0', true, false);
    game.media(waiting.code, ids[3], 'socket3', true, false);
    game.ready(waiting.code, ids[0], 'socket0', true);
    game.ready(waiting.code, ids[3], 'socket3', true);
    expect(game.snapshot(waiting.code).state).toBe('COUNTDOWN');
    expect(store.profile({ id: ids[0], csrf: '', expiresAt: 0 }, now).remaining).toBe(2);
  });
});
