import { describe, expect, it } from 'vitest';
import { RoomCapacityError, RoomManager } from '../src/rooms.js';

function manager(overrides: Partial<ConstructorParameters<typeof RoomManager>[0]> = {}) {
  return new RoomManager({
    maxRooms: 100,
    emptyRoomTtlMs: 5_000,
    maxRoomAgeMs: 1_000_000,
    ...overrides,
  });
}

describe('RoomManager', () => {
  it('creates rooms with unique, findable codes', () => {
    const rooms = manager();
    const a = rooms.create(0);
    const b = rooms.create(0);
    expect(a.code).not.toBe(b.code);
    expect(rooms.get(a.code)).toBe(a);
  });

  it('does not look up malformed codes', () => {
    const rooms = manager();
    expect(rooms.get('nope')).toBeUndefined();
    expect(rooms.get('')).toBeUndefined();
    expect(rooms.get('ABCDEF')).toBeUndefined();
  });

  it('collects rooms that have been empty past their ttl', () => {
    const rooms = manager();
    rooms.create(0);
    expect(rooms.sweep(1_000)).toBe(0);
    expect(rooms.sweep(10_000)).toBe(1);
    expect(rooms.size).toBe(0);
  });

  it('makes space before refusing a new room', () => {
    const rooms = manager({ maxRooms: 1 });
    rooms.create(0);
    // The first room is stale by now, so the second should take its place.
    expect(() => rooms.create(10_000)).not.toThrow();
    expect(rooms.size).toBe(1);
  });

  it('refuses to create a room when the table is genuinely full', () => {
    const rooms = manager({ maxRooms: 1 });
    rooms.create(0);
    expect(() => rooms.create(1)).toThrow(RoomCapacityError);
  });

  it('reports occupancy', () => {
    const rooms = manager();
    const room = rooms.create(0);
    room.join('Ada', 0);
    expect(rooms.stats()).toEqual({ rooms: 1, players: 1 });
  });
});
