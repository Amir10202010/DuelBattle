import type { Card } from './bot.js';
import { escapeHtml, type TelegramService } from './service.js';

/**
 * The operator's view, inside Telegram.
 *
 * Authorisation is a numeric allow-list from the environment and nothing else.
 * Not a username — those can be given up and claimed by somebody else. Not a
 * database flag — a flag is one SQL injection or one careless admin panel away
 * from being set by the wrong person. An id in an environment variable can only
 * be changed by whoever can deploy, which is the same set of people who could
 * change this code.
 *
 * Every action is written to `admin_audit` before it takes effect, not after:
 * a trail that only records successes hides exactly the events worth
 * investigating. The one action that touches money — a refund — is a typed
 * command with two arguments rather than a button, so it cannot be reached by
 * a mistap, and Telegram has to agree before anything local changes.
 */

export class AdminConsole {
  constructor(private readonly service: TelegramService) {}

  overview(now: number): Card {
    const totals = this.service.analytics.totals(now);
    return {
      text: [
        '🛠 <b>ADMIN</b>',
        '',
        `<b>Players</b>  ${totals.telegramPlayers} on Telegram · ${totals.newToday} new today`,
        `<b>Active</b>   DAU ${totals.dau} · WAU ${totals.wau} · MAU ${totals.mau}`,
        `<b>Today</b>    ${totals.duelsToday} ranked duels · ${totals.playersToday} players`,
        `<b>Invites</b>  ${totals.referralsJoined} joined · ${totals.referralsActivated} played`,
        `<b>Premium</b>  ${totals.premiumHolders} holders`,
        `<b>Queue</b>    ${this.service.notifications.pending()} notifications waiting`,
        `<b>Reports</b>  ${totals.openReports} open`,
      ].join('\n'),
      buttons: [
        [
          { text: '🚩 Reports', callback_data: 'admin:reports' },
          { text: '📈 Funnel', callback_data: 'admin:funnel' },
        ],
        [{ text: '🔄 Refresh', callback_data: 'admin:overview' }],
      ],
    };
  }

  /**
   * One admin action.
   *
   * The callback payload is matched against a closed list, so there is no path
   * from a crafted `callback_data` to anything this class did not intend to
   * offer.
   */
  async callback(action: string, adminTelegramId: number, now: number): Promise<Card | null> {
    if (action === 'overview') return this.overview(now);
    if (action === 'reports') return this.reports(adminTelegramId, now);
    if (action === 'funnel') return this.funnel(now);

    const dismiss = /^dismiss:([a-f0-9]{24})$/.exec(action);
    if (dismiss) {
      this.audit(adminTelegramId, 'report.dismiss', dismiss[1]!, {}, now);
      this.service.social.resolveReport(dismiss[1]!, 'dismissed');
      return this.reports(adminTelegramId, now);
    }
    const reviewed = /^reviewed:([a-f0-9]{24})$/.exec(action);
    if (reviewed) {
      this.audit(adminTelegramId, 'report.reviewed', reviewed[1]!, {}, now);
      this.service.social.resolveReport(reviewed[1]!, 'reviewed');
      return this.reports(adminTelegramId, now);
    }
    return null;
  }

  /**
   * A refund, run by hand.
   *
   * Telegram is asked first and the entitlement is only revoked if it agrees —
   * a player left without their Stars *and* without Premium is the worst of
   * both outcomes. Typed as a command rather than offered as a button, because
   * a refund should take a deliberate act and a charge id somebody looked up.
   */
  async refund(adminTelegramId: number, argument: string, now: number): Promise<Card> {
    const parts = argument.trim().split(/\s+/);
    const chargeId = parts[0] ?? '';
    const telegramUserId = Number(parts[1] ?? 0);
    if (!chargeId || !/^\d{1,19}$/.test(parts[1] ?? ''))
      return {
        text: [
          '💳 <b>REFUND</b>',
          '',
          'Usage: <code>/refund &lt;charge_id&gt; &lt;telegram_user_id&gt;</code>',
          '',
          'The charge id is shown to the player by /paysupport, and in the',
          '<code>telegram_payments</code> table.',
        ].join('\n'),
      };

    this.audit(adminTelegramId, 'payment.refund', chargeId, { telegramUserId }, now);
    const result = await this.service.payments.refund({
      chargeId,
      telegramUserId,
      now,
      ...(this.service.meta ? { revokeOffer: this.service.meta.starOffers().revoke } : {}),
    });
    return {
      text: result.ok
        ? `💳 Refunded <code>${escapeHtml(chargeId)}</code>. The purchase has been revoked.`
        : [
            `💳 Telegram refused the refund: ${escapeHtml(result.error)}`,
            '',
            'Nothing was changed here.',
          ].join('\n'),
      buttons: [[{ text: '← Admin', callback_data: 'admin:overview' }]],
    };
  }

  private reports(adminTelegramId: number, now: number): Card {
    const open = this.service.social.openReports(5);
    this.audit(adminTelegramId, 'reports.view', null, { count: open.length }, now);
    if (open.length === 0)
      return {
        text: '🚩 <b>REPORTS</b>\n\nNothing open. Reports are read by a person and never actioned automatically.',
        buttons: [[{ text: '← Back', callback_data: 'admin:overview' }]],
      };

    const lines = open.map((report) => {
      const reporter = this.service.views.cardFor(report.reporter, now);
      const target = this.service.views.cardFor(report.target, now);
      return [
        `<b>${escapeHtml(report.reason)}</b> · ${new Date(report.createdAt).toISOString().slice(0, 16).replace('T', ' ')}`,
        `${escapeHtml(reporter?.name ?? 'someone')} → ${escapeHtml(target?.name ?? 'someone')}`,
        report.note ? `“${escapeHtml(report.note.slice(0, 160))}”` : '',
      ]
        .filter(Boolean)
        .join('\n');
    });

    const first = open[0]!;
    return {
      text: ['🚩 <b>REPORTS</b>', '', lines.join('\n\n')].join('\n'),
      buttons: [
        [
          { text: '✓ Reviewed (first)', callback_data: `admin:reviewed:${first.id}` },
          { text: '✕ Dismiss (first)', callback_data: `admin:dismiss:${first.id}` },
        ],
        [{ text: '← Back', callback_data: 'admin:overview' }],
      ],
    };
  }

  private funnel(now: number): Card {
    const day = now - 86_400_000;
    const week = now - 7 * 86_400_000;
    const count = (name: Parameters<typeof this.service.analytics.count>[0], since: number) =>
      this.service.analytics.count(name, since);
    return {
      text: [
        '📈 <b>FUNNEL</b>',
        '',
        '<b>Last 24 hours</b>',
        `Bot started  ${count('telegram_bot_started', day)}`,
        `App opened   ${count('telegram_miniapp_opened', day)}`,
        `New players  ${count('telegram_account_created', day)}`,
        `Duels done   ${count('match_completed', day)}`,
        `Challenges   ${count('challenge_created', day)} sent · ${count('challenge_accepted', day)} accepted`,
        `Premium      ${count('premium_viewed', day)} viewed · ${count('premium_purchased', day)} bought`,
        '',
        '<b>Last 7 days</b>',
        `New players  ${count('telegram_account_created', week)}`,
        `Duels done   ${count('match_completed', week)}`,
        `Invites      ${count('referral_clicked', week)} clicked · ${count('referral_activated', week)} played`,
      ].join('\n'),
      buttons: [[{ text: '← Back', callback_data: 'admin:overview' }]],
    };
  }

  /**
   * Writes what an administrator did.
   *
   * Before the action, not after: an audit trail that only records successes is
   * an audit trail that hides exactly the events worth investigating.
   */
  private audit(
    adminTelegramId: number,
    action: string,
    target: string | null,
    metadata: Record<string, unknown>,
    now: number,
  ): void {
    try {
      this.service.db.sql
        .prepare('INSERT INTO admin_audit(at,admin_telegram_id,action,target,metadata) VALUES(?,?,?,?,?)')
        .run(now, adminTelegramId, action, target, JSON.stringify(metadata));
    } catch {
      /* An audit write must never be the reason an operator cannot act. */
    }
  }
}
