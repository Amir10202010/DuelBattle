import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { nameSchema } from '@battle/shared/validation';
import {
  normalizeAvatar,
  type TelegramPremiumOffer,
  type TelegramResultCard,
  type TelegramSocialView,
} from '@battle/shared';
import type { AuthService } from '../auth.js';
import { config } from '../config.js';
import { TokenBuckets } from '../limiter.js';
import { log } from '../log.js';
import { TelegramBot, type TelegramUpdate } from './bot.js';
import { botLink, telegramConfig } from './config.js';
import { formatLinkCode } from './links.js';
import { REPORT_REASONS } from './social.js';
import type { TelegramService } from './service.js';
import { PREMIUM_BENEFITS } from './payments.js';

/**
 * Every `/api/telegram/*` route.
 *
 * Shaped like the auth router it sits beside — one function, one switch, JSON
 * in and JSON out — so there is one HTTP style in this server rather than two.
 *
 * Three rules hold across all of it:
 *
 *   - **The session decides who you are.** Every route but `auth` and the
 *     webhook resolves an account from the bearer token (or the cookie, for a
 *     browser) and takes the account id from there. No route reads an account
 *     id from a request body, ever.
 *   - **Other players are named by `ref`,** an opaque handle, and a ref that
 *     does not resolve is a 404 rather than an error that confirms it exists.
 *   - **The webhook is authenticated by Telegram's secret token** and by
 *     nothing else — no origin, no cookie, no session.
 */

const MAX_BODY_BYTES = 8_192;

const authSchema = z.object({ initData: z.string().max(4096) }).strict();
const friendSchema = z
  .object({ ref: z.string().min(2).max(32), action: z.enum(['add', 'remove']) })
  .strict();
const blockSchema = z
  .object({ ref: z.string().min(2).max(32), action: z.enum(['block', 'unblock']) })
  .strict();
const reportSchema = z
  .object({
    ref: z.string().min(2).max(32),
    reason: z.enum(REPORT_REASONS),
    note: z.string().max(400).optional(),
  })
  .strict();
const questSchema = z.object({ questId: z.string().min(1).max(40) }).strict();
const profileSchema = z
  .object({
    name: nameSchema.optional(),
    avatar: z
      .object({ shape: z.number().int().min(0).max(64), color: z.number().int().min(0).max(64) })
      .optional(),
  })
  .strict();
const notificationSchema = z
  .object({
    matches: z.boolean(),
    challenges: z.boolean(),
    achievements: z.boolean(),
    social: z.boolean(),
    digest: z.boolean(),
    quietFrom: z.number().int().min(0).max(23).nullable(),
    quietTo: z.number().int().min(0).max(23).nullable(),
    utcOffsetMinutes: z.number().int().min(-840).max(840),
  })
  .strict();

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Budgets, per account where there is one and per address where there is not.
 *
 * The expensive and abusable surfaces get their own: signing in does scrypt-free
 * but non-trivial work and creates rows; challenges and reports are the two
 * things one person can use to bother everybody else.
 */
function budgets() {
  return {
    auth: new TokenBuckets({ burst: 12, refillPerSec: 0.2 }),
    read: new TokenBuckets({ burst: 60, refillPerSec: 2 }),
    write: new TokenBuckets({ burst: 20, refillPerSec: 0.5 }),
    challenge: new TokenBuckets({ burst: 6, refillPerSec: 0.05 }),
    report: new TokenBuckets({ burst: 4, refillPerSec: 0.02 }),
    webhook: new TokenBuckets({ burst: 120, refillPerSec: 30 }),
  };
}

export function telegramHttp(service: TelegramService, auth: AuthService) {
  const bot = new TelegramBot(service);
  const limits = budgets();

  return async (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    ip: string,
  ): Promise<boolean> => {
    if (!path.startsWith('/api/telegram/')) return false;
    const now = Date.now();
    const respond = (status: number, body: unknown) => {
      const text = JSON.stringify(body);
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(text),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(text);
    };

    try {
      // -- The webhook, which is not a browser and is not a session ---------
      if (path === '/api/telegram/webhook') {
        if (req.method !== 'POST') throw new HttpError(405, 'Use POST.');
        if (!limits.webhook.take(ip, now)) throw new HttpError(429, 'Too many updates.');
        await handleWebhook(req, bot, service, now);
        // A committed charge is safe to acknowledge; transient settlement
        // failures below return 500 so Telegram can deliver the update again.
        respond(200, { ok: true });
        return true;
      }

      // -- Signing in -------------------------------------------------------
      if (path === '/api/telegram/auth') {
        requireBrowserPost(req);
        if (!limits.auth.take(ip, now)) throw new HttpError(429, 'Too many attempts. Wait a moment.');
        const { initData } = authSchema.parse(await readJson(req));
        const result = service.authenticate(initData, now);
        if (!result.ok) throw new HttpError(result.status, result.error);
        respond(200, result.result);
        return true;
      }

      // -- Everything else needs a session ----------------------------------
      const account = auth.account(req);
      if (!account) throw new HttpError(401, 'Open Duel Battle from Telegram to continue.');
      const accountId = account.id;

      if (req.method === 'GET') {
        if (!limits.read.take(accountId, now)) throw new HttpError(429, 'Slow down a moment.');
        respond(200, await get(service, accountId, path, req, now));
        return true;
      }

      requireBrowserPost(req);
      if (!limits.write.take(accountId, now)) throw new HttpError(429, 'Slow down a moment.');
      respond(200, await post(service, limits, accountId, path, req, now));
      return true;
    } catch (error) {
      if (error instanceof HttpError) respond(error.status, { error: error.message });
      else if (error instanceof z.ZodError)
        respond(400, { error: error.issues[0]?.message ?? 'Check that and try again.' });
      else {
        log.error('telegram route failed', {
          path,
          errorType: error instanceof Error ? error.name : 'unknown',
        });
        respond(500, { error: 'Something went wrong on our side.' });
      }
      return true;
    }
  };
}

// -- Reads ------------------------------------------------------------------

async function get(
  service: TelegramService,
  accountId: string,
  path: string,
  req: IncomingMessage,
  now: number,
): Promise<unknown> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const route = path.slice('/api/telegram/'.length);

  if (route === 'home') return service.home(accountId, now);

  if (route === 'me') return service.views.me(accountId, now);

  if (route === 'leaderboard') {
    const board = pick(url.searchParams.get('board'), ['rating', 'wins', 'streak'] as const, 'rating');
    const scope = pick(url.searchParams.get('scope'), ['global', 'friends'] as const, 'global');
    const offset = clampInt(url.searchParams.get('offset'), 0, 10_000);
    service.identities.touch(accountId, now);
    return service.views.leaderboard({ accountId, board, scope, offset, limit: 25, now });
  }

  if (route === 'matches') {
    const offset = clampInt(url.searchParams.get('offset'), 0, 100);
    return { matches: service.views.matches(accountId, offset, 15), offset };
  }

  const match = /^matches\/(\d{1,3})$/.exec(route);
  if (match) {
    const row = service.views.match(accountId, Number(match[1]));
    if (!row) throw new HttpError(404, 'That match is not in your history.');
    return row;
  }

  const share = /^share\/(\d{1,3})$/.exec(route);
  if (share) return resultCard(service, accountId, Number(share[1]), now);

  if (route === 'achievements') return { achievements: service.views.achievements(accountId) };

  if (route === 'quests') return service.quests.board(accountId, now);

  if (route === 'social') return social(service, accountId, now);

  if (route === 'premium') return premiumOffer(service, accountId, now);

  const profile = /^players\/(u[A-Za-z0-9_-]{12})$/.exec(route);
  if (profile) {
    const otherId = service.identities.accountForRef(profile[1]!);
    if (!otherId) throw new HttpError(404, 'No such player.');
    const card = service.views.cardFor(otherId, now);
    if (!card) throw new HttpError(404, 'No such player.');
    return {
      player: card,
      friend: service.social.isFriend(accountId, otherId),
      blocked: service.social.blocksEitherWay(accountId, otherId),
      you: otherId === accountId,
    };
  }

  const challenge = /^challenges\/([A-Za-z0-9_-]{16,32})$/.exec(route);
  if (challenge) {
    const duel = service.duels.get(challenge[1]!, now);
    if (!duel) throw new HttpError(404, 'That duel no longer exists.');
    return service.challengeView(duel, accountId, now);
  }

  throw new HttpError(404, 'Not found.');
}

// -- Writes -----------------------------------------------------------------

async function post(
  service: TelegramService,
  limits: ReturnType<typeof budgets>,
  accountId: string,
  path: string,
  req: IncomingMessage,
  now: number,
): Promise<unknown> {
  const route = path.slice('/api/telegram/'.length);
  const body = await readJson(req);

  if (route === 'profile') {
    const input = profileSchema.parse(body);
    const profile = service.db.get(accountId);
    if (!profile) throw new HttpError(404, 'No such player.');
    service.db.save({
      ...profile,
      ...(input.name ? { name: input.name } : {}),
      ...(input.avatar ? { avatar: normalizeAvatar(input.avatar) } : {}),
      lastSeenAt: now,
    });
    return service.views.me(accountId, now);
  }

  if (route === 'quests/claim') {
    const { questId } = questSchema.parse(body);
    const claimed = service.quests.claim(accountId, questId, now);
    if (!claimed.ok) {
      const copy = {
        unknown: 'That quest is not on today’s board.',
        incomplete: 'Finish it first.',
        claimed: 'Already claimed.',
      } as const;
      throw new HttpError(409, copy[claimed.reason]);
    }
    service.analytics.track('quest_claimed', accountId, { questId }, now);
    return { coins: claimed.coins, board: service.quests.board(accountId, now) };
  }

  if (route === 'notifications') {
    const prefs = notificationSchema.parse(body);
    service.notifications.savePreferences(accountId, prefs, now);
    return { notifications: prefs };
  }

  if (route === 'social/friend') {
    const { ref, action } = friendSchema.parse(body);
    const otherId = resolveRef(service, ref);
    if (action === 'add') {
      const outcome = service.social.addFriend(accountId, otherId, now);
      if (outcome === 'blocked') throw new HttpError(403, 'You cannot add that player.');
      if (outcome === 'full') throw new HttpError(409, 'Your friends list is full.');
      if (outcome === 'self') throw new HttpError(400, 'That is you.');
    } else service.social.removeFriend(accountId, otherId);
    return social(service, accountId, now);
  }

  if (route === 'social/block') {
    const { ref, action } = blockSchema.parse(body);
    const otherId = resolveRef(service, ref);
    if (action === 'block') service.social.block(accountId, otherId, now);
    else service.social.unblock(accountId, otherId);
    return social(service, accountId, now);
  }

  if (route === 'social/report') {
    if (!limits.report.take(accountId, now))
      throw new HttpError(429, 'You have reported enough for now. We read every one.');
    const input = reportSchema.parse(body);
    const otherId = resolveRef(service, input.ref);
    const outcome = service.social.report({
      reporterAccountId: accountId,
      targetAccountId: otherId,
      reason: input.reason,
      note: input.note ?? null,
      now,
    });
    if (outcome === 'self') throw new HttpError(400, 'That is you.');
    service.analytics.track('report_filed', accountId, { reason: input.reason }, now);
    return { filed: outcome === 'filed', duplicate: outcome === 'duplicate' };
  }

  if (route === 'challenges') {
    if (!limits.challenge.take(accountId, now))
      throw new HttpError(429, 'That is a lot of challenges. Give your friends a moment.');
    const created = service.duels.create(accountId, now);
    if (!created.ok)
      throw new HttpError(409, 'You already have open challenges. Cancel one or wait for a reply.');
    service.analytics.track('challenge_created', accountId, {}, now);
    return service.challengeView(created.duel, accountId, now);
  }

  const accept = /^challenges\/([A-Za-z0-9_-]{16,32})\/accept$/.exec(route);
  if (accept) {
    const outcome = service.duels.accept(accept[1]!, accountId, now);
    if (!outcome.ok) {
      const copy = {
        unknown: 'That duel no longer exists.',
        expired: 'That challenge has expired. Ask for a new one.',
        taken: 'Somebody already accepted that one.',
        own: 'That is your own challenge — share it with a friend.',
        blocked: 'You cannot play that player.',
      } as const;
      throw new HttpError(409, copy[outcome.reason]);
    }
    service.analytics.track('challenge_accepted', accountId, {}, now);
    notifyChallengeAccepted(service, outcome.duel.hostAccountId, accountId, outcome.duel.code, now);
    return service.challengeView(outcome.duel, accountId, now);
  }

  const decline = /^challenges\/([A-Za-z0-9_-]{16,32})\/decline$/.exec(route);
  if (decline) return { declined: service.duels.decline(decline[1]!, accountId, now) };

  const cancel = /^challenges\/([A-Za-z0-9_-]{16,32})\/cancel$/.exec(route);
  if (cancel) return { cancelled: service.duels.cancel(cancel[1]!, accountId) };

  const room = /^challenges\/([A-Za-z0-9_-]{16,32})\/room$/.exec(route);
  if (room) {
    const claimed = service.claimDuelRoom(room[1]!, accountId, now);
    if (!claimed.ok) throw new HttpError(409, claimed.error);
    service.analytics.track('challenge_played', accountId, {}, now);
    return { roomCode: claimed.roomCode };
  }

  if (route === 'premium/invoice') {
    const invoice = await service.payments.invoiceFor(accountId);
    if ('error' in invoice) throw new HttpError(503, invoice.error);
    service.analytics.track('premium_invoice_opened', accountId, {}, now);
    return invoice;
  }

  // Any real-money store offer — gems, the starter pack, the founder pack —
  // paid in Stars. Delivered by `successful_payment`, never by this call.
  const offerInvoice = /^offers\/([a-z0-9_]{1,24})\/invoice$/.exec(route);
  if (offerInvoice) {
    const invoice = await service.payments.invoiceForOffer(accountId, offerInvoice[1]!, now);
    if ('error' in invoice) throw new HttpError(409, invoice.error);
    service.analytics.track('checkout_started', accountId, { offer: offerInvoice[1]!, provider: 'telegram_stars' }, now);
    return invoice;
  }

  if (route === 'link') {
    // Issued to a browser session, where the player is already signed in, so
    // the code proves the account rather than whoever is holding the phone.
    // A POST because it mints a single-use credential, and a GET that does
    // that is a credential anything can prefetch.
    const code = service.links.issue(accountId, now);
    if (!code)
      throw new HttpError(429, 'You already have codes waiting. Use one, or try again in ten minutes.');
    return {
      code: formatLinkCode(code),
      expiresInMs: service.links.ttlMs,
      botLink: telegramConfig.botUsername
        ? `https://t.me/${telegramConfig.botUsername}?start=link_${formatLinkCode(code)}`
        : '',
      botUsername: telegramConfig.botUsername,
    };
  }

  if (route === 'unlink') {
    const outcome = service.unlink(accountId);
    if (!outcome.ok) throw new HttpError(409, outcome.error);
    return { unlinked: true };
  }

  throw new HttpError(404, 'Not found.');
}

// -- Helpers ----------------------------------------------------------------

function social(service: TelegramService, accountId: string, now: number): TelegramSocialView {
  return {
    friends: service.views.cardsFor(service.social.friends(accountId), now),
    recentOpponents: service.views.cardsFor(service.social.recentOpponents(accountId), now),
    blocked: service.views.cardsFor(service.social.blocked(accountId), now),
    incoming: service.duels
      .incoming(accountId, now)
      .map((duel) => service.challengeView(duel, accountId, now)),
    outgoing: service.duels
      .outgoing(accountId, now)
      .map((duel) => service.challengeView(duel, accountId, now)),
  };
}

function premiumOffer(
  service: TelegramService,
  accountId: string,
  now: number,
): TelegramPremiumOffer & { premium: ReturnType<TelegramService['entitlements']['premium']> } {
  service.analytics.track('premium_viewed', accountId, {}, now);
  return {
    stars: telegramConfig.premiumStars,
    days: telegramConfig.premiumDays || null,
    benefits: [...PREMIUM_BENEFITS],
    available: service.payments.available,
    premium: service.entitlements.premium(accountId, now),
  };
}

/**
 * The card a player shares after a match.
 *
 * Built from their own history row, so it cannot say anything they were not
 * already shown, and it names the opponent only by the name that was on screen.
 */
function resultCard(
  service: TelegramService,
  accountId: string,
  index: number,
  now: number,
): TelegramResultCard {
  const row = service.views.match(accountId, index);
  if (!row) throw new HttpError(404, 'That match is not in your history.');
  const me = service.views.me(accountId, now);
  const change = row.ratingAfter - row.ratingBefore;
  const headline =
    row.result === 'win'
      ? `${me.name} beat ${row.opponentName || 'their opponent'}`
      : row.result === 'loss'
        ? `${row.opponentName || 'Their opponent'} beat ${me.name}`
        : `${me.name} drew with ${row.opponentName || 'their opponent'}`;
  const lines = [
    `${row.result === 'win' ? '🏆 WIN' : row.result === 'loss' ? '💥 LOSS' : '🤝 DRAW'} ${row.yourScore}–${row.theirScore}`,
    row.mode === 'casual' ? 'Casual duel' : `${change >= 0 ? '+' : ''}${change} rating · ${me.rank.label}`,
  ];
  if (me.streak >= 2) lines.push(`🔥 ${me.streak} win streak`);
  const link = botLink(`ref_${me.referralCode}`);
  return {
    headline,
    lines,
    shareText: `${headline}\n${lines.join(' · ')}\n\n⚔️ Duel me on Duel Battle.`,
    link,
  };
}

function notifyChallengeAccepted(
  service: TelegramService,
  hostAccountId: string,
  guestAccountId: string,
  code: string,
  now: number,
): void {
  const guest = service.views.cardFor(guestAccountId, now);
  service.notifications.notify(
    {
      accountId: hostAccountId,
      kind: 'challenge-accepted',
      dedupeKey: `duel-accepted:${code}`,
      message: {
        text: `⚔️ <b>${escape(guest?.name ?? 'Someone')} accepted your duel.</b>\n${escape(guest?.rank ?? '')} · ${guest?.rating ?? 0} rating\n\nOpen the app and start it.`,
        buttons: service.miniAppUrl()
          ? [[{ text: '⚔️ Enter the duel', web_app: { url: `${service.miniAppUrl()}/duel` } }]]
          : [],
      },
    },
    now,
  );
}

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveRef(service: TelegramService, ref: string): string {
  const id = service.identities.accountForRef(ref);
  if (!id) throw new HttpError(404, 'No such player.');
  return id;
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function clampInt(value: string | null, min: number, max: number): number {
  const parsed = Number(value);
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * The same CSRF stance the auth routes already take.
 *
 * A custom header plus a JSON body forces a preflight that this server never
 * authorises, and the Origin is checked on top. A Mini App is served from this
 * origin even when Telegram frames it, so nothing here needs relaxing for it.
 */
function requireBrowserPost(req: IncomingMessage): void {
  if (req.method !== 'POST') throw new HttpError(405, 'Use POST for this action.');
  const origin = req.headers.origin;
  const proto = config.nodeEnv === 'production' ? 'https' : 'http';
  if (
    req.headers['x-battle-request'] !== '1' ||
    !origin ||
    (origin !== `${proto}://${req.headers.host}` && !config.allowedOrigins.includes(origin))
  )
    throw new HttpError(403, 'Open Duel Battle directly and try again.');
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new HttpError(415, 'Send JSON.');
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) {
    raw += String(chunk);
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.');
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new HttpError(400, 'Check that and try again.');
  }
}

/**
 * Takes one webhook delivery.
 *
 * The secret token is compared in constant time; a mismatch is a 404 rather
 * than a 401, because an endpoint that distinguishes "wrong secret" from "no
 * such route" is an endpoint that confirms it exists.
 *
 * The update id is recorded *before* the update is handled. Telegram retries
 * anything it thinks failed, and a retried `/start ref_…` that paid a referral
 * twice would be exactly the bug this row prevents.
 */
async function handleWebhook(
  req: IncomingMessage,
  bot: TelegramBot,
  service: TelegramService,
  now: number,
): Promise<void> {
  const provided = req.headers['x-telegram-bot-api-secret-token'];
  const expected = telegramConfig.webhookSecret;
  if (!expected) throw new HttpError(404, 'Not found.');
  const given = typeof provided === 'string' ? provided : '';
  if (
    given.length !== expected.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
    throw new HttpError(404, 'Not found.');

  const body = (await readJson(req)) as TelegramUpdate;
  if (!body || typeof body.update_id !== 'number' || !Number.isSafeInteger(body.update_id)) return;

  const fresh = service.db.sql
    .prepare('INSERT OR IGNORE INTO telegram_updates VALUES(?,?)')
    .run(body.update_id, now);
  if (!fresh.changes) {
    log.debug('telegram update already handled', { updateId: body.update_id });
    return;
  }
  try {
    await bot.handle(body, now);
  } catch (error) {
    service.db.sql.prepare('DELETE FROM telegram_updates WHERE update_id=?').run(body.update_id);
    throw error;
  }
}
