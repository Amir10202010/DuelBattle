/**
 * The contract between the Mini App and the server.
 *
 * Declared here for the same reason the wire protocol is: both sides have to
 * agree, and a type that only one of them can see is not an agreement. The
 * server parses untrusted input with zod in its own package; this file is the
 * shape of what comes back, which the client consumes directly.
 *
 * Nothing in here is a secret. No account id, no session token belonging to
 * somebody else, no Telegram id but your own — a Mini App screen never needs
 * one, and a payload that carries an identifier the UI does not draw is a leak
 * waiting for a `console.log`.
 */

import type { Avatar, MatchRecord } from './profile.js';
import type { Loadout } from './cosmetics.js';

/** Every Telegram deep-link payload the product understands. */
export const TELEGRAM_LINK_KINDS = ['ref', 'duel', 'link', 'go'] as const;
export type TelegramLinkKind = (typeof TELEGRAM_LINK_KINDS)[number];

/** Sections a `go_` deep link may open. Anything else is the home screen. */
export const TELEGRAM_SECTIONS = ['home', 'duel', 'rank', 'social', 'profile'] as const;
export type TelegramSection = (typeof TELEGRAM_SECTIONS)[number];

export interface TelegramRankView {
  label: string;
  tierName: string;
  division: 1 | 2 | 3 | null;
  /** 0..1 through the current rung. */
  progress: number;
  /** Rating at which the next rung begins; null at the very top. */
  nextAt: number | null;
  pointsToNext: number | null;
}

export interface TelegramPremium {
  active: boolean;
  /** Epoch ms, or null for a grant that does not expire. */
  until: number | null;
  /** Which provider paid for it. Features never branch on this. */
  source: string | null;
}

/** The toggles a player owns. Every notification kind checks one of these. */
export interface TelegramNotificationPrefs {
  matches: boolean;
  challenges: boolean;
  achievements: boolean;
  social: boolean;
  digest: boolean;
  /** Local hour, 0-23, during which nothing is delivered. Both null to disable. */
  quietFrom: number | null;
  quietTo: number | null;
  /** Minutes east of UTC, as the Mini App reports it. */
  utcOffsetMinutes: number;
}

/** Your own card. The only place a full record is ever sent. */
export interface TelegramMe {
  name: string;
  /** Telegram @username, when they have one. Display only; identity is the id. */
  telegramUsername: string | null;
  photoUrl: string | null;
  avatar: Avatar;
  loadout: Loadout;
  rating: number;
  peakRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  xp: number;
  level: number;
  levelProgress: number;
  coins: number;
  achievements: string[];
  rank: TelegramRankView;
  placed: boolean;
  /** Where they sit on the global ladder, or null before placement. */
  position: number | null;
  premium: TelegramPremium;
  /** Consecutive days with at least one finished match. */
  dailyStreak: { current: number; best: number };
  referralCode: string;
  /**
   * The full invite link, built by the server.
   *
   * The bot's username is configuration the server holds and the client has no
   * other way to learn, so the link is sent whole rather than assembled twice.
   * Empty when the deployment has not configured a bot username.
   */
  referralLink: string;
  /**
   * The sentence that goes with it.
   *
   * Built server-side for the same reason as the link: it is a message sent
   * into another app rather than text this UI renders, so it belongs with the
   * other outbound copy and not in a React component.
   */
  referralShareText: string;
  referrals: { joined: number; activated: number; rewarded: number };
  notifications: TelegramNotificationPrefs;
  /** True when the account also has a browser sign-in attached. */
  linkedToWeb: boolean;
  createdAt: number;
}

/** Somebody else, drawn on an opponent card or a leaderboard row. */
export interface TelegramPlayerCard {
  /** Opaque, stable, and safe to hand around — never the account id. */
  ref: string;
  name: string;
  avatar: Avatar;
  loadout: Loadout;
  rating: number;
  rank: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  streak: number;
  level: number;
  premium: boolean;
}

export interface TelegramQuest {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  /** Battle coins paid when claimed. */
  reward: number;
  done: boolean;
  claimed: boolean;
}

export interface TelegramQuestBoard {
  /** UTC day the board belongs to, `YYYY-MM-DD`. */
  day: string;
  /** Epoch ms at which this board is replaced. */
  resetsAt: number;
  quests: TelegramQuest[];
}

export interface TelegramMatchRow extends MatchRecord {
  /** Index into the stored history, which is what a detail view asks for. */
  index: number;
  ranked: boolean;
}

export interface TelegramChallengeView {
  code: string;
  /** Deep link that opens this challenge in the Mini App. */
  link: string;
  /** Ready-made sentence for the share sheet. */
  shareText: string;
  status: 'pending' | 'accepted' | 'playing' | 'completed' | 'expired' | 'declined';
  createdAt: number;
  expiresAt: number;
  host: TelegramPlayerCard;
  guest: TelegramPlayerCard | null;
  /** Set once both sides are ready and a room has been opened for them. */
  roomCode: string | null;
  /** True when the viewer created it. */
  mine: boolean;
}

export interface TelegramLeaderboardRow extends TelegramPlayerCard {
  position: number;
  you: boolean;
}

export interface TelegramLeaderboardView {
  board: 'rating' | 'wins' | 'streak';
  scope: 'global' | 'friends';
  offset: number;
  total: number;
  rows: TelegramLeaderboardRow[];
  you: TelegramLeaderboardRow | null;
}

export interface TelegramSocialView {
  friends: TelegramPlayerCard[];
  recentOpponents: TelegramPlayerCard[];
  blocked: TelegramPlayerCard[];
  /** Challenges somebody sent you that are still open. */
  incoming: TelegramChallengeView[];
  /** Challenges you sent that nobody has answered yet. */
  outgoing: TelegramChallengeView[];
}

export interface TelegramAchievementView {
  id: string;
  name: string;
  description: string;
  group: string;
  rarity: string;
  xp: number;
  unlocked: boolean;
  progress: { have: number; need: number } | null;
}

export interface TelegramPremiumOffer {
  /** Price in Telegram Stars. Configuration, not a constant. */
  stars: number;
  /** How long one purchase lasts, in days. Null means it never expires. */
  days: number | null;
  benefits: string[];
  /** False when the deployment has no bot token and cannot sell anything. */
  available: boolean;
}

/** Everything the first screen needs, in one round trip. */
export interface TelegramHome {
  me: TelegramMe;
  quests: TelegramQuestBoard;
  recentMatches: TelegramMatchRow[];
  leaderboard: TelegramLeaderboardRow[];
  incoming: TelegramChallengeView[];
  /** Real counts from the database, or null when there is nothing honest to say. */
  pulse: { duelsToday: number; playersToday: number } | null;
}

/** What `POST /api/telegram/auth` answers with. */
export interface TelegramAuthResult {
  token: string;
  expiresAt: number;
  /** Where the deep link the app was opened with wants to go. */
  intent:
    | { kind: 'home' }
    | { kind: 'section'; section: TelegramSection }
    | { kind: 'challenge'; code: string }
    | { kind: 'referral'; accepted: boolean };
  home: TelegramHome;
}

/** The share card a player can send after a match. */
export interface TelegramResultCard {
  headline: string;
  lines: string[];
  shareText: string;
  /** Deep link the recipient of the share lands on. */
  link: string;
}
