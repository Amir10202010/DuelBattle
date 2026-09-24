import {
  ACHIEVEMENTS,
  isPlaced,
  levelFor,
  nextRank,
  rankFor,
  type TelegramAchievementView,
  type TelegramLeaderboardRow,
  type TelegramLeaderboardView,
  type TelegramMatchRow,
  type TelegramMe,
  type TelegramPlayerCard,
  type TelegramRankView,
} from '@battle/shared';
import { botLink } from './config.js';
import type { Database } from '../database.js';
import type { PlayerProfile } from '../profiles.js';
import { Entitlements } from '../entitlements.js';
import type { TelegramIdentities } from './identity.js';
import type { NotificationService } from './notifications.js';
import type { Referrals } from './referrals.js';
import type { Social } from './social.js';
import type { DailyStreaks } from './streaks.js';

/**
 * Turning rows into the payloads the Mini App draws.
 *
 * Kept away from the route handlers for one reason: this is where the decision
 * "what is somebody allowed to see about somebody else" is made, and that
 * decision should live in one file rather than in fourteen. A card built here
 * carries an opaque `ref`, never an account id, and never a Telegram id but
 * your own.
 */

function rankView(rating: number): TelegramRankView {
  const rank = rankFor(rating);
  const next = nextRank(rating);
  return {
    label: rank.label,
    tierName: rank.tier.name,
    division: rank.division,
    progress: rank.progress,
    nextAt: next ? next.rank.floor : null,
    pointsToNext: next ? next.pointsAway : null,
  };
}

export class TelegramViews {
  private readonly entitlements: Entitlements;

  constructor(
    private readonly db: Database,
    private readonly identities: TelegramIdentities,
    private readonly social: Social,
    private readonly referrals: Referrals,
    private readonly streaks: DailyStreaks,
    private readonly notifications: NotificationService,
  ) {
    this.entitlements = new Entitlements(db);
  }

  /** A player as anybody may see them. Counts only, nothing personal. */
  card(profile: PlayerProfile, now: number): TelegramPlayerCard {
    return {
      ref: this.identities.refFor(profile.id, now),
      name: profile.name || 'Player',
      avatar: profile.avatar,
      loadout: profile.loadout,
      rating: profile.rating,
      rank: rankFor(profile.rating).label,
      matchesPlayed: profile.matchesPlayed,
      wins: profile.wins,
      losses: profile.losses,
      streak: profile.streak,
      level: levelFor(profile.xp).level,
      premium: this.entitlements.has(profile.id, 'premium', now),
    };
  }

  cardFor(accountId: string, now: number): TelegramPlayerCard | null {
    const profile = this.db.get(accountId);
    return profile ? this.card(profile, now) : null;
  }

  cardsFor(accountIds: string[], now: number): TelegramPlayerCard[] {
    return accountIds
      .map((id) => this.cardFor(id, now))
      .filter((card): card is TelegramPlayerCard => card !== null);
  }

  /** Your own record. The only payload that carries everything. */
  me(accountId: string, now: number): TelegramMe {
    const profile = this.db.get(accountId)!;
    const identity = this.identities.byAccount(accountId);
    const level = levelFor(profile.xp);
    const wallet = this.db.sql
      .prepare('SELECT coins FROM wallets WHERE account_id=?')
      .get(accountId);
    const placed = isPlaced(profile.matchesPlayed);
    const code = this.referrals.codeFor(accountId, now);
    const position = placed
      ? (this.db.rankedPage('rating', accountId, 0, 0).own?.position ?? null)
      : null;

    return {
      name: profile.name || identity?.firstName || 'Player',
      telegramUsername: identity?.username ?? null,
      photoUrl: identity?.photoUrl ?? null,
      avatar: profile.avatar,
      loadout: profile.loadout,
      rating: profile.rating,
      peakRating: profile.peakRating,
      casualPlayed: profile.casualPlayed,
      casualWins: profile.casualWins,
      history: profile.history,
      matchesPlayed: profile.matchesPlayed,
      wins: profile.wins,
      losses: profile.losses,
      draws: profile.draws,
      streak: profile.streak,
      bestStreak: profile.bestStreak,
      xp: profile.xp,
      level: level.level,
      levelProgress: level.progress,
      coins: Number(wallet?.coins ?? 0),
      achievements: profile.achievements,
      rank: rankView(profile.rating),
      placed,
      position,
      premium: this.entitlements.premium(accountId, now),
      dailyStreak: (({ current, best }) => ({ current, best }))(this.streaks.read(accountId, now)),
      referralCode: code,
      referralLink: botLink(`ref_${code}`),
      referralShareText:
        '⚔️ Duel me on Duel Battle — same challenge, one camera each, first to find it wins.',
      referrals: this.referrals.stats(accountId),
      notifications: this.notifications.preferences(accountId),
      linkedToWeb: this.identities.hasWebSignIn(accountId),
      createdAt: profile.createdAt,
    };
  }

  /**
   * Somebody's match history, newest first.
   *
   * The stored history is the one the profile page already uses; this adds the
   * index so a row can be opened, and says whether it counted for rating —
   * which the record itself implies but never states.
   */
  matches(accountId: string, offset: number, limit: number): TelegramMatchRow[] {
    const profile = this.db.get(accountId);
    if (!profile) return [];
    return profile.history.slice(offset, offset + limit).map((record, index) => ({
      ...record,
      index: offset + index,
      // Rows written before casual matches were recorded carry no mode, and
      // every one of those was ranked.
      ranked: record.mode !== 'casual',
    }));
  }

  match(accountId: string, index: number): TelegramMatchRow | null {
    const profile = this.db.get(accountId);
    const record = profile?.history[index];
    return record ? { ...record, index, ranked: record.mode !== 'casual' } : null;
  }

  /**
   * The ladder.
   *
   * Global reuses the existing paged query, which already excludes anybody who
   * has not finished placement. The friends board is its own query because a
   * friends list is short and paging it would be theatre.
   */
  leaderboard(input: {
    accountId: string;
    board: 'rating' | 'wins' | 'streak';
    scope: 'global' | 'friends';
    offset: number;
    limit: number;
    now: number;
  }): TelegramLeaderboardView {
    const { accountId, board, scope, offset, limit, now } = input;
    if (scope === 'friends') return this.friendsBoard(accountId, board, now);

    const page = this.db.rankedPage(board, accountId, offset, limit);
    const rows: TelegramLeaderboardRow[] = page.profiles.map((profile, index) => ({
      ...this.card(profile, now),
      position: offset + index + 1,
      you: profile.id === accountId,
    }));
    return {
      board,
      scope,
      offset,
      total: page.total,
      rows,
      you: page.own
        ? { ...this.card(page.own.profile, now), position: page.own.position, you: true }
        : null,
    };
  }

  private friendsBoard(
    accountId: string,
    board: 'rating' | 'wins' | 'streak',
    now: number,
  ): TelegramLeaderboardView {
    const ids = [accountId, ...this.social.friends(accountId)];
    const profiles = ids
      .map((id) => this.db.get(id))
      .filter((profile): profile is PlayerProfile => Boolean(profile));
    const key =
      board === 'wins'
        ? (p: PlayerProfile) => p.wins
        : board === 'streak'
          ? (p: PlayerProfile) => p.bestStreak
          : (p: PlayerProfile) => p.rating;
    profiles.sort((a, b) => key(b) - key(a) || b.rating - a.rating || (a.id < b.id ? -1 : 1));

    const rows = profiles.map((profile, index) => ({
      ...this.card(profile, now),
      position: index + 1,
      you: profile.id === accountId,
    }));
    return {
      board,
      scope: 'friends',
      offset: 0,
      total: rows.length,
      rows,
      you: rows.find((row) => row.you) ?? null,
    };
  }

  /**
   * The achievement catalogue with this player's state on it.
   *
   * The catalogue is the shared one the web app already draws, so an
   * achievement never means two different things in two places.
   */
  achievements(accountId: string): TelegramAchievementView[] {
    const profile = this.db.get(accountId);
    const unlocked = new Set(profile?.achievements ?? []);
    return ACHIEVEMENTS.map((achievement) => ({
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      group: achievement.group,
      rarity: achievement.rarity,
      xp: achievement.xp,
      unlocked: unlocked.has(achievement.id),
      progress:
        profile && achievement.progress && !unlocked.has(achievement.id)
          ? achievement.progress(profile)
          : null,
    }));
  }
}
