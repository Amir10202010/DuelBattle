/**
 * Finding somebody to play.
 *
 * Until this existed the game had exactly one way in: send a link to a friend
 * and hope they are awake. That is a fine way to play and it is still the
 * better one — but it meant that a stranger who arrived, read the front page
 * and pressed the only button could not actually play anything. A queue is the
 * difference between a game and a demo.
 *
 * It is deliberately small. Two people are paired when each is inside the
 * other's rating window, and the window opens as they wait: close matches are
 * worth a few seconds, not a few minutes, and a game with nobody in it has to
 * pair whoever turns up rather than hold out for a rating that will never come.
 */

export interface Waiting {
  /** Identifies the socket, so a queue entry can be withdrawn. */
  key: string;
  /** Who this browser is, when it has proved it. Two tabs must not meet. */
  identity: string | null;
  rating: number;
  joinedAt: number;
}

/** How far apart two ratings may be at the moment somebody joins. */
export const INITIAL_WINDOW = 120;
/** How much further each step opens it. */
export const WINDOW_STEP = 120;
/** How often it opens. */
export const WINDOW_EVERY_MS = 5_000;
/** After this long, anybody will do — better a mismatch than an empty evening. */
export const WINDOW_OPEN_AFTER_MS = 30_000;

/** How wide this entry is willing to look, given how long it has waited. */
export function windowFor(entry: Waiting, now: number): number {
  const waited = Math.max(0, now - entry.joinedAt);
  if (waited >= WINDOW_OPEN_AFTER_MS) return Number.POSITIVE_INFINITY;
  return INITIAL_WINDOW + Math.floor(waited / WINDOW_EVERY_MS) * WINDOW_STEP;
}

export class MatchQueue {
  private readonly waiting = new Map<string, Waiting>();

  get size(): number {
    return this.waiting.size;
  }

  /** Joining twice replaces the first entry rather than queueing a ghost. */
  add(entry: Waiting): void {
    this.waiting.set(entry.key, entry);
  }

  remove(key: string): boolean {
    return this.waiting.delete(key);
  }

  has(key: string): boolean {
    return this.waiting.has(key);
  }

  /** Where in the line somebody is, 1-based, for telling them something true. */
  positionOf(key: string): number {
    const ordered = [...this.waiting.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const index = ordered.findIndex((entry) => entry.key === key);
    return index < 0 ? 0 : index + 1;
  }

  /**
   * Everybody who can be paired right now.
   *
   * Nearest ratings first, because pairing greedily down a sorted list gives
   * the closest available match to whoever has waited longest without needing
   * to score every possible pairing. Anybody left over stays queued and their
   * window is wider next time.
   */
  pairs(now: number): [Waiting, Waiting][] {
    const ordered = [...this.waiting.values()].sort(
      (a, b) => a.rating - b.rating || a.joinedAt - b.joinedAt,
    );
    const paired: [Waiting, Waiting][] = [];
    const taken = new Set<string>();

    for (let i = 0; i < ordered.length; i++) {
      const one = ordered[i]!;
      if (taken.has(one.key)) continue;
      for (let j = i + 1; j < ordered.length; j++) {
        const two = ordered[j]!;
        if (taken.has(two.key)) continue;
        // One browser holding both seats is not a match, it is a rating
        // laundering machine — and the standings refuse to record it anyway.
        if (one.identity && two.identity && one.identity === two.identity) continue;

        const gap = Math.abs(one.rating - two.rating);
        if (gap > windowFor(one, now) || gap > windowFor(two, now)) continue;

        taken.add(one.key);
        taken.add(two.key);
        this.waiting.delete(one.key);
        this.waiting.delete(two.key);
        paired.push([one, two]);
        break;
      }
    }

    return paired;
  }
}
