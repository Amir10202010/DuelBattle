import type { DatabaseSync } from 'node:sqlite';
import { OFFERS, STARTER_QUESTS, seasonAt } from '@battle/shared';

/**
 * The numbers an operator runs the game by, computed from the game's own rows.
 *
 * Every figure here says where it comes from, because a dashboard is only as
 * useful as its definitions. Money is in US cents; Stars are converted at the
 * rate Telegram pays developers, which is an estimate and labelled as one.
 */

const DAY = 86_400_000;
/** What a developer receives per Telegram Star, in US cents. Telegram's published rate. */
export const STAR_USD_CENTS = 1.3;

export interface KpiReport {
  generatedAt: number;
  audience: {
    dau: number; wau: number; mau: number;
    /** DAU / MAU: how much of the monthly audience turns up on a given day. */
    stickiness: number;
    accounts: number; newToday: number; new7d: number; new30d: number;
    guestSessions7d: number;
  };
  retention: {
    d1: number | null; d7: number | null; d30: number | null;
    cohortSizes: { d1: number; d7: number; d30: number };
  };
  engagement: {
    sessions7d: number;
    avgSessionMinutes: number;
    matchesPerSession: number;
    matchesToday: number; rankedToday: number; casualToday: number;
    playersToday: number;
    firstMatchRate: number | null;
    firstWinRate: number | null;
    starterCompletion: number | null;
    rageQuits7d: number;
    queueCancels7d: number;
    longWaitCancels7d: number;
  };
  monetization: {
    revenue30dCents: number;
    cardRevenue30dCents: number;
    stars30d: number;
    purchases30d: number;
    payers30d: number;
    conversion: number | null;
    arpuCents: number | null;
    arppuCents: number | null;
    averagePurchaseCents: number | null;
    revenuePerSessionCents: number | null;
    passHolders: number;
    passConversion: number | null;
    starterConversion: number | null;
    cosmeticBuyers30d: number;
    storeOpens7d: number;
    checkoutsStarted7d: number;
    checkoutsCompleted7d: number;
    /** ARPU × expected lifetime, from D30 retention. An estimate, capped at two years. */
    ltvEstimateCents: number | null;
  };
  economy: {
    coinsEarned7d: number; coinsSpent7d: number;
    gemsEarned7d: number; gemsSpent7d: number;
    coinsHeld: number; gemsHeld: number;
  };
  funnel: { step: string; count: number }[];
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null);

export function kpis(sql: DatabaseSync, now: number): KpiReport {
  const n = (query: string, ...params: (string | number)[]) =>
    Number(Object.values(sql.prepare(query).get(...params) ?? { n: 0 })[0] ?? 0);
  const today = Math.floor(now / DAY) * DAY;

  const active = (since: number) =>
    n('SELECT count(DISTINCT account_id) FROM analytics_events WHERE account_id IS NOT NULL AND at>=?', since);
  const dau = active(now - DAY);
  const wau = active(now - 7 * DAY);
  const mau = active(now - 30 * DAY);

  /**
   * Share of accounts created on a given day that came back exactly N days
   * later, over the seven most recent cohorts whose day N is fully over.
   */
  const retention = (days: number) => {
    const from = today - (days + 7) * DAY;
    const to = today - days * DAY;
    const row = sql
      .prepare(
        `SELECT count(*) AS size, coalesce(sum(EXISTS(
           SELECT 1 FROM analytics_events e WHERE e.account_id=a.id
             AND e.at >= (a.created_at/${DAY})*${DAY} + ?*${DAY}
             AND e.at <  (a.created_at/${DAY})*${DAY} + (?+1)*${DAY})), 0) AS back
         FROM accounts a WHERE a.created_at>=? AND a.created_at<?`,
      )
      .get(days, days, from, to)!;
    return { size: Number(row.size), rate: ratio(Number(row.back), Number(row.size)) };
  };
  const d1 = retention(1);
  const d7 = retention(7);
  const d30 = retention(30);

  const sessions7d = n("SELECT count(DISTINCT session_id) FROM analytics_events WHERE session_id IS NOT NULL AND at>=?", now - 7 * DAY);
  const avgSessionMs = n(
    'SELECT coalesce(avg(span),0) FROM (SELECT max(at)-min(at) AS span FROM analytics_events WHERE session_id IS NOT NULL AND at>=? GROUP BY session_id)',
    now - 7 * DAY,
  );
  const matches7d = n("SELECT count(*) FROM analytics_events WHERE name='match_completed' AND at>=?", now - 7 * DAY);
  const rankedToday = n('SELECT count(*) FROM match_receipts WHERE at>=?', today);
  const casualToday = n('SELECT count(*) FROM casual_receipts WHERE at>=?', today);

  const new30d = n('SELECT count(*) FROM accounts WHERE created_at>=?', now - 30 * DAY);
  const recentAccounts = "SELECT id FROM accounts WHERE created_at>=?";
  const milestone = (key: string) =>
    n(`SELECT count(*) FROM account_milestones WHERE key=? AND account_id IN (${recentAccounts})`, key, now - 30 * DAY);

  const cardCents = n("SELECT coalesce(sum(amount-refunded_amount),0) FROM purchases WHERE provider='stripe' AND status='paid' AND paid_at>=?", now - 30 * DAY);
  const stars =
    n("SELECT coalesce(sum(amount),0) FROM purchases WHERE provider='telegram_stars' AND status='paid' AND paid_at>=?", now - 30 * DAY) +
    n("SELECT coalesce(sum(stars),0) FROM telegram_payments WHERE status='paid' AND product='premium' AND created_at>=?", now - 30 * DAY);
  const revenue = Math.round(cardCents + stars * STAR_USD_CENTS);
  const moneyPurchases =
    n("SELECT count(*) FROM purchases WHERE provider IN ('stripe','telegram_stars') AND status='paid' AND paid_at>=?", now - 30 * DAY) +
    n("SELECT count(*) FROM telegram_payments WHERE status='paid' AND product='premium' AND created_at>=?", now - 30 * DAY);
  const payers = n(
    `SELECT count(*) FROM (
       SELECT account_id FROM purchases WHERE provider IN ('stripe','telegram_stars') AND status='paid' AND paid_at>=?
       UNION SELECT account_id FROM telegram_payments WHERE status='paid' AND created_at>=?)`,
    now - 30 * DAY, now - 30 * DAY,
  );
  const sessions30d = n("SELECT count(DISTINCT session_id) FROM analytics_events WHERE session_id IS NOT NULL AND at>=?", now - 30 * DAY);
  const passHolders = n(
    "SELECT count(DISTINCT account_id) FROM entitlements WHERE feature=? OR (feature='premium' AND (expires_at IS NULL OR expires_at>?))",
    `pass:${seasonAt(now).id}`, now,
  );
  const starterEligible = n('SELECT count(*) FROM accounts WHERE created_at>=?', now - 44 * DAY);
  const starterBought = n("SELECT count(DISTINCT p.account_id) FROM purchases p JOIN accounts a ON a.id=p.account_id WHERE p.offer_id='starter_pack' AND p.status='paid' AND a.created_at>=?", now - 44 * DAY);
  const cosmeticOffers = OFFERS.filter((offer) => offer.rewards.some((reward) => reward.kind === 'item' || reward.kind === 'chest')).map((offer) => offer.id);
  const arpu = mau > 0 ? revenue / mau : null;
  const lifetimeMonths = d30.rate === null ? 1 : Math.min(24, 1 / Math.max(1 / 24, 1 - d30.rate));

  const flow = (currency: 'coins' | 'gems', sign: '>' | '<') =>
    Math.abs(n(`SELECT coalesce(sum(delta),0) FROM economy_ledger WHERE currency=? AND delta ${sign} 0 AND at>=?`, currency, now - 7 * DAY));
  const event7d = (name: string) => n('SELECT count(*) FROM analytics_events WHERE name=? AND at>=?', name, now - 7 * DAY);

  return {
    generatedAt: now,
    audience: {
      dau, wau, mau,
      stickiness: ratio(dau, mau) ?? 0,
      accounts: n('SELECT count(*) FROM accounts'),
      newToday: n('SELECT count(*) FROM accounts WHERE created_at>=?', today),
      new7d: n('SELECT count(*) FROM accounts WHERE created_at>=?', now - 7 * DAY),
      new30d,
      guestSessions7d: n(
        "SELECT count(DISTINCT session_id) FROM analytics_events WHERE session_id IS NOT NULL AND account_id IS NULL AND at>=?",
        now - 7 * DAY,
      ),
    },
    retention: {
      d1: d1.rate, d7: d7.rate, d30: d30.rate,
      cohortSizes: { d1: d1.size, d7: d7.size, d30: d30.size },
    },
    engagement: {
      sessions7d,
      avgSessionMinutes: Math.round((avgSessionMs / 60_000) * 10) / 10,
      matchesPerSession: ratio(matches7d, sessions7d) ?? 0,
      matchesToday: rankedToday + casualToday,
      rankedToday,
      casualToday,
      playersToday: n('SELECT count(*) FROM activity_days WHERE day=?', new Date(now).toISOString().slice(0, 10)),
      firstMatchRate: ratio(milestone('first_match'), new30d),
      firstWinRate: ratio(milestone('first_win'), new30d),
      starterCompletion: ratio(
        n(`SELECT count(*) FROM (SELECT account_id FROM quest_progress WHERE period_key='starter' AND claimed_at IS NOT NULL
          AND quest_id IN (${STARTER_QUESTS.map(() => '?').join(',')}) AND account_id IN (${recentAccounts})
          GROUP BY account_id HAVING count(DISTINCT quest_id)=?)`, ...STARTER_QUESTS.map((quest) => quest.id), now - 30 * DAY, STARTER_QUESTS.length),
        new30d,
      ),
      rageQuits7d: n("SELECT count(*) FROM analytics_events WHERE name IN ('rage_quit','match_left') AND at>=?", now - 7 * DAY),
      queueCancels7d: event7d('queue_cancelled'),
      longWaitCancels7d: n(
        "SELECT count(*) FROM analytics_events WHERE name='queue_cancelled' AND at>=? AND json_extract(props,'$.wait_ms')>=30000",
        now - 7 * DAY,
      ),
    },
    monetization: {
      revenue30dCents: revenue,
      cardRevenue30dCents: cardCents,
      stars30d: stars,
      purchases30d: moneyPurchases,
      payers30d: payers,
      conversion: ratio(payers, mau),
      arpuCents: arpu === null ? null : Math.round(arpu),
      arppuCents: payers > 0 ? Math.round(revenue / payers) : null,
      averagePurchaseCents: moneyPurchases > 0 ? Math.round(revenue / moneyPurchases) : null,
      revenuePerSessionCents: sessions30d > 0 ? Math.round((revenue / sessions30d) * 100) / 100 : null,
      passHolders,
      passConversion: ratio(passHolders, mau),
      starterConversion: ratio(starterBought, starterEligible),
      cosmeticBuyers30d: n(
        `SELECT count(*) FROM (
          SELECT account_id FROM economy_ledger WHERE delta<0 AND item_id IS NOT NULL AND at>=?
          UNION SELECT account_id FROM purchases WHERE status='paid' AND paid_at>=? AND offer_id IN (${cosmeticOffers.map(() => '?').join(',')})
        )`, now - 30 * DAY, now - 30 * DAY, ...cosmeticOffers,
      ),
      storeOpens7d: event7d('store_opened'),
      checkoutsStarted7d: event7d('checkout_started'),
      checkoutsCompleted7d: n("SELECT count(*) FROM purchases WHERE provider IN ('stripe','telegram_stars') AND status='paid' AND paid_at>=?", now - 7 * DAY),
      ltvEstimateCents: arpu === null ? null : Math.round(arpu * lifetimeMonths),
    },
    economy: {
      coinsEarned7d: flow('coins', '>'),
      coinsSpent7d: flow('coins', '<'),
      gemsEarned7d: flow('gems', '>'),
      gemsSpent7d: flow('gems', '<'),
      coinsHeld: n('SELECT coalesce(sum(coins),0) FROM wallets'),
      gemsHeld: n('SELECT coalesce(sum(gems),0) FROM wallets'),
    },
    funnel: [
      { step: 'Accounts created (30d)', count: new30d },
      { step: 'Finished a first match', count: milestone('first_match') },
      { step: 'Won a first match', count: milestone('first_win') },
      { step: 'Opened the store (7d)', count: event7d('store_opened') },
      { step: 'Started a checkout (7d)', count: event7d('checkout_started') },
      { step: 'Paid (30d)', count: payers },
    ],
  };
}
