import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STARTING_RATING,
  avatarFor,
  normalizeAvatar,
  type MatchRecord,
  type PublicProfile,
} from '@battle/shared';
import { log } from './log.js';

export type { MatchRecord };

/**
 * A stored row: everything the opponent may see, plus the parts that never
 * leave this side — who it belongs to and when it was last touched.
 */
export interface PlayerProfile extends Required<PublicProfile> {
  id: string;
  /** The last name they played under. Display only. */
  name: string;
  createdAt: number;
  lastSeenAt: number;
  /** Most recent first. */
  history: MatchRecord[];
}

/**
 * How much of a player's past is worth keeping.
 *
 * Enough to fill a profile page and to show a shape — a bad week, a run of
 * upsets — without the file growing without limit. Twenty-five rows is about
 * four kilobytes per player at the top end, which is nothing next to the
 * rating it sits beside.
 */
export const HISTORY_KEPT = 25;

export function blankProfile(id: string, now: number): PlayerProfile {
  return {
    id,
    name: '',
    avatar: avatarFor(id),
    rating: STARTING_RATING,
    peakRating: STARTING_RATING,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    bestStreak: 0,
    xp: 0,
    achievements: [],
    createdAt: now,
    lastSeenAt: now,
    history: [],
  };
}

/**
 * Fills in a row written before a field existed.
 *
 * The store is one JSON file that outlives deploys, so every read has to cope
 * with a row from an older build. Defaulting on read rather than migrating the
 * file keeps the rule in one place and means a rollback does not strand
 * anybody's rating behind a schema they no longer have.
 */
export function hydrate(row: Partial<PlayerProfile> & { id: string }, now: number): PlayerProfile {
  const blank = blankProfile(row.id, now);
  return {
    ...blank,
    ...row,
    avatar: normalizeAvatar(row.avatar ?? blank.avatar),
    peakRating: Math.max(row.peakRating ?? 0, row.rating ?? blank.rating),
    xp: Math.max(0, Math.floor(row.xp ?? 0)),
    achievements: Array.isArray(row.achievements) ? row.achievements.filter((a) => typeof a === 'string') : [],
    history: Array.isArray(row.history) ? row.history : [],
  };
}

/** Everything a client may be told about a row, with nothing private in it. */
export function publicView(profile: PlayerProfile, own: boolean): PublicProfile {
  const { name, avatar, rating, peakRating, matchesPlayed, wins, losses, draws, streak, bestStreak, xp, achievements } = profile;
  return {
    name,
    avatar,
    rating,
    peakRating,
    matchesPlayed,
    wins,
    losses,
    draws,
    streak,
    bestStreak,
    xp,
    achievements,
    ...(own ? { history: profile.history } : {}),
  };
}

export interface ProfileStore {
  get(id: string): PlayerProfile | undefined;
  save(profile: PlayerProfile): void;
  /**
   * Every row, for the leaderboard.
   *
   * A copy rather than the live map: a board is a snapshot of a moment, and
   * handing out the store's own collection would let a caller reorder it.
   */
  all(): PlayerProfile[];
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

  all(): PlayerProfile[] {
    return [...this.rows.values()];
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

  all(): PlayerProfile[] {
    return [...this.rows.values()];
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
        const profile = row as Partial<PlayerProfile> & { id?: unknown };
        if (typeof profile?.id === 'string' && typeof profile.rating === 'number') {
          this.rows.set(profile.id, hydrate(profile as Partial<PlayerProfile> & { id: string }, Date.now()));
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
