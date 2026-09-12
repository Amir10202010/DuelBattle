import { describe, expect, it } from 'vitest';
import {
  INITIAL_WINDOW,
  MatchQueue,
  WINDOW_OPEN_AFTER_MS,
  windowFor,
} from '../src/queue.js';

const at = 1_700_000_000_000;
const waiting = (key: string, rating: number, joinedAt = at) => ({
  key,
  identity: key,
  rating,
  joinedAt,
});

describe('the waiting window', () => {
  it('starts narrow', () => {
    expect(windowFor(waiting('a', 1000), at)).toBe(INITIAL_WINDOW);
  });

  it('opens as somebody waits', () => {
    const entry = waiting('a', 1000);
    expect(windowFor(entry, at + 6_000)).toBeGreaterThan(windowFor(entry, at));
  });

  it('gives up on fairness rather than on the player', () => {
    expect(windowFor(waiting('a', 1000), at + WINDOW_OPEN_AFTER_MS)).toBe(Infinity);
  });
});

describe('pairing', () => {
  it('does nothing with one person in it', () => {
    const queue = new MatchQueue();
    queue.add(waiting('a', 1000));
    expect(queue.pairs(at)).toEqual([]);
    expect(queue.size).toBe(1);
  });

  it('pairs two ratings that are close, and removes them', () => {
    const queue = new MatchQueue();
    queue.add(waiting('a', 1000));
    queue.add(waiting('b', 1040));
    const pairs = queue.pairs(at);
    expect(pairs).toHaveLength(1);
    expect(queue.size).toBe(0);
  });

  it('leaves two ratings that are far apart, for now', () => {
    const queue = new MatchQueue();
    queue.add(waiting('a', 800));
    queue.add(waiting('b', 1800));
    expect(queue.pairs(at)).toEqual([]);
    // ...and takes them once one of them has waited long enough.
    expect(queue.pairs(at + WINDOW_OPEN_AFTER_MS)).toHaveLength(1);
  });

  it('pairs the nearest ratings rather than the first two it sees', () => {
    const queue = new MatchQueue();
    queue.add(waiting('low', 1000));
    queue.add(waiting('high', 1100));
    queue.add(waiting('mid', 1050));
    const [pair] = queue.pairs(at);
    const keys = pair!.map((entry) => entry.key).sort();
    expect(keys).toEqual(['low', 'mid']);
    expect(queue.size).toBe(1);
  });

  it('refuses to sit one browser on both sides of a match', () => {
    const queue = new MatchQueue();
    queue.add({ key: 'tab-one', identity: 'same', rating: 1000, joinedAt: at });
    queue.add({ key: 'tab-two', identity: 'same', rating: 1000, joinedAt: at });
    expect(queue.pairs(at)).toEqual([]);
    expect(queue.pairs(at + WINDOW_OPEN_AFTER_MS)).toEqual([]);
  });

  it('still pairs two browsers that have not said who they are', () => {
    const queue = new MatchQueue();
    queue.add({ key: 'a', identity: null, rating: 1000, joinedAt: at });
    queue.add({ key: 'b', identity: null, rating: 1000, joinedAt: at });
    expect(queue.pairs(at)).toHaveLength(1);
  });

  it('makes as many pairs as it can in one pass', () => {
    const queue = new MatchQueue();
    for (let i = 0; i < 6; i++) queue.add(waiting(`p${i}`, 1000 + i));
    expect(queue.pairs(at)).toHaveLength(3);
    expect(queue.size).toBe(0);
  });

  it('never hands the same person to two matches', () => {
    const queue = new MatchQueue();
    for (let i = 0; i < 9; i++) queue.add(waiting(`p${i}`, 1000 + i * 5));
    const seen = new Set<string>();
    for (const [one, two] of queue.pairs(at)) {
      expect(seen.has(one.key)).toBe(false);
      expect(seen.has(two.key)).toBe(false);
      seen.add(one.key);
      seen.add(two.key);
    }
  });
});

describe('the line', () => {
  it('replaces an entry rather than queueing a ghost', () => {
    const queue = new MatchQueue();
    queue.add(waiting('a', 1000));
    queue.add(waiting('a', 1500));
    expect(queue.size).toBe(1);
  });

  it('counts from the front, oldest first', () => {
    const queue = new MatchQueue();
    queue.add(waiting('first', 1000, at));
    queue.add(waiting('second', 1000, at + 500));
    expect(queue.positionOf('first')).toBe(1);
    expect(queue.positionOf('second')).toBe(2);
    expect(queue.positionOf('nobody')).toBe(0);
  });

  it('lets somebody leave', () => {
    const queue = new MatchQueue();
    queue.add(waiting('a', 1000));
    expect(queue.remove('a')).toBe(true);
    expect(queue.remove('a')).toBe(false);
    expect(queue.has('a')).toBe(false);
  });
});
