import { generateRoomCode, isValidRoomCode } from '@battle/shared';
import { Room } from './room.js';
import { log } from './log.js';

export interface RoomManagerOptions {
  maxRooms: number;
  emptyRoomTtlMs: number;
  maxRoomAgeMs: number;
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
      const code = generateRoomCode();
      if (this.rooms.has(code)) continue;
      const room = new Room(code, now);
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
