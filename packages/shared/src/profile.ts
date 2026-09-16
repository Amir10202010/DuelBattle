import type { MatchResult } from './rating.js';
import type { Loadout } from './cosmetics.js';

/** One finished match, as it reads on a profile card. */
export interface MatchRecord {
  forfeited?: boolean;
  topicIds?: string[];
  id?: string;
  dailyBonus?: number;
  categories?: string[];
  at: number;
  opponentName: string;
  result: MatchResult;
  ratingBefore: number;
  ratingAfter: number;
  yourScore: number;
  theirScore: number;
  /** XP the match was worth, achievements included. Absent on older rows. */
  xp?: number;
}

/**
 * How a player is drawn when there is no photograph to draw them with.
 *
 * There are no uploads here and there is not going to be one: an account-less
 * game that accepts image files has just become a moderation problem. A shape
 * and a colour picked from a short list is identity enough to tell two names
 * apart on a leaderboard, which is the whole job.
 */
export interface Avatar {
  /** Index into the shared shape list. */
  shape: number;
  /** Index into the shared colour list. */
  color: number;
}

/**
 * What a player is allowed to know about somebody's record.
 *
 * Everything here is a count of matches played in public against a live
 * opponent, so all of it is fair game to show either side. The recent history
 * is the exception, and only because a card showing ten of somebody else's
 * matches is a stalking tool rather than a scoreboard — the server sends that
 * to the person it belongs to and to nobody else.
 */
export interface PublicProfile {
  loadout?: Loadout;
  /** The name they last played under. Empty until they have played once. */
  name: string;
  avatar: Avatar;
  rating: number;
  /** The highest rating ever held. A rank you earned is never taken back. */
  peakRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Consecutive wins, reset by anything that is not a win. */
  streak: number;
  bestStreak: number;
  /** Lifetime XP. Only ever goes up; drives the level, and nothing else. */
  xp: number;
  /** Ids from the shared achievement catalogue, oldest first. */
  achievements: string[];
  /** Present only on your own card. */
  history?: MatchRecord[];
}

/** What a finished match did to one player's rating. */
export interface RatingDelta {
  before: number;
  after: number;
  /** Signed, and exactly what is shown on screen. */
  change: number;
}

/**
 * Everything a match just paid out, for the screen that shows it.
 *
 * Sent alongside the rating delta rather than folded into it: a rating is the
 * ladder and this is the reward, and the end-of-match screen says both without
 * pretending they are the same number.
 */
export interface MatchRewards {
  coins?: number;
  dailyBonus?: number;
  xp: number;
  /** Level before and after, so a level-up can be announced. */
  levelBefore: number;
  levelAfter: number;
  /** Achievement ids unlocked by this match. */
  unlocked: string[];
  /** Whether the result moved them between rungs on the ladder. */
  rankMove: 'promoted' | 'demoted' | null;
}

/** The palette an avatar colour indexes into. Shared so both sides agree. */
export const AVATAR_COLORS: readonly string[] = [
  '#d9f65a',
  '#ff8a6b',
  '#7fd1f5',
  '#c79bff',
  '#ffc861',
  '#8de0a4',
  '#ff9ecb',
  '#9fb0ff',
];

/** The shapes an avatar shape index picks from. Drawn by the client as SVG. */
export const AVATAR_SHAPES: readonly string[] = ['bolt', 'disc', 'wedge', 'grid', 'ring', 'cross'];

export function defaultAvatar(): Avatar {
  return { shape: 0, color: 0 };
}

/** Clamps whatever is stored into something that can actually be drawn. */
export function normalizeAvatar(avatar: Partial<Avatar> | undefined): Avatar {
  const shape = Number.isInteger(avatar?.shape) ? (avatar!.shape as number) : 0;
  const color = Number.isInteger(avatar?.color) ? (avatar!.color as number) : 0;
  return {
    shape: ((shape % AVATAR_SHAPES.length) + AVATAR_SHAPES.length) % AVATAR_SHAPES.length,
    color: ((color % AVATAR_COLORS.length) + AVATAR_COLORS.length) % AVATAR_COLORS.length,
  };
}

/**
 * A stable avatar for somebody who has never chosen one.
 *
 * Derived from the identity so the same player is the same colour on every
 * screen they appear on, without the server having to store a choice nobody
 * made.
 */
export function avatarFor(id: string): Avatar {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = Math.abs(hash);
  return {
    shape: positive % AVATAR_SHAPES.length,
    color: Math.floor(positive / AVATAR_SHAPES.length) % AVATAR_COLORS.length,
  };
}
