import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STARTING_RATING, type MatchResult } from '@battle/shared';
import { log } from './log.js';

/** One finished match, as it reads on a profile card. */
export interface MatchRecord {
  at: number;
  opponentName: string;
  result: MatchResult;
  ratingBefore: number;
  ratingAfter: number;
  yourScore: number;
  theirScore: number;
}

export interface PlayerProfile {
  id: string;
  /** The last name they played under. Display only. */
  name: string;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Consecutive wins, reset by anything that is not a win. */
  streak: number;
  bestStreak: number;
  createdAt: number;
  lastSeenAt: number;
  /** Most recent first. */
  history: MatchRecord[];
}

/** How much of a player's past is worth keeping on the card. */
export const HISTORY_KEPT = 10;

export function blankProfile(id: string, now: number): PlayerProfile {
  return {
    id,
    name: '',
    rating: STARTING_RATING,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    createdAt: now,
    lastSeenAt: now,
    history: [],
  };
}

export interface ProfileStore {
  get(id: string): PlayerProfile | undefined;
  save(profile: PlayerProfile): void;
  /** Flushes anything pending. Safe to call more than once. */
  close(): void;
  readonly size: number;
}

/** Ratings that live only as long as the process. Used by tests, and by a
 *  deployment that has deliberately not configured a data directory. */
export class MemoryProfileStore implements ProfileStore {
  private readonly rows = new Map<string, PlayerProfile>();

  get(id: string): PlayerProfile | undefined {
    return this.rows.get(id);
  }

  save(profile: PlayerProfile): void {
    this.rows.set(profile.id, profile);
  }

  close(): void {}

  get size(): number {
    return this.rows.size;
  }
}

/**
 * Profiles in one JSON file, written whole and atomically.
 *
 * Deliberately the least machinery that is actually durable. A row is a number
 * and a few counters, writes happen once per finished match, and a crash
 * halfway through a rename is the one failure a temp-file-and-rename cannot
 * produce. Everything is held in memory and the file is the backup.
 *
 * The honest limit: one process, and the whole file is rewritten each flush,
 * so this is comfortable into the low thousands of players and not beyond.
 * `ProfileStore` is the seam a real database goes behind when that day comes —
 * nothing above this line knows what a file is.
 */
export class FileProfileStore implements ProfileStore {
  private readonly rows = new Map<string, PlayerProfile>();
  private readonly path: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(dir: string, private readonly flushDelayMs = 1_000) {
    this.path = join(dir, 'profiles.json');
    mkdirSync(dir, { recursive: true });
    this.load();
  }

  get(id: string): PlayerProfile | undefined {
    return this.rows.get(id);
  }

  save(profile: PlayerProfile): void {
    this.rows.set(profile.id, profile);
    this.dirty = true;
    if (this.flushTimer) return;
    // Coalesce: two players finishing a match is one write, not two.
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushDelayMs);
    this.flushTimer.unref?.();
  }

  close(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  get size(): number {
    return this.rows.size;
  }

  private load(): void {
    let raw: string;
    try {
      raw = readFileSync(this.path, 'utf8');
    } catch {
      return; // First run. An absent file is not a problem.
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('expected an array of profiles');
      for (const row of parsed) {
        const profile = row as PlayerProfile;
        if (typeof profile?.id === 'string' && typeof profile.rating === 'number') {
          this.rows.set(profile.id, profile);
        }
      }
      log.info('profiles loaded', { count: this.rows.size });
    } catch (err) {
      // Refusing to start would cost every player their rating over one bad
      // byte. Starting fresh over a file we cannot read would cost them the
      // same thing, silently — so the file is left alone and said out loud.
      log.error('profiles file unreadable; starting empty and leaving it in place', {
        path: this.path,
        error: err instanceof Error ? err.message : String(err),
      });
      this.rows.clear();
    }
  }

  private flush(): void {
    if (!this.dirty) return;
    const temp = `${this.path}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify([...this.rows.values()]), 'utf8');
      renameSync(temp, this.path);
      this.dirty = false;
    } catch (err) {
      log.error('could not write profiles', {
        path: this.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
