import { isPlaced, levelFor, type Avatar } from '@battle/shared';
import type { PlayerProfile, ProfileStore } from './profiles.js';

/**
 * The board.
 *
 * Built from the same rows the game writes after every match, which is the
 * only honest way to build one: there is no separate table to drift out of
 * sync, and no seeded rank that nobody played for. A player who has not
 * finished placement is not on it — a 40-point K factor means a single lucky
 * evening would otherwise sit above people with a hundred matches behind them.
 *
 * Names are shown because a scoreboard without them is a list of numbers.
 * Nothing else leaves: no history, no identity, no last-seen. A row here is
 * what somebody chose to be called and what they have done in public.
 */

export type BoardKind = 'rating' | 'streak' | 'wins';

export const BOARDS: readonly BoardKind[] = ['rating', 'streak', 'wins'];

export function isBoardKind(value: unknown): value is BoardKind {
  return typeof value === 'string' && (BOARDS as readonly string[]).includes(value);
}

export interface BoardEntry {
  movement: number;
  recent: ('win' | 'loss' | 'draw')[];
  /** 1-based, and stable within one response. */
  position: number;
  name: string;
  avatar: Avatar;
  rating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  streak: number;
  bestStreak: number;
  level: number;
}

export interface Board {
  offset: number;
  kind: BoardKind;
  entries: BoardEntry[];
  /** How many records qualify, so a page of ten can say what it is ten of. */
  total: number;
  /** The viewer's own row, wherever it fell. Null if they do not qualify yet. */
  you: BoardEntry | null;
}

/** A record has to have been earned in public before it can be ranked. */
function qualifies(profile: PlayerProfile): boolean {
  return isPlaced(profile.matchesPlayed) && profile.name.trim().length > 0;
}

function compare(kind: BoardKind, a: PlayerProfile, b: PlayerProfile): number {
  switch (kind) {
    case 'streak':
      // A best streak with nothing behind it is a coin toss; matches break ties.
      return b.bestStreak - a.bestStreak || b.rating - a.rating;
    case 'wins':
      return b.wins - a.wins || b.rating - a.rating;
    case 'rating':
      return b.rating - a.rating || b.wins - a.wins;
  }
}

function entry(profile: PlayerProfile, position: number, kind: BoardKind): BoardEntry {
  return {
    movement:
      kind === 'rating' && profile.previousPosition ? profile.previousPosition - position : 0,
    recent: profile.history.slice(0, 5).map((r) => r.result),
    position,
    name: profile.name,
    avatar: profile.avatar,
    rating: profile.rating,
    matchesPlayed: profile.matchesPlayed,
    wins: profile.wins,
    losses: profile.losses,
    streak: profile.streak,
    bestStreak: profile.bestStreak,
    level: levelFor(profile.xp).level,
  };
}

export const BOARD_PAGE = 25;

/**
 * The top of one board, plus wherever the viewer is on it.
 *
 * Sorting every row on each request is deliberate: the whole point of this
 * store is that it is small enough not to need an index, and a board that is
 * computed is a board that cannot be stale. The day that stops being true is
 * the day `ProfileStore` goes in front of a database, and this function is one
 * of the two callers that would have to change.
 */
export function buildBoard(
  store: ProfileStore,
  kind: BoardKind,
  viewerId: string | null,
  limit = BOARD_PAGE,
  offset = 0,
): Board {
  offset = Math.max(0, Math.min(100000, Math.floor(offset)));
  limit = Math.max(1, Math.min(100, Math.floor(limit)));
  if (store.rankedPage) {
    let page = store.rankedPage(kind, viewerId, offset, limit);
    if (page.total > 0 && offset >= page.total) {
      offset = Math.floor((page.total - 1) / limit) * limit;
      page = store.rankedPage(kind, viewerId, offset, limit);
    }
    return {
      kind,
      offset,
      total: page.total,
      entries: page.profiles.map((p, i) => entry(p, offset + i + 1, kind)),
      you: page.own ? entry(page.own.profile, page.own.position, kind) : null,
    };
  }
  const ranked = store
    .all()
    .filter(qualifies)
    .sort((a, b) => compare(kind, a, b));

  const entries = ranked
    .slice(offset, offset + limit)
    .map((p, i) => entry(p, offset + i + 1, kind));

  let you: BoardEntry | null = null;
  if (viewerId) {
    const index = ranked.findIndex((p) => p.id === viewerId);
    if (index >= 0) you = entry(ranked[index]!, index + 1, kind);
  }

  return { kind, offset, entries, total: ranked.length, you };
}
