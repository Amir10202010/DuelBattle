import { isPlaced, levelFor, rankFor, totals, type TelegramMe } from '@battle/shared';
import { log } from '../log.js';
import type { InlineKeyboardButton } from './api.js';
import { botLink, botStartLink, isAdmin, telegramConfig } from './config.js';
import type { TelegramLaunchUser } from './initData.js';
import { AdminConsole } from './admin.js';
import { escapeHtml, type TelegramService } from './service.js';
import { PREMIUM_PRODUCT } from './payments.js';

/**
 * The bot, as a product rather than a command table.
 *
 * Two things shape every reply. It is written the way the game is written —
 * short, second person, no "operation completed successfully" — and it is built
 * from the same three parts every time: a title line, the thing you asked for,
 * and the buttons that say what to do next. A bot whose messages each invent
 * their own layout reads like four people wrote it, because usually four people
 * did.
 *
 * Every command answers with **real data**. There is no reply in this file that
 * makes something up, and no button that opens a screen that does not exist.
 */

// The bot's public identity lives beside the registration that applies it.
export {
  BOT_COMMANDS,
  BOT_COMMANDS_RU,
  BOT_DESCRIPTION,
  BOT_SHORT_DESCRIPTION,
} from './profile.js';

/** Telegram's own shapes, narrowed to the parts this bot reads. */
export interface TelegramChatUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TelegramChatUser;
    chat: { id: number; type: string };
    text?: string;
    successful_payment?: {
      telegram_payment_charge_id: string;
      invoice_payload: string;
      total_amount: number;
      currency: string;
    };
  };
  callback_query?: {
    id: string;
    from: TelegramChatUser;
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
  pre_checkout_query?: {
    id: string;
    from: TelegramChatUser;
    invoice_payload: string;
    total_amount: number;
    currency: string;
  };
  my_chat_member?: {
    from: TelegramChatUser;
    new_chat_member?: { status: string };
  };
}

/** A chat user, in the shape the identity layer already understands. */
function launchUserFrom(user: TelegramChatUser, allowsWriteToPm: boolean): TelegramLaunchUser {
  return {
    id: user.id,
    firstName: (user.first_name ?? 'Player').slice(0, 64),
    lastName: user.last_name ? user.last_name.slice(0, 64) : null,
    username: user.username ? user.username.slice(0, 32) : null,
    languageCode: user.language_code ? user.language_code.slice(0, 16).toLowerCase() : null,
    photoUrl: null,
    allowsWriteToPm,
    isPremium: user.is_premium === true,
  };
}

function bar(progress: number, width = 10): string {
  const filled = Math.max(0, Math.min(width, Math.round(progress * width)));
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}

export class TelegramBot {
  private readonly admin: AdminConsole;

  constructor(private readonly service: TelegramService) {
    this.admin = new AdminConsole(service);
  }

  /**
   * One update.
   *
   * Never throws: an update that fails must not cause Telegram to retry it
   * forever, and the idempotency row has already been written by the caller.
   */
  async handle(update: TelegramUpdate, now: number): Promise<void> {
    try {
      if (update.pre_checkout_query) return await this.onPreCheckout(update, now);
      if (update.callback_query) return await this.onCallback(update, now);
      if (update.my_chat_member) return this.onChatMember(update, now);
      if (update.message) return await this.onMessage(update, now);
    } catch (error) {
      log.error('telegram update handler threw', {
        updateId: update.update_id,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      // A failed payment transaction must be retried by Telegram. Ordinary
      // chat commands remain best-effort; charges are idempotent in the DB.
      if (update.message?.successful_payment) throw error;
    }
  }

  // -- Messages ------------------------------------------------------------

  private async onMessage(update: TelegramUpdate, now: number): Promise<void> {
    const message = update.message!;
    const from = message.from;
    if (!from || from.id <= 0) return;
    // Group chats are not where this game lives, and a bot that answers in one
    // is a bot somebody removes.
    if (message.chat.type !== 'private') return;

    if (message.successful_payment) return await this.onPayment(update, now);

    const accountId = this.accountFor(from, now);
    const text = (message.text ?? '').trim();
    const [rawCommand = '', ...rest] = text.split(/\s+/);
    const command = rawCommand.toLowerCase().replace(/@[\w_]+$/, '');
    const argument = rest.join(' ');

    switch (command) {
      case '/start':
        return await this.onStart(from, accountId, argument, now);
      case '/play':
        return await this.reply(from.id, this.playCard(accountId, now));
      case '/profile':
      case '/stats':
        return await this.reply(from.id, this.profileCard(accountId, now, command === '/stats'));
      case '/leaderboard':
        return await this.reply(from.id, this.leaderboardCard(accountId, now));
      case '/matches':
        return await this.reply(from.id, this.matchesCard(accountId, now));
      case '/invite':
        return await this.reply(from.id, this.inviteCard(accountId, now));
      case '/achievements':
        return await this.reply(from.id, this.achievementsCard(accountId, now));
      case '/challenges':
        return await this.reply(from.id, this.questsCard(accountId, now));
      case '/premium':
        return await this.reply(from.id, this.premiumCard(accountId, now));
      case '/settings':
        return await this.reply(from.id, this.settingsCard(accountId, now));
      case '/help':
        return await this.reply(from.id, this.helpCard());
      case '/support':
        return await this.reply(from.id, this.supportCard());
      case '/paysupport':
        return await this.reply(from.id, this.paySupportCard(accountId));
      case '/admin':
        return await this.reply(
          from.id,
          isAdmin(from.id) ? this.admin.overview(now) : this.unknownCard(),
        );
      case '/refund':
        return await this.reply(
          from.id,
          isAdmin(from.id) ? await this.admin.refund(from.id, argument, now) : this.unknownCard(),
        );
      default:
        // A linking code pasted into the chat is the one non-command worth
        // understanding: people paste rather than tap more often than we like.
        if (/^TG-?[A-Z0-9]{6}$/i.test(text)) return await this.onLink(from, text, now);
        return await this.reply(from.id, this.unknownCard());
    }
  }

  private async onStart(
    from: TelegramChatUser,
    accountId: string,
    argument: string,
    now: number,
  ): Promise<void> {
    this.service.analytics.track('telegram_bot_started', accountId, {}, now);

    const link = /^link_(TG-?[A-Z0-9]{6})$/i.exec(argument);
    if (link) return await this.onLink(from, link[1]!, now);

    const referral = /^ref_([A-Z0-9]{7})$/i.exec(argument);
    if (referral) this.service.applyStartParam(accountId, `ref_${referral[1]!.toUpperCase()}`, now);

    const me = this.service.views.me(accountId, now);
    const first = me.matchesPlayed === 0;
    const text = first
      ? [
          '⚔️ <b>DUEL BATTLE</b>',
          '',
          `Welcome, ${escapeHtml(me.name)}. Your player is ready.`,
          '',
          '⚔️  Real-time 1v1 duels, camera against camera',
          '🏆  A rating that means something after five matches',
          '🔥  Streaks, quests and a ladder to climb',
          '',
          'Both players get the same challenge. Find it in the room around you and show it first.',
        ].join('\n')
      : [
          '⚔️ <b>DUEL BATTLE</b>',
          '',
          `Welcome back, ${escapeHtml(me.name)}.`,
          `${escapeHtml(me.rank.label)} · ${me.rating} rating · ${me.wins}W ${me.losses}L`,
          me.streak >= 2 ? `🔥 ${me.streak} wins in a row — keep it.` : '',
        ]
          .filter(Boolean)
          .join('\n');

    await this.reply(from.id, {
      text,
      buttons: this.mainKeyboard(first),
    });
  }

  private async onLink(from: TelegramChatUser, code: string, now: number): Promise<void> {
    // Make sure this Telegram user has a player before trying to attach one.
    this.accountFor(from, now);
    const result = this.service.linkWithCode(from.id, code, now);
    if (!result.ok) {
      await this.reply(from.id, { text: `🔗 <b>Account linking</b>\n\n${escapeHtml(result.error)}` });
      return;
    }
    await this.reply(from.id, {
      text: '🔗 <b>Account linked</b>\n\nThis Telegram account now opens your existing Duel Battle player. Your rating, coins and awards came with it.',
      buttons: this.mainKeyboard(false),
    });
  }

  private async onPayment(update: TelegramUpdate, now: number): Promise<void> {
    const message = update.message!;
    const payment = message.successful_payment!;
    const grant = this.service.payments.settle({
      chargeId: payment.telegram_payment_charge_id,
      payload: payment.invoice_payload,
      stars: payment.total_amount,
      currency: payment.currency,
      now,
    });
    if (!grant) {
      await this.reply(message.chat.id, {
        text: '💎 <b>Payment received</b>\n\nWe could not match this payment to an account automatically. Send /paysupport and we will sort it out.',
      });
      return;
    }
    if (grant.product !== PREMIUM_PRODUCT) {
      // A store offer: the shop has already recorded and delivered it.
      const summary = totals(grant.granted);
      const parts = [
        summary.gems ? `💎 ${summary.gems} gems` : '',
        summary.coins ? `🪙 ${summary.coins} coins` : '',
        summary.items.length ? `🎁 ${summary.items.length} new item${summary.items.length === 1 ? '' : 's'}` : '',
      ].filter(Boolean);
      await this.reply(message.chat.id, {
        text: grant.fresh
          ? `🛍 <b>Thank you.</b>\n\n${parts.join('\n') || 'Your purchase is in your account.'}`
          : '🛍 This purchase is already in your account.',
        buttons: this.mainKeyboard(false),
      });
      return;
    }
    if (grant.fresh) {
      this.service.analytics.track('premium_purchased', grant.accountId, { stars: grant.stars }, now);
      this.service.notifications.notify(
        {
          accountId: grant.accountId,
          kind: 'premium-activated',
          dedupeKey: `premium:${payment.telegram_payment_charge_id}`,
          message: {
            text: [
              '💎 <b>Premium is active</b>',
              '',
              grant.until
                ? `Until ${new Date(grant.until).toISOString().slice(0, 10)}.`
                : 'For good.',
              '',
              'Your badge is live, the premium track of the season pass is open, and the Patron title and banner are in your locker.',
            ].join('\n'),
          },
        },
        now,
      );
    }
    await this.reply(message.chat.id, {
      text: grant.fresh
        ? '💎 <b>Thank you.</b>\n\nPremium is active on your account.'
        : '💎 Premium is already active on your account.',
      buttons: this.mainKeyboard(false),
    });
  }

  // -- Callbacks -----------------------------------------------------------

  private async onCallback(update: TelegramUpdate, now: number): Promise<void> {
    const query = update.callback_query!;
    const data = (query.data ?? '').slice(0, 64);
    const accountId = this.accountFor(query.from, now);

    // Telegram shows a spinner until this is answered, whatever happens next.
    await this.service.api.answerCallbackQuery({ id: query.id });

    if (data.startsWith('admin:')) {
      if (!isAdmin(query.from.id)) return;
      const card = await this.admin.callback(data.slice(6), query.from.id, now);
      if (card) await this.reply(query.from.id, card);
      return;
    }

    const card =
      data === 'profile'
        ? this.profileCard(accountId, now, false)
        : data === 'stats'
          ? this.profileCard(accountId, now, true)
          : data === 'leaderboard'
            ? this.leaderboardCard(accountId, now)
            : data === 'matches'
              ? this.matchesCard(accountId, now)
              : data === 'invite'
                ? this.inviteCard(accountId, now)
                : data === 'quests'
                  ? this.questsCard(accountId, now)
                  : data === 'premium'
                    ? this.premiumCard(accountId, now)
                    : data === 'settings'
                      ? this.settingsCard(accountId, now)
                      : data === 'help'
                        ? this.helpCard()
                        : null;
    if (!card) return;

    // Editing in place rather than sending again: a chat that grows a new card
    // every time somebody taps a button is a chat people leave.
    if (query.message) {
      const edited = await this.service.api.editMessageText({
        chatId: query.message.chat.id,
        messageId: query.message.message_id,
        text: card.text,
        ...(card.buttons ? { buttons: card.buttons } : {}),
      });
      if (edited.ok) return;
    }
    await this.reply(query.from.id, card);
  }

  private async onPreCheckout(update: TelegramUpdate, now: number): Promise<void> {
    const query = update.pre_checkout_query!;
    const verdict = this.service.payments.approvePreCheckout(query.invoice_payload, now, { amount: query.total_amount, currency: query.currency });
    await this.service.api.answerPreCheckoutQuery({
      id: query.id,
      ok: verdict.ok,
      ...(verdict.message ? { errorMessage: verdict.message } : {}),
    });
  }

  /** Somebody blocked or unblocked the bot. Telegram says so; believe it. */
  private onChatMember(update: TelegramUpdate, now: number): void {
    const status = update.my_chat_member?.new_chat_member?.status;
    const from = update.my_chat_member?.from;
    if (!from || !status) return;
    const identity = this.service.identities.byTelegramId(from.id);
    if (!identity) return;
    const allowed = status !== 'kicked' && status !== 'left';
    this.service.identities.refresh(
      launchUserFrom(from, allowed),
      identity.accountId,
      now,
    );
  }

  // -- Cards ---------------------------------------------------------------

  private mainKeyboard(first: boolean): InlineKeyboardButton[][] {
    const app = this.service.miniAppUrl();
    const play: InlineKeyboardButton = app
      ? { text: first ? '⚔️ Play your first duel' : '⚔️ Play now', web_app: { url: app } }
      : { text: '⚔️ Play now', url: botLink() };
    return [
      [play],
      [
        { text: '👤 Profile', callback_data: 'profile' },
        { text: '🏆 Ladder', callback_data: 'leaderboard' },
      ],
      [
        { text: '🎯 Quests', callback_data: 'quests' },
        { text: '🎁 Invite', callback_data: 'invite' },
      ],
    ];
  }

  private appButton(label: string, path = '/tg'): InlineKeyboardButton[][] {
    const app = this.service.miniAppUrl(path);
    return app ? [[{ text: label, web_app: { url: app } }]] : [];
  }

  private playCard(accountId: string, now: number): Card {
    const me = this.service.views.me(accountId, now);
    return {
      text: [
        '⚔️ <b>READY TO DUEL</b>',
        '',
        `${escapeHtml(me.rank.label)} · ${me.rating} rating`,
        me.placed
          ? `${me.wins}W ${me.losses}L · ${winRate(me)}% win rate`
          : `${5 - me.matchesPlayed} placement ${5 - me.matchesPlayed === 1 ? 'match' : 'matches'} to go`,
        '',
        'Matchmaking pairs you with somebody near your rating. You will need your camera.',
      ].join('\n'),
      buttons: [
        ...this.appButton('⚔️ Find an opponent', '/tg/duel'),
        [{ text: '👥 Challenge a friend', callback_data: 'invite' }],
      ],
    };
  }

  private profileCard(accountId: string, now: number, detailed: boolean): Card {
    const me = this.service.views.me(accountId, now);
    const level = levelFor(me.xp);
    const lines = [
      `👤 <b>${escapeHtml(me.name)}</b>`,
      `${escapeHtml(me.rank.label)}${me.placed ? '' : ' · placement'}`,
      '',
      `⚡ Rating <b>${me.rating}</b>${me.peakRating > me.rating ? ` (peak ${me.peakRating})` : ''}`,
      `🏆 ${me.wins}W · ${me.losses}L${me.draws ? ` · ${me.draws}D` : ''}`,
      `🎯 Win rate ${me.matchesPlayed ? `${winRate(me)}%` : '—'}`,
      `🔥 Streak ${me.streak}${me.bestStreak > me.streak ? ` (best ${me.bestStreak})` : ''}`,
      `🎖 Level ${level.level}  ${bar(level.progress)}`,
    ];
    if (me.position) lines.push(`📈 Ladder position #${me.position}`);
    if (detailed) {
      lines.push(
        '',
        `📅 Daily streak ${me.dailyStreak.current} (best ${me.dailyStreak.best})`,
        `🪙 ${me.coins} Battle coins`,
        `🏅 ${me.achievements.length} awards`,
        `🎁 ${me.referrals.activated} of ${me.referrals.joined} invites played`,
        me.premium.active ? '💎 Premium active' : '',
      );
    }
    if (me.rank.pointsToNext !== null)
      lines.push('', `${me.rank.pointsToNext} rating to the next rung.`);

    return {
      text: lines.filter(Boolean).join('\n'),
      buttons: [
        ...this.appButton('👤 Open your profile', '/tg/profile'),
        [
          { text: '📊 Matches', callback_data: 'matches' },
          { text: '🏅 Awards', callback_data: 'achievements' },
        ],
      ],
    };
  }

  private leaderboardCard(accountId: string, now: number): Card {
    const board = this.service.views.leaderboard({
      accountId,
      board: 'rating',
      scope: 'global',
      offset: 0,
      limit: 10,
      now,
    });
    if (board.rows.length === 0)
      return {
        text: '🏆 <b>THE LADDER</b>\n\nNobody has finished placement yet. Five ranked matches puts you on the board — and right now that means first place is open.',
        buttons: this.appButton('⚔️ Play a ranked duel', '/tg/duel'),
      };

    const medal = ['🥇', '🥈', '🥉'];
    const lines = board.rows.map(
      (row, index) =>
        `${medal[index] ?? `<code>${String(row.position).padStart(2, ' ')}</code>`} ${
          row.you ? '<b>' : ''
        }${escapeHtml(row.name)}${row.you ? '</b>' : ''} — ${row.rating}`,
    );
    if (board.you && !board.rows.some((row) => row.you))
      lines.push('', `<code>${board.you.position}</code> <b>You</b> — ${board.you.rating}`);
    else if (!board.you)
      lines.push('', 'You are not on the board yet — five ranked matches puts you there.');

    return {
      text: ['🏆 <b>THE LADDER</b>', `${board.total} placed players`, '', ...lines].join('\n'),
      buttons: this.appButton('🏆 Open the full ladder', '/tg/rank'),
    };
  }

  private matchesCard(accountId: string, _now: number): Card {
    const matches = this.service.views.matches(accountId, 0, 5);
    if (matches.length === 0)
      return {
        text: '📊 <b>MATCHES</b>\n\nYou have not finished a ranked duel yet. The first one is the one that starts your rating.',
        buttons: this.appButton('⚔️ Play your first duel', '/tg/duel'),
      };
    const lines = matches.map((match) => {
      const icon = match.result === 'win' ? '🏆' : match.result === 'loss' ? '💥' : '🤝';
      const change = match.ratingAfter - match.ratingBefore;
      return `${icon} ${match.yourScore}–${match.theirScore} vs ${escapeHtml(match.opponentName || 'Player')} · ${change >= 0 ? '+' : ''}${change}`;
    });
    return {
      text: ['📊 <b>RECENT MATCHES</b>', '', ...lines].join('\n'),
      buttons: this.appButton('📊 Full history', '/tg/profile'),
    };
  }

  private inviteCard(accountId: string, now: number): Card {
    const me = this.service.views.me(accountId, now);
    const link = botLink(`ref_${me.referralCode}`) || botStartLink(`ref_${me.referralCode}`);
    return {
      text: [
        '🎁 <b>INVITE A FRIEND</b>',
        '',
        'Challenge somebody you know to a real-time duel. When they finish their first match you both get Battle coins.',
        '',
        `Your link:\n${link || 'Configure the bot username to share a link.'}`,
        '',
        `Invited: ${me.referrals.joined} · played: ${me.referrals.activated}`,
      ].join('\n'),
      buttons: [
        ...(link
          ? [
              [
                {
                  text: '📤 Share your link',
                  url: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('⚔️ Duel me on Duel Battle — first to find it wins.')}`,
                },
              ],
            ]
          : []),
        ...this.appButton('👥 Challenge a friend', '/tg/social'),
      ],
    };
  }

  private achievementsCard(accountId: string, _now: number): Card {
    const all = this.service.views.achievements(accountId);
    const unlocked = all.filter((achievement) => achievement.unlocked);
    const next = all
      .filter((achievement) => !achievement.unlocked && achievement.progress)
      .sort(
        (a, b) =>
          b.progress!.have / b.progress!.need - a.progress!.have / a.progress!.need,
      )
      .slice(0, 3);

    return {
      text: [
        '🏅 <b>AWARDS</b>',
        `${unlocked.length} of ${all.length} earned`,
        '',
        ...(unlocked.length
          ? unlocked.slice(-4).map((a) => `✅ <b>${escapeHtml(a.name)}</b> — ${escapeHtml(a.description)}`)
          : ['Nothing yet. Your first finished duel earns one.']),
        ...(next.length ? ['', '<b>Closest</b>'] : []),
        ...next.map(
          (a) => `▫️ ${escapeHtml(a.name)} — ${a.progress!.have}/${a.progress!.need}`,
        ),
      ].join('\n'),
      buttons: this.appButton('🏅 Open awards', '/tg/profile'),
    };
  }

  private questsCard(accountId: string, now: number): Card {
    const board = this.service.quests.board(accountId, now);
    const hours = Math.max(1, Math.round((board.resetsAt - now) / 3_600_000));
    return {
      text: [
        "🎯 <b>TODAY'S QUESTS</b>",
        `New set in ${hours}h`,
        '',
        ...board.quests.map(
          (quest) =>
            `${quest.claimed ? '✅' : quest.done ? '🎁' : '▫️'} <b>${escapeHtml(quest.title)}</b> — ${escapeHtml(quest.description)}\n     ${quest.progress}/${quest.target} · ${quest.reward} coins${quest.done && !quest.claimed ? ' · ready to claim' : ''}`,
        ),
      ].join('\n'),
      buttons: this.appButton('🎯 Open quests', '/tg/duel'),
    };
  }

  private premiumCard(accountId: string, now: number): Card {
    const premium = this.service.entitlements.premium(accountId, now);
    this.service.analytics.track('premium_viewed', accountId, {}, now);
    if (premium.active)
      return {
        text: [
          '💎 <b>PREMIUM</b>',
          '',
          premium.until
            ? `Active until ${new Date(premium.until).toISOString().slice(0, 10)}.`
            : 'Active, with no end date.',
          '',
          'Thank you — it pays for the servers this runs on.',
        ].join('\n'),
        buttons: [[{ text: '💬 Payment help', callback_data: 'paysupport' }]],
      };
    if (!this.service.payments.available)
      return {
        text: '💎 <b>PREMIUM</b>\n\nPremium is not on sale on this server yet.',
        buttons: this.appButton('⚔️ Play', '/tg/duel'),
      };
    return {
      text: [
        '💎 <b>DUEL BATTLE PREMIUM</b>',
        '',
        '🏆  A premium badge on your card and on the ladder',
        '🎟  The premium track of the current season pass, while Premium lasts',
        '🎖  The Patron title and banner, yours to keep',
        '',
        `${telegramConfig.premiumStars} ⭐ Telegram Stars${telegramConfig.premiumDays ? ` · ${telegramConfig.premiumDays} days` : ''}`,
      ].join('\n'),
      buttons: this.appButton('💎 Get Premium', '/tg/premium'),
    };
  }

  private settingsCard(accountId: string, _now: number): Card {
    const prefs = this.service.notifications.preferences(accountId);
    const on = (value: boolean) => (value ? 'on' : 'off');
    return {
      text: [
        '⚙️ <b>SETTINGS</b>',
        '',
        `Match results: ${on(prefs.matches)}`,
        `Challenges: ${on(prefs.challenges)}`,
        `Awards and ranks: ${on(prefs.achievements)}`,
        `Friends and invites: ${on(prefs.social)}`,
        `Weekly recap: ${on(prefs.digest)}`,
        prefs.quietFrom !== null && prefs.quietTo !== null
          ? `Quiet hours: ${String(prefs.quietFrom).padStart(2, '0')}:00–${String(prefs.quietTo).padStart(2, '0')}:00`
          : 'Quiet hours: off',
        '',
        'Everything above is changed in the app, where you can also see what each one sends.',
      ].join('\n'),
      buttons: this.appButton('⚙️ Open settings', '/tg/settings'),
    };
  }

  private helpCard(): Card {
    return {
      text: [
        '❓ <b>HOW IT WORKS</b>',
        '',
        '1. Two players get the same challenge at the same time.',
        '2. Find it in the room around you and show it to your camera.',
        '3. The better answer takes the round; if both are good, the faster one wins it.',
        '4. First to three rounds takes the match.',
        '',
        'Ranked matches move your rating and pay XP and coins. Friend duels are for the argument, not the ladder.',
        '',
        'You need a camera and a browser that can use it. No microphone is used, ever.',
      ].join('\n'),
      buttons: [
        ...this.appButton('⚔️ Play'),
        [{ text: '💬 Support', callback_data: 'support' }],
      ],
    };
  }

  private supportCard(): Card {
    return {
      text: [
        '💬 <b>SUPPORT</b>',
        '',
        '<b>Account</b> — if you also play in a browser, link the two in Settings so your rating follows you.',
        '<b>Payments</b> — send /paysupport with the date of the purchase.',
        '<b>Camera</b> — Telegram asks once; if you said no, reopen the app and allow it, or open the game in your browser.',
        '<b>A player</b> — report them from their profile card. We read every report.',
        '',
        telegramConfig.supportChatId
          ? 'Anything else: reply here and a person will read it.'
          : 'Anything else: reply here.',
      ].join('\n'),
      buttons: this.appButton('⚙️ Settings', '/tg/settings'),
    };
  }

  private paySupportCard(accountId: string): Card {
    const payments = this.service.payments.history(accountId);
    return {
      text: [
        '💳 <b>PAYMENT HELP</b>',
        '',
        payments.length
          ? [
              'Your purchases:',
              ...payments.map(
                (payment) =>
                  `• ${new Date(payment.createdAt).toISOString().slice(0, 10)} — ${payment.stars} ⭐ (${payment.status})`,
              ),
            ].join('\n')
          : 'We have no Stars purchases on this account.',
        '',
        'Premium is granted the moment Telegram confirms the payment. If it did not appear, reopen the app once — it is granted server-side and will be there.',
        '',
        'Still wrong? Reply here with the date and we will look it up and refund if it is our fault.',
      ].join('\n'),
    };
  }

  private unknownCard(): Card {
    return {
      text: '⚔️ I only speak in commands. <b>/help</b> explains the game, and the button below opens it.',
      buttons: this.mainKeyboard(false),
    };
  }

  // -- Plumbing ------------------------------------------------------------

  /**
   * The account behind a chat message.
   *
   * A webhook update is authenticated by the secret token, so `from.id` is
   * Telegram speaking, not a claim by a client. That is enough to create a
   * player — which matters, because somebody can find the bot and press start
   * before they ever open the Mini App.
   */
  private accountFor(user: TelegramChatUser, now: number): string {
    return this.service.identities.resolve(launchUserFrom(user, true), now).accountId;
  }

  private async reply(chatId: number, card: Card): Promise<void> {
    await this.service.api.sendMessage({
      chatId,
      text: card.text,
      ...(card.buttons && card.buttons.length ? { buttons: card.buttons } : {}),
    });
  }
}

export interface Card {
  text: string;
  buttons?: InlineKeyboardButton[][];
}

function winRate(me: TelegramMe): number {
  return me.matchesPlayed ? Math.round((me.wins / me.matchesPlayed) * 100) : 0;
}

/** Re-exported so the service can build the same rank line the bot does. */
export { rankFor, isPlaced };
