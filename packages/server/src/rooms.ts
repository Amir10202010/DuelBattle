import { randomInt } from 'node:crypto';
import { generateRoomCode, isValidRoomCode } from '@battle/shared';
import { Room } from './room.js';
import type { AiJudge } from './ai/judge.js';
import type { ProfileStore } from './profiles.js';
import { log } from './log.js';

/**
 * Room codes are the only thing standing between a match and a stranger, so
 * they come from the CSPRNG rather than Math.random, whose state can be
 * recovered from a handful of observed outputs. 2^31 divides evenly by the
 * 32-character alphabet, so the mapping stays uniform.
 */
const CODE_RANDOM = () => randomInt(0, 2 ** 31) / 2 ** 31;

export interface RoomManagerOptions {
  maxRooms: number;
  emptyRoomTtlMs: number;
  maxRoomAgeMs: number;
  /** Shared by every room: one rotation of keys, one concurrency budget. */
  judge?: AiJudge;
  /** Shared by every room: one set of ratings for the whole server. */
  profiles?: ProfileStore;
}

export class RoomCapacityError extends Error {}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly options: RoomManagerOptions) {}

  get size(): number {
    return this.rooms.size;
  }

  create(now: number): Room {
    if (this.rooms.size >= this.options.maxRooms) {
      // Try to make space before giving up; a full table is usually stale rooms.
      this.sweep(now);
      if (this.rooms.size >= this.options.maxRooms) {
        throw new RoomCapacityError('room limit reached');
      }
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = generateRoomCode(CODE_RANDOM);
      if (this.rooms.has(code)) continue;
      const room = new Room(code, now, {
        ...(this.options.judge ? { judge: this.options.judge } : {}),
        ...(this.options.profiles ? { profiles: this.options.profiles } : {}),
      });
      this.rooms.set(code, room);
      log.info('room created', { room: code, total: this.rooms.size });
      return room;
    }
    // 32^5 codes against a bounded room table: this means something is wrong.
    throw new RoomCapacityError('could not allocate a unique room code');
  }

  get(code: string): Room | undefined {
    if (!isValidRoomCode(code)) return undefined;
    return this.rooms.get(code);
  }

  /** Drops rooms that nobody has been in for a while, and very old ones. */
  sweep(now: number): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      if (!room.isCollectable(now, this.options.emptyRoomTtlMs, this.options.maxRoomAgeMs)) continue;
      this.rooms.delete(code);
      removed++;
    }
    if (removed > 0) log.info('rooms collected', { removed, remaining: this.rooms.size });
    return removed;
  }

  tick(now: number): void {
    for (const room of this.rooms.values()) room.tick(now);
  }

  stats(): { rooms: number; players: number } {
    let players = 0;
    for (const room of this.rooms.values()) players += room.playerCount;
    return { rooms: this.rooms.size, players };
  }
}
