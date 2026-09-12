import { describe, expect, it } from 'vitest';
import { PLACEMENT_MATCHES, STARTING_RATING } from '@battle/shared';
import { MemoryProfileStore, blankProfile } from '../src/profiles.js';
import { buildBoard, isBoardKind } from '../src/leaderboard.js';

const at = 1_700_000_000_000;

function storeWith(rows: Partial<ReturnType<typeof blankProfile>>[]): MemoryProfileStore {
  const store = new MemoryProfileStore();
  rows.forEach((row, i) => {
    store.save({
      ...blankProfile(row.id ?? `p${i}`, at),
      name: `Player ${i}`,
      matchesPlayed: PLACEMENT_MATCHES,
      ...row,
    });
  });
  return store;
}

describe('the board', () => {
  it('ranks by rating, highest first', () => {
    const store = storeWith([{ rating: 1200 }, { rating: 1600 }, { rating: 900 }]);
    const board = buildBoard(store, 'rating', null);
    expect(board.entries.map((e) => e.rating)).toEqual([1600, 1200, 900]);
    expect(board.entries.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it('leaves out anybody still in placement', () => {
    const store = storeWith([
      { id: 'settled', rating: 1200 },
      { id: 'new', rating: 1900, matchesPlayed: PLACEMENT_MATCHES - 1 },
    ]);
    const board = buildBoard(store, 'rating', null);
    expect(board.total).toBe(1);
    expect(board.entries[0]!.rating).toBe(1200);
  });

  it('leaves out anybody who has never played under a name', () => {
    const store = storeWith([{ rating: 1500, name: '' }, { rating: 1200 }]);
    expect(buildBoard(store, 'rating', null).total).toBe(1);
  });

  it('sorts a streak board by the best run, not the current one', () => {
    const store = storeWith([
      { id: 'a', bestStreak: 3, streak: 3, rating: 1000 },
      { id: 'b', bestStreak: 9, streak: 0, rating: 1000 },
    ]);
    expect(buildBoard(store, 'streak', null).entries[0]!.bestStreak).toBe(9);
  });

  it('sorts a wins board by wins', () => {
    const store = storeWith([
      { id: 'a', wins: 4, rating: 1800 },
      { id: 'b', wins: 40, rating: 1000 },
    ]);
    expect(buildBoard(store, 'wins', null).entries[0]!.wins).toBe(40);
  });

  it('breaks a tie the same way every time', () => {
    const store = storeWith([
      { id: 'a', wins: 10, rating: 1100 },
      { id: 'b', wins: 10, rating: 1400 },
    ]);
    expect(buildBoard(store, 'wins', null).entries.map((e) => e.rating)).toEqual([1400, 1100]);
  });

  it('finds the viewer wherever they landed, even off the page', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, rating: 1900 - i * 10 }));
    const store = storeWith(rows);
    const board = buildBoard(store, 'rating', 'p39', 10);
    expect(board.entries).toHaveLength(10);
    expect(board.you?.position).toBe(40);
    expect(board.total).toBe(40);
  });

  it('says nothing about a viewer who does not qualify', () => {
    const store = storeWith([{ id: 'a', rating: 1200 }]);
    expect(buildBoard(store, 'rating', 'nobody').you).toBeNull();
  });

  it('never leaks a history onto a scoreboard', () => {
    const store = storeWith([
      { id: 'a', rating: 1200, history: [{ at, opponentName: 'X', result: 'win', ratingBefore: 1, ratingAfter: 2, yourScore: 3, theirScore: 0 }] },
    ]);
    const [entry] = buildBoard(store, 'rating', 'a').entries;
    expect(Object.keys(entry!)).not.toContain('history');
  });

  it('copes with a board nobody is on yet', () => {
    const board = buildBoard(new MemoryProfileStore(), 'rating', 'a');
    expect(board).toMatchObject({ entries: [], total: 0, you: null });
  });

  it('falls back rather than trusting a board name off the wire', () => {
    expect(isBoardKind('rating')).toBe(true);
    expect(isBoardKind('../../etc/passwd')).toBe(false);
    expect(buildBoard(storeWith([{ rating: STARTING_RATING }]), 'rating', null).kind).toBe('rating');
  });
});
