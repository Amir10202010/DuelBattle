import {
  PASS_POINTS,
  dayKey,
  matchPassPoints,
  offerById,
  type Granted,
  type MetaActionResult,
  type MetaMatchRewards,
  type MetaView,
  type QuestEvent,
  type StoreView,
} from '@battle/shared';
import type { Database } from '../database.js';
import { Analytics } from '../analytics.js';
import { AuthError } from '../auth.js';
import { economyView, ensureWallet } from '../economy.js';
import { Entitlements } from '../entitlements.js';
import { log } from '../log.js';
import type { SettledMatch } from '../settlement.js';
import { DailyCalendar } from './calendar.js';
import { applyRewards } from './grants.js';
import { kpis, type KpiReport } from './kpis.js';
import { QuestBook } from './quests.js';
import { addPassPoints, SeasonPass } from './season.js';
import { Shop } from './store.js';
import type { StripeEvent, StripeGateway } from './stripe.js';

export interface MetaOptions {
  stripe?: StripeGateway;
  /** Whether Telegram Stars can be taken on this deployment. */
  starsAvailable?: () => boolean;
  /** Verified emails allowed to read the dashboard. */
  adminEmails?: readonly string[];
}

/**
 * Everything around the match: quests, the season, the calendar, the shop.
 *
 * One service so every action has the same shape — check, write, pay, answer
 * with the new view — and one transaction per action, so a claim either
 * happened completely or not at all. Nothing here touches a rating, a round
 * or a verdict; the match engine does not know this exists.
 */
export class MetaService {
  readonly quests: QuestBook;
  readonly season: SeasonPass;
  readonly calendar: DailyCalendar;
  readonly shop: Shop;
  readonly entitlements: Entitlements;
  readonly analytics: Analytics;
  private readonly admins: ReadonlySet<string>;

  constructor(
    private readonly db: Database,
    private readonly options: MetaOptions = {},
  ) {
    this.entitlements = new Entitlements(db);
    this.analytics = new Analytics(db);
    this.quests = new QuestBook(db.sql);
    this.season = new SeasonPass(db.sql, this.entitlements);
    this.calendar = new DailyCalendar(db.sql);
    this.shop = new Shop(db.sql, this.entitlements, this.season);
    this.admins = new Set((options.adminEmails ?? []).map((email) => email.toLowerCase()));
  }

  get payments(): StoreView['payments'] {
    return { card: Boolean(this.options.stripe?.configured), stars: Boolean(this.options.starsAvailable?.()) };
  }

  isAdmin(accountId: string): boolean {
    if (this.admins.size === 0) return false;
    const email = this.db.sql.prepare('SELECT email FROM accounts WHERE id=?').get(accountId)?.email;
    return typeof email === 'string' && this.admins.has(email.toLowerCase());
  }

  view(accountId: string, now: number): MetaView {
    ensureWallet(this.db.sql, accountId, now);
    const wallet = economyView(this.db.sql, accountId, this.db.get(accountId)?.xp ?? 0, now);
    const quests = this.quests.view(accountId, now);
    const season = this.season.view(accountId, now);
    const calendar = this.calendar.view(accountId, now);
    const claimable =
      [...quests.daily, ...quests.weekly, ...quests.starter].filter((q) => q.done && !q.claimed).length +
      this.season.claimable(accountId, now).length +
      (calendar.claimedToday ? 0 : 1);
    return {
      wallet: { coins: wallet.coins, gems: wallet.gems },
      quests,
      season,
      calendar,
      store: this.shop.view(accountId, now, this.payments),
      claimable,
      admin: this.isAdmin(accountId),
      serverTime: now,
    };
  }

  private act(accountId: string, now: number, run: () => Granted[]): MetaActionResult {
    const granted = this.db.transaction(() => {
      ensureWallet(this.db.sql, accountId, now);
      return run();
    });
    return { granted, view: this.view(accountId, now) };
  }

  claimQuest(accountId: string, questId: string, now: number): MetaActionResult {
    return this.act(accountId, now, () => {
      const { quest, rewards, receipt } = this.quests.claim(accountId, questId, now);
      const granted = applyRewards(this.db.sql, accountId, rewards, receipt, now);
      this.analytics.track('quest_claimed', accountId, { quest: quest.id, period: quest.period }, now);
      return granted;
    });
  }

  claimTier(accountId: string, tier: number, track: 'free' | 'premium', now: number): MetaActionResult {
    return this.act(accountId, now, () => {
      const rewards = this.season.claim(accountId, tier, track, now);
      const granted = applyRewards(this.db.sql, accountId, rewards, `tier:${this.season.view(accountId, now).id}:${track}:${tier}`, now);
      this.analytics.track('pass_tier_claimed', accountId, { tier, track }, now);
      return granted;
    });
  }

  /** Every reached reward at once: the button a returning player actually wants. */
  claimAllTiers(accountId: string, now: number): MetaActionResult {
    return this.act(accountId, now, () => {
      const seasonId = this.season.view(accountId, now).id;
      return this.season.claimable(accountId, now).flatMap(({ tier, track }) => {
        const rewards = this.season.claim(accountId, tier, track, now);
        this.analytics.track('pass_tier_claimed', accountId, { tier, track }, now);
        return applyRewards(this.db.sql, accountId, rewards, `tier:${seasonId}:${track}:${tier}`, now);
      });
    });
  }

  claimDaily(accountId: string, now: number): MetaActionResult {
    return this.act(accountId, now, () => {
      const { rewards, receipt, square } = this.calendar.claim(accountId, now);
      const granted = applyRewards(this.db.sql, accountId, rewards, receipt, now);
      this.quests.record(accountId, { type: 'daily' }, now);
      this.analytics.track('daily_claimed', accountId, { square }, now);
      return granted;
    });
  }

  buy(accountId: string, offerId: string, now: number): MetaActionResult {
    return this.act(accountId, now, () => {
      const { offer, granted } = this.shop.buyWithCurrency(accountId, offerId, now);
      if (offer.price.currency !== 'money')
        this.analytics.track('currency_spent', accountId, { currency: offer.price.currency, amount: offer.price.amount, offer: offer.id }, now);
      this.analytics.track(offer.kind === 'pass' ? 'pass_purchased' : 'offer_purchased', accountId, { offer: offer.id }, now);
      this.quests.record(accountId, { type: 'purchase' }, now);
      return offer.kind === 'pass' && granted.length === 0 ? [] : granted;
    });
  }

  buyDeal(accountId: string, itemId: string, now: number): MetaActionResult {
    return this.act(accountId, now, () => {
      const granted = this.shop.buyDeal(accountId, itemId, this.db.get(accountId)?.xp ?? 0, now);
      this.analytics.track('offer_purchased', accountId, { deal: itemId }, now);
      this.quests.record(accountId, { type: 'purchase' }, now);
      return granted;
    });
  }

  /** A quest event that happens outside a match: an equip, a purchase. */
  record(accountId: string, event: QuestEvent, now: number): void {
    try {
      this.db.transaction(() => this.quests.record(accountId, event, now));
    } catch (error) {
      log.warn('quest event failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    }
  }

  // -- Money ------------------------------------------------------------------

  /** Opens a Stripe Checkout for a real-money offer and returns where to send the browser. */
  async checkout(accountId: string, offerId: string, origin: string, now: number): Promise<{ url: string; orderId: string }> {
    const stripe = this.options.stripe;
    if (!stripe?.configured) throw new AuthError(503, 'Card payments are not available on this server.');
    const offer = offerById(offerId);
    if (!offer || offer.price.currency !== 'money') throw new AuthError(404, 'That offer is not sold for money.');
    const { orderId } = this.db.transaction(() => this.shop.createOrder(accountId, offerId, 'stripe', now));
    const session = await stripe.createCheckout({
      orderId,
      name: offer.name,
      description: offer.description,
      usdCents: offer.price.usdCents,
      successUrl: `${origin}/store?order=${orderId}`,
      cancelUrl: `${origin}/store?cancelled=${orderId}`,
    });
    this.shop.attachProviderRef(orderId, session.id);
    this.analytics.track('checkout_started', accountId, { offer: offer.id, provider: 'stripe' }, now);
    return { url: session.url!, orderId };
  }

  /**
   * Acts on a verified Stripe event. Returns false for events this service
   * does not handle, which the webhook still acknowledges.
   */
  handleStripeEvent(event: StripeEvent, now: number): boolean {
    const object = event.data.object;
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      if (object.payment_status !== 'paid') return true;
      const metadata = (object.metadata ?? {}) as Record<string, string>;
      const orderId = metadata.order_id ?? (typeof object.client_reference_id === 'string' ? object.client_reference_id : '');
      const fulfilled = this.db.transaction(() =>
        this.shop.fulfillStripe(
          {
            orderId,
            sessionId: String(object.id),
            paymentIntent: typeof object.payment_intent === 'string' ? object.payment_intent : null,
            amount: Number(object.amount_total ?? 0),
            currency: String(object.currency ?? ''),
          },
          now,
        ),
      );
      if (!fulfilled) log.warn('stripe session did not match an order', { event: event.id });
      else if (fulfilled.fresh) this.purchased(fulfilled.accountId, fulfilled.offerId, 'stripe', now);
      return true;
    }
    if (event.type === 'charge.refunded' && typeof object.payment_intent === 'string') {
      const refunded = this.db.transaction(() => this.shop.stripeRefund(
        object.payment_intent as string, Number(object.amount_refunded ?? 0), object.refunded === true, now));
      if (refunded) this.analytics.track('purchase_refunded', refunded.accountId, { provider: 'stripe' }, now);
      return true;
    }
    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const metadata = object.metadata as Record<string, string> | undefined;
      if (metadata?.order_id && typeof object.id === 'string') this.shop.failOrder(metadata.order_id, object.id);
      return true;
    }
    return false;
  }

  /**
   * The store as a Stars payment sees it. No transactions of its own: the
   * payment code holds one around the charge row and the delivery together.
   */
  starOffers() {
    return {
      createOrder: (accountId: string, offerId: string, now: number) =>
        this.db.transaction(() => this.shop.createOrder(accountId, offerId, 'telegram_stars', now)).orderId,
      canPayOrder: (accountId: string, offerId: string, orderId: string, amount?: number, now?: number) =>
        this.shop.canPayStars(accountId, offerId, orderId, amount, now),
      available: (accountId: string, offerId: string, now: number) => this.shop.canBuy(accountId, offerId, now),
      fulfill: (input: { accountId: string; offerId: string; chargeId: string; stars: number; orderId?: string }, now: number) => {
        const fulfilled = this.shop.fulfillStars(input, now);
        if (fulfilled?.fresh) this.purchased(fulfilled.accountId, fulfilled.offerId, 'telegram_stars', now);
        return fulfilled ? { granted: fulfilled.granted, fresh: fulfilled.fresh } : null;
      },
      revoke: (chargeId: string, now: number) => {
        const refunded = this.shop.refund({ chargeId }, now);
        if (refunded) this.analytics.track('purchase_refunded', refunded.accountId, { provider: 'telegram_stars' }, now);
      },
    };
  }

  private purchased(accountId: string, offerId: string, provider: string, now: number) {
    this.analytics.track('purchase_completed', accountId, { offer: offerId, provider }, now);
  }

  orderStatus(accountId: string, orderId: string): { status: string; granted: Granted[] } | null {
    const order = this.shop.order(orderId);
    if (!order || order.accountId !== accountId) return null;
    return { status: order.status, granted: order.status === 'paid' ? order.granted : [] };
  }

  kpis(now: number): KpiReport {
    return kpis(this.db.sql, now);
  }

  // -- Matches ------------------------------------------------------------------

  /**
   * What a settled match did to the season and the quest boards.
   *
   * Runs after the rating transaction has committed, one transaction per
   * player so that one account's problem cannot cost the other their quests.
   * The pass pays only for a rewarded match; quests move either way, because
   * a match past the casual ceiling still happened.
   */
  settle(match: SettledMatch): Record<string, MetaMatchRewards & { questsCompleted: string[] }> {
    const out: Record<string, MetaMatchRewards & { questsCompleted: string[] }> = {};
    const now = match.at;
    const day = dayKey(now);
    for (const [player, opponent] of [[match.players[0], match.players[1]], [match.players[1], match.players[0]]] as const) {
      try {
        out[player.accountId] = this.db.transaction(() => {
          const sql = this.db.sql;
          if (!sql.prepare('SELECT 1 FROM accounts WHERE id=?').get(player.accountId)) throw new Error('no account');
          const receipt = sql.prepare('SELECT result FROM meta_match_receipts WHERE account_id=? AND match_id=?')
            .get(player.accountId, match.matchId);
          if (receipt) return JSON.parse(String(receipt.result)) as MetaMatchRewards & { questsCompleted: string[] };
          if (player.forfeited) return { pass: null, quests: [], questsCompleted: [] };
          const firstOfDay = sql.prepare('INSERT OR IGNORE INTO activity_days(account_id,day) VALUES(?,?)').run(player.accountId, day).changes === 1;
          const milestone = (key: string) =>
            sql.prepare('INSERT OR IGNORE INTO account_milestones(account_id,key,at) VALUES(?,?,?)').run(player.accountId, key, now).changes === 1;
          if (milestone('first_match')) this.analytics.track('first_match', player.accountId, { ranked: match.ranked }, now);
          if (player.result === 'win' && milestone('first_win')) this.analytics.track('first_win', player.accountId, {}, now);
          if (player.result === 'loss' && milestone('first_loss')) this.analytics.track('first_loss', player.accountId, {}, now);

          const ticks = this.quests.record(player.accountId, {
            type: 'match',
            result: player.result,
            roundsWon: player.score,
            validAnswers: player.validAnswers,
            streak: player.streak,
            ranked: match.ranked,
            friendRoom: match.friendRoom,
            upset: match.ranked && player.result === 'win' && opponent.ratingBefore > player.ratingBefore,
            fastestWinMs: player.fastestWinMs,
            firstOfDay,
          }, now);

          let pass: MetaMatchRewards['pass'] = null;
          if (player.rewarded) {
            const base = matchPassPoints({ result: player.result, roundsWon: player.score, ranked: match.ranked });
            const moved = addPassPoints(sql, player.accountId, `match:${match.matchId}`, base, now);
            const bonus = player.result === 'win'
              ? addPassPoints(sql, player.accountId, `firstwin:${day}`, PASS_POINTS.firstWinOfDay, now)
              : null;
            if (moved) pass = { points: base + (bonus ? PASS_POINTS.firstWinOfDay : 0), before: moved.before, after: bonus?.after ?? moved.after };
          }

          this.analytics.track('match_completed', player.accountId, {
            ranked: match.ranked, result: player.result, rounds: player.score, friend: match.friendRoom, rewarded: player.rewarded,
          }, now);
          if (player.rewards.levelAfter > player.rewards.levelBefore)
            this.analytics.track('level_up', player.accountId, { level: player.rewards.levelAfter }, now);
          const coins = player.rewards.coins ?? 0;
          if (coins > 0) this.analytics.track('currency_earned', player.accountId, { currency: 'coins', amount: coins, source: 'match' }, now);

          const result = {
            pass,
            quests: ticks.map(({ id, progress, target, done }) => ({ id, progress, target, done })),
            questsCompleted: ticks.filter((tick) => tick.completedNow).map((tick) => tick.title),
            ...(!match.ranked && !player.rewarded ? { capped: true } : {}),
          };
          sql.prepare('INSERT INTO meta_match_receipts(account_id,match_id,result) VALUES(?,?,?)')
            .run(player.accountId, match.matchId, JSON.stringify(result));
          return result;
        });
      } catch (error) {
        if (error instanceof Error && error.message === 'no account') continue;
        log.error('meta settlement failed', { errorType: error instanceof Error ? error.name : 'unknown' });
      }
    }
    return out;
  }

  sweep(now: number): void {
    this.analytics.sweep(now);
  }
}
