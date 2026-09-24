import {
  ACHIEVEMENTS,
  rankFor,
  type TelegramAuthResult,
  type TelegramChallengeView,
  type TelegramHome,
  type TelegramPlayerCard,
} from '@battle/shared';
import type { AuthService } from '../auth.js';
import type { Database } from '../database.js';
import { log } from '../log.js';
import type { RoomManager } from '../rooms.js';
import type { SettledMatch } from '../settlement.js';
import { TelegramBotApi } from './api.js';
import { Analytics } from '../analytics.js';
import type { MetaService } from '../meta/service.js';
import { botLink, telegramConfig } from './config.js';
import {
  BOT_COMMANDS,
  BOT_COMMANDS_RU,
  BOT_DESCRIPTION,
  BOT_DESCRIPTION_RU,
  BOT_MENU_BUTTON_TEXT,
  BOT_SHORT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION_RU,
} from './profile.js';
import { Duels, type Duel } from './duels.js';
import { Entitlements } from '../entitlements.js';
import { TelegramIdentities } from './identity.js';
import { validateTelegramInitData, type InitDataFailure } from './initData.js';
import { LinkCodes } from './links.js';
import { NotificationService, playButton } from './notifications.js';
import { Payments } from './payments.js';
import { DailyQuests } from './quests.js';
import { Referrals } from './referrals.js';
import { sweepTelegram } from './schema.js';
import { Social } from './social.js';
import { DailyStreaks } from './streaks.js';
import { WeeklyRecap } from './recap.js';
import { TelegramViews } from './views.js';

/**
 * The composition root for everything Telegram.
 *
 * One object the rest of the server can hold, construct once, and switch off by
 * not constructing. It owns the pieces, wires them to each other, and is the
 * only place that knows how a finished match turns into a quest tick, a streak,
 * a referral payout and a message — which is why `onSettled` reads like the
 * list of things a result is worth.
 */

export interface TelegramServiceDeps {
  db: Database;
  auth: AuthService;
  rooms: RoomManager;
  /** The store, for offers paid in Stars. Absent means Premium is the only product. */
  meta?: MetaService;
}

const FAILURE_COPY: Record<InitDataFailure, string> = {
  'not-configured': 'Telegram sign-in is not set up on this server yet.',
  malformed: 'Open Duel Battle from the Telegram bot to continue.',
  'bad-hash': 'We could not verify this Telegram session. Reopen the app.',
  expired: 'That Telegram session has expired. Reopen the app.',
};

export class TelegramService {
  readonly api: TelegramBotApi;
  readonly identities: TelegramIdentities;
  readonly links: LinkCodes;
  readonly referrals: Referrals;
  readonly social: Social;
  readonly duels: Duels;
  readonly quests: DailyQuests;
  readonly streaks: DailyStreaks;
  readonly entitlements: Entitlements;
  readonly payments: Payments;
  readonly notifications: NotificationService;
  readonly analytics: Analytics;
  readonly views: TelegramViews;
  readonly recap: WeeklyRecap;

  /** Public so the admin console can write its own audit rows. */
  readonly db: Database;
  /** Quests, the season and the shop, shared with the web client. */
  readonly meta: MetaService | undefined;
  private readonly auth: AuthService;
  private readonly rooms: RoomManager;
  private lastSweep = 0;

  constructor(deps: TelegramServiceDeps) {
    this.db = deps.db;
    this.auth = deps.auth;
    this.rooms = deps.rooms;

    this.api = new TelegramBotApi(telegramConfig.botToken);
    this.identities = new TelegramIdentities(this.db);
    this.links = new LinkCodes(this.db);
    this.referrals = new Referrals(this.db);
    this.social = new Social(this.db);
    this.duels = new Duels(this.db, this.social);
    this.quests = new DailyQuests(this.db);
    this.streaks = new DailyStreaks(this.db);
    this.entitlements = new Entitlements(this.db);
    this.meta = deps.meta;
    this.payments = new Payments(this.db, this.api, this.entitlements, deps.meta?.starOffers());
    this.notifications = new NotificationService(this.db, this.api, this.identities);
    this.analytics = new Analytics(this.db);
    this.recap = new WeeklyRecap(this.db, this.notifications, this.streaks);
    this.views = new TelegramViews(
      this.db,
      this.identities,
      this.social,
      this.referrals,
      this.streaks,
      this.notifications,
    );
  }

  // -- Authentication ------------------------------------------------------

  /**
   * Turns a Mini App launch into a session.
   *
   * The signature is checked first and everything else follows from it. A
   * launch that does not verify never reaches the database, which is the
   * property worth having: an attacker cannot make us create a row, look up a
   * player, or spend a referral by sending a plausible-looking string.
   */
  authenticate(
    initData: string,
    now: number,
  ): { ok: true; result: TelegramAuthResult } | { ok: false; status: number; error: string } {
    const verified = validateTelegramInitData(initData, telegramConfig.botToken, now);
    if (!verified.ok)
      return {
        ok: false,
        status: verified.reason === 'not-configured' ? 503 : 401,
        error: FAILURE_COPY[verified.reason],
      };

    const { accountId, created } = this.identities.resolve(verified.user, now);
    // A Telegram profile is the source of the name until the player picks one.
    if (created) {
      this.analytics.track('telegram_account_created', accountId, {}, now);
      // Somebody arriving from Telegram has already said who they are, so the
      // web onboarding questionnaire would be asking them again for nothing.
      this.db.sql.prepare('UPDATE accounts SET onboarded=1 WHERE id=?').run(accountId);
    }
    this.analytics.track('telegram_miniapp_opened', accountId, { created }, now);

    const intent = this.applyStartParam(accountId, verified.startParam, now);
    const token = this.auth.session(accountId);

    return {
      ok: true,
      result: {
        token,
        expiresAt: now + 14 * 86_400_000,
        intent,
        home: this.home(accountId, now),
      },
    };
  }

  /**
   * Acts on the deep link the app was opened with.
   *
   * Every branch matches a strict shape first. An unrecognised payload opens
   * the home screen and is not echoed anywhere — a deep link is untrusted input
   * that arrives inside a signed envelope, which makes it authentic, not safe.
   */
  applyStartParam(
    accountId: string,
    startParam: string | null,
    now: number,
  ): TelegramAuthResult['intent'] {
    if (!startParam) return { kind: 'home' };

    const referral = /^ref_([A-Z0-9]{7})$/.exec(startParam);
    if (referral) {
      this.analytics.track('referral_clicked', accountId, {}, now);
      const outcome = this.referrals.claim(accountId, referral[1]!, now);
      return { kind: 'referral', accepted: outcome === 'accepted' };
    }

    const duel = /^duel_([A-Za-z0-9_-]{16,32})$/.exec(startParam);
    if (duel) return { kind: 'challenge', code: duel[1]! };

    const section = /^go_(home|duel|rank|social|profile)$/.exec(startParam);
    if (section) return { kind: 'section', section: section[1] as 'home' };

    return { kind: 'home' };
  }

  /**
   * Attaches Telegram to an account proved by a one-time code.
   *
   * The awkward case is the normal one. By the time somebody sends
   * `/start link_TG-XXXXXX`, the bot has already answered them, and answering
   * required knowing who they are — so a brand new, empty player already exists
   * for this Telegram account. Refusing at that point would make the feature
   * impossible to use.
   *
   * So an empty shell is merged away: no matches, no purchases, no other way to
   * sign into it means nothing is lost by deleting it, and deleting it is the
   * only way the unique constraint on `telegram_user_id` can be satisfied. A
   * Telegram account with a real record behind it is never merged — that would
   * silently destroy a rating — and says so instead.
   */
  linkWithCode(
    telegramUserId: number,
    rawCode: string,
    now: number,
  ): { ok: true; accountId: string } | { ok: false; error: string } {
    const identity = this.identities.byTelegramId(telegramUserId);
    const accountId = this.links.redeem(rawCode, now);
    if (!accountId)
      return { ok: false, error: 'That code has expired or was already used. Generate a new one.' };
    if (identity?.accountId === accountId) return { ok: true, accountId };

    if (this.identities.byAccount(accountId))
      return {
        ok: false,
        error: 'That player already has a different Telegram account attached. Unlink it first.',
      };

    try {
      return this.db.transaction(() => {
        if (identity) {
          if (!this.isEmptyShell(identity.accountId))
            return {
              ok: false as const,
              error:
                'This Telegram account already has a player with matches on it. Sign in to that player in a browser instead of linking.',
            };
          // Deleting the profile cascades to the account and everything hanging
          // off it, including the Telegram identity row we are about to reuse.
          this.db.sql.prepare('DELETE FROM profiles WHERE id=?').run(identity.accountId);
        }
        const attached = this.identities.attach(
          {
            id: telegramUserId,
            firstName: identity?.firstName ?? 'Player',
            lastName: identity?.lastName ?? null,
            username: identity?.username ?? null,
            languageCode: identity?.languageCode ?? null,
            photoUrl: identity?.photoUrl ?? null,
            allowsWriteToPm: identity?.allowsWriteToPm ?? true,
            isPremium: identity?.isPremium ?? false,
          },
          accountId,
          now,
        );
        if (attached !== 'linked')
          return { ok: false as const, error: 'We could not link those accounts. Try again.' };
        this.analytics.track('telegram_account_linked', accountId, {}, now);
        return { ok: true as const, accountId };
      });
    } catch (error) {
      log.error('account linking failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return { ok: false, error: 'We could not link those accounts. Try again.' };
    }
  }

  /**
   * Whether an account can be deleted without losing anything a player owns.
   *
   * Deliberately strict: a single finished match, a single purchase or any
   * other way of signing in makes it somebody's account rather than a shell,
   * and the answer is no.
   */
  private isEmptyShell(accountId: string): boolean {
    const profile = this.db.get(accountId);
    if (!profile || profile.matchesPlayed > 0 || profile.xp > 0) return false;
    if (this.identities.hasWebSignIn(accountId)) return false;
    const played = this.db.sql
      .prepare('SELECT 1 FROM match_receipts WHERE a=? OR b=? LIMIT 1')
      .get(accountId, accountId);
    if (played) return false;
    const paid = this.db.sql
      .prepare('SELECT 1 FROM telegram_payments WHERE account_id=? LIMIT 1')
      .get(accountId);
    return !paid;
  }

  /**
   * Detaches Telegram from an account.
   *
   * Refused when Telegram is the only way in, because the alternative is
   * cheerfully locking somebody out of their own rating.
   */
  unlink(accountId: string): { ok: true } | { ok: false; error: string } {
    if (!this.identities.hasWebSignIn(accountId))
      return {
        ok: false,
        error:
          'Telegram is the only way into this account. Add an email sign-in in a browser first, or this would lock you out.',
      };
    this.identities.unlink(accountId);
    this.analytics.track('telegram_account_unlinked', accountId, {}, Date.now());
    return { ok: true };
  }

  // -- Screens -------------------------------------------------------------

  /** Everything the first screen draws, in one query pass. */
  home(accountId: string, now: number): TelegramHome {
    this.identities.touch(accountId, now);
    const board = this.views.leaderboard({
      accountId,
      board: 'rating',
      scope: 'global',
      offset: 0,
      limit: 5,
      now,
    });
    const startOfDay = Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
    );
    const duelsToday = Number(
      this.db.sql.prepare('SELECT count(*) AS n FROM match_receipts WHERE at>=?').get(startOfDay)!.n,
    );
    const playersToday = this.analytics.playersToday(startOfDay);

    return {
      me: this.views.me(accountId, now),
      quests: this.quests.board(accountId, now),
      recentMatches: this.views.matches(accountId, 0, 5),
      leaderboard: board.rows,
      incoming: this.duels
        .incoming(accountId, now)
        .map((duel) => this.challengeView(duel, accountId, now)),
      // Nothing invented: if nobody has played today, the strip says nothing
      // rather than inventing a number to look busy.
      pulse: duelsToday > 0 ? { duelsToday, playersToday } : null,
    };
  }

  challengeView(duel: Duel, viewerAccountId: string, now: number): TelegramChallengeView {
    const host = this.views.cardFor(duel.hostAccountId, now);
    const guest = duel.guestAccountId ? this.views.cardFor(duel.guestAccountId, now) : null;
    const link = botLink(`duel_${duel.code}`);
    const hostName = host?.name ?? 'A player';
    return {
      code: duel.code,
      link,
      shareText: `⚔️ ${hostName} is challenging you to a Duel Battle. First to find it wins.`,
      status: duel.status,
      createdAt: duel.createdAt,
      expiresAt: duel.expiresAt,
      host: host ?? placeholderCard(),
      guest,
      roomCode: duel.roomCode,
      mine: duel.hostAccountId === viewerAccountId,
    };
  }

  /**
   * Opens — or re-opens — the room a challenge is played in.
   *
   * The room is created by the server's own manager and restricted to the two
   * accounts on the challenge, so the code that comes back is useless to anyone
   * else even if it leaks.
   */
  claimDuelRoom(
    code: string,
    accountId: string,
    now: number,
  ): { ok: true; roomCode: string } | { ok: false; error: string } {
    const claimed = this.duels.claimRoom(code, accountId, now, () => {
      const room = this.rooms.create(now);
      return room.code;
    });
    if (!claimed.ok) {
      const copy = {
        unknown: 'That duel no longer exists.',
        'not-yours': 'That duel is not yours.',
        'not-ready': 'Waiting for your friend to accept.',
        over: 'That duel is already finished.',
      } as const;
      return { ok: false, error: copy[claimed.reason] };
    }
    const room = this.rooms.get(claimed.roomCode);
    if (!room) return { ok: false, error: 'That duel expired before anyone arrived. Send a new one.' };
    room.restrictTo([accountId, claimed.opponentAccountId]);
    return { ok: true, roomCode: claimed.roomCode };
  }

  // -- The settlement hook -------------------------------------------------

  /**
   * Everything one finished match is worth.
   *
   * Runs after the rating transaction has committed, so each step is allowed to
   * fail on its own without taking the result with it. The order is the order a
   * player experiences it: the day's progress, then the streak, then the thanks
   * to whoever invited them, then the message that reaches them if they have
   * already put the phone down.
   */
  onSettled(match: SettledMatch): void {
    if (!match.ranked) return;
    const now = match.at;
    const [first, second] = match.players;

    try {
      this.db.transaction(() => {
        this.social.rememberOpponents(first.accountId, second.accountId, now);
        this.duels.complete(match.roomCode, now);
      });
    } catch (error) {
      log.warn('could not record opponents', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }

    // The match itself is counted once, for every client, by the season
    // settlement; what is left here is what only Telegram can do about it.
    for (const [player, opponent] of [
      [first, second],
      [second, first],
    ] as const) {
      try {
        this.rewardPlayer(match, player, opponent, now);
      } catch (error) {
        log.error('post-match rewards failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
  }

  private rewardPlayer(
    match: SettledMatch,
    player: SettledMatch['players'][number],
    opponent: SettledMatch['players'][number],
    now: number,
  ): void {
    if (!this.identities.byAccount(player.accountId)) return;

    // Quests were moved once, for every client, by the season settlement; this
    // only reads what it did. Recording them here as well would count twice.
    const completed = (player.meta?.questsCompleted ?? []).map((title) => ({ title }));
    const streak = this.db.transaction(() => this.streaks.record(player.accountId, now));
    const reward = this.db.transaction(() => this.referrals.activate(player.accountId, now));

    // The result itself.
    const verb = player.result === 'win' ? 'Victory' : player.result === 'loss' ? 'Defeat' : 'Draw';
    const sign = player.ratingChange >= 0 ? '+' : '';
    const rank = rankFor(player.ratingAfter);
    const lines = [
      `${player.result === 'win' ? '🏆' : player.result === 'loss' ? '💥' : '🤝'} <b>${verb}</b>`,
      `${escapeHtml(player.name || 'You')} ${player.score}–${opponent.score} ${escapeHtml(opponent.name || 'Opponent')}`,
      '',
      match.ranked ? `Rating ${sign}${player.ratingChange} → <b>${player.ratingAfter}</b> · ${escapeHtml(rank.label)}` : 'Casual duel · no rating change',
    ];
    if (player.rewards.xp > 0) lines.push(`XP +${player.rewards.xp}`);
    if (player.rewards.coins) lines.push(`Battle coins +${player.rewards.coins}`);
    if (player.streak >= 2 && player.result === 'win') lines.push(`🔥 ${player.streak} wins in a row`);
    if (player.rewards.rankMove === 'promoted') lines.push(`🏅 Promoted to ${escapeHtml(rank.label)}`);
    if (player.rewards.rankMove === 'demoted') lines.push(`Dropped to ${escapeHtml(rank.label)}`);
    if (completed.length > 0)
      lines.push(`🎯 Quest complete: ${escapeHtml(completed.map((q) => q.title).join(', '))}`);
    if (streak.extended && streak.streak.current >= 2)
      lines.push(`📅 Day ${streak.streak.current} in a row`);

    this.notifications.notify(
      {
        accountId: player.accountId,
        kind: 'match-result',
        dedupeKey: `match:${match.matchId}:${player.accountId}`,
        message: { text: lines.join('\n'), buttons: playButton() },
      },
      now,
    );

    for (const id of player.rewards.unlocked) {
      // The catalogue is shared with the client, so an award is called the same
      // thing in a chat message as it is on the awards screen. A slug is not a
      // name, and an id that is not in the catalogue is not worth announcing.
      const award = ACHIEVEMENTS.find((achievement) => achievement.id === id);
      if (!award) continue;
      this.notifications.notify(
        {
          accountId: player.accountId,
          kind: 'achievement',
          dedupeKey: `achievement:${player.accountId}:${id}`,
          message: {
            text: [
              '🏅 <b>Achievement unlocked</b>',
              '',
              `<b>${escapeHtml(award.name)}</b>`,
              escapeHtml(award.description),
              '',
              `+${award.xp} XP`,
            ].join('\n'),
            buttons: playButton('🎖 See your awards'),
          },
        },
        now,
      );
      this.analytics.track('achievement_unlocked', player.accountId, { id }, now);
    }

    if (reward) {
      this.analytics.track('referral_activated', reward.inviterAccountId, {}, now);
      this.notifications.notify(
        {
          accountId: reward.inviterAccountId,
          kind: 'referral-reward',
          dedupeKey: `referral:${player.accountId}`,
          message: {
            text: `🎁 <b>${escapeHtml(player.name || 'Your friend')} just played their first duel.</b>\nYou earned ${reward.inviterCoins} Battle coins for the invite.`,
            buttons: playButton('🎁 Invite another'),
          },
        },
        now,
      );
    }
  }

  // -- Lifecycle -----------------------------------------------------------

  /**
   * Tells Telegram what this bot is.
   *
   * Commands, descriptions, the menu button and the webhook are all
   * declarative and idempotent, so this simply runs at boot and again on every
   * deploy rather than being a checklist somebody has to remember.
   */
  async register(): Promise<void> {
    if (!telegramConfig.enabled) return;
    // A test suite has no business telling the real bot what its commands are,
    // and every call here would spend its timeout failing to reach Telegram.
    if (process.env.NODE_ENV === 'test') return;
    const app = this.miniAppUrl();
    await this.api.setMyCommands(BOT_COMMANDS);
    await this.api.setMyCommands(BOT_COMMANDS_RU, 'ru');
    await this.api.setMyDescription(BOT_DESCRIPTION);
    await this.api.setMyDescription(BOT_DESCRIPTION_RU, 'ru');
    await this.api.setMyShortDescription(BOT_SHORT_DESCRIPTION);
    await this.api.setMyShortDescription(BOT_SHORT_DESCRIPTION_RU, 'ru');
    if (app) await this.api.setChatMenuButton({ text: BOT_MENU_BUTTON_TEXT, url: app });

    if (telegramConfig.webhookSecret && telegramConfig.miniAppUrl) {
      const result = await this.api.setWebhook({
        url: `${telegramConfig.miniAppUrl}/api/telegram/webhook`,
        secretToken: telegramConfig.webhookSecret,
        allowedUpdates: ['message', 'callback_query', 'pre_checkout_query', 'my_chat_member'],
      });
      log.info('telegram webhook registered', { ok: result.ok });
    } else {
      log.warn('telegram webhook not registered', {
        reason: telegramConfig.webhookSecret ? 'no TELEGRAM_MINI_APP_URL' : 'no TELEGRAM_WEBHOOK_SECRET',
      });
    }
  }

  /** The Mini App entry point Telegram should open. */
  miniAppUrl(path = '/tg'): string {
    return telegramConfig.miniAppUrl ? `${telegramConfig.miniAppUrl}${path}` : '';
  }

  /**
   * The background beat: deliver what is due, tidy what is spent.
   *
   * One interval rather than two, because both are cheap and neither is urgent,
   * and a single-process deployment does not need two more timers.
   */
  async tick(now: number): Promise<void> {
    try {
      await this.notifications.drain(now);
    } catch (error) {
      log.error('notification drain failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
    if (now - this.lastSweep < 60 * 60_000) return;
    this.lastSweep = now;
    try {
      this.db.transaction(() => sweepTelegram(this.db.sql, now));
    } catch (error) {
      log.warn('telegram sweep failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
    try {
      const queued = this.recap.run(now);
      if (queued > 0) log.info('weekly recaps queued', { queued });
    } catch (error) {
      log.warn('weekly recap failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}

function placeholderCard(): TelegramPlayerCard {
  return {
    ref: '',
    name: 'A player',
    avatar: { shape: 0, color: 0 },
    loadout: {},
    rating: 0,
    rank: '',
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    level: 1,
    premium: false,
  };
}

/**
 * Bot messages are HTML, and a player name is the one part of them somebody
 * else chose. Escaped at every interpolation, without exception.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
