import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { AuthError, type AuthService } from '../auth.js';
import { config } from '../config.js';
import { assertMutation, fromOurOrigin, readJson, readRaw, sendJson } from '../httpGuard.js';
import { TokenBuckets } from '../limiter.js';
import { log } from '../log.js';
import type { MetaService } from './service.js';
import type { StripeGateway } from './stripe.js';

const claimQuest = z.object({ questId: z.string().min(1).max(40) }).strict();
const claimTier = z.union([
  z.object({ tier: z.number().int().min(1).max(100), track: z.enum(['free', 'premium']) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
const buyOffer = z.object({ offerId: z.string().regex(/^[a-z0-9_]{1,24}$/) }).strict();
const buyDeal = z.object({ itemId: z.string().min(1).max(40) }).strict();

/**
 * The lobby's API: one read, a handful of claims, the shop and the dashboard.
 *
 * Every write is signed in, same-origin, rate-limited and one transaction. The
 * two exceptions to "signed in" are deliberate and narrow: the analytics
 * beacon, which only writes allow-listed event names, and the Stripe webhook,
 * which authenticates with Stripe's signature instead of a session.
 */
export function metaHttp(auth: AuthService, meta: MetaService, stripe?: StripeGateway) {
  const actions = new TokenBuckets({ burst: 20, refillPerSec: 2 });
  // Reads are cheap and a returning payment polls them; they get their own, roomier budget.
  const reads = new TokenBuckets({ burst: 60, refillPerSec: 4 });
  const beacons = new TokenBuckets({ burst: 30, refillPerSec: 0.5 });
  const checkouts = new TokenBuckets({ burst: 4, refillPerSec: 0.05 });

  return async (req: IncomingMessage, res: ServerResponse, path: string, ip: string): Promise<boolean> => {
    if (!path.startsWith('/api/meta') && path !== '/api/analytics' && path !== '/api/pay/stripe/webhook' && path !== '/api/admin/kpis')
      return false;
    try {
      const now = Date.now();

      if (path === '/api/pay/stripe/webhook') {
        if (req.method !== 'POST') throw new AuthError(405, 'Use POST.');
        if (!stripe?.configured) throw new AuthError(404, 'Not found.');
        const raw = await readRaw(req, 256 * 1024);
        const header = req.headers['stripe-signature'];
        const event = stripe.verify(raw, Array.isArray(header) ? header[0] : header, now);
        if (!event) {
          log.warn('stripe webhook with a bad signature');
          throw new AuthError(400, 'Invalid signature.');
        }
        meta.handleStripeEvent(event, now);
        sendJson(res, 200, { received: true });
        return true;
      }

      if (path === '/api/analytics') {
        if (req.method !== 'POST') throw new AuthError(405, 'Use POST.');
        if (!fromOurOrigin(req)) throw new AuthError(403, 'Open DuelBattle directly and try again.');
        if (!beacons.take(ip, now)) throw new AuthError(429, 'Slow down.');
        const account = auth.account(req);
        const kept = meta.analytics.trackClient(await readJson(req, 16 * 1024), account?.id ?? null, now);
        sendJson(res, 202, { kept });
        return true;
      }

      const account = auth.account(req);
      if (!account) throw new AuthError(401, 'Sign in to continue.');
      if (!(req.method === 'GET' ? reads : actions).take(account.id, now))
        throw new AuthError(429, 'Too many attempts. Wait a little and try again.');

      if (path === '/api/admin/kpis') {
        if (req.method !== 'GET') throw new AuthError(405, 'Use GET.');
        if (!meta.isAdmin(account.id)) throw new AuthError(403, 'This page is for operators.');
        sendJson(res, 200, meta.kpis(now));
        return true;
      }

      if (req.method === 'GET') {
        if (path === '/api/meta') {
          sendJson(res, 200, meta.view(account.id, now));
          return true;
        }
        const latest = /^\/api\/meta\/orders\/latest\/([a-z0-9_]{1,24})$/.exec(path);
        if (latest) {
          const since = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('since') ?? 0);
          const found = meta.shop.latestPaid(account.id, latest[1]!, Number.isFinite(since) ? since : 0);
          if (!found) throw new AuthError(404, 'Not delivered yet.');
          sendJson(res, 200, { status: 'paid', ...found });
          return true;
        }
        const order = /^\/api\/meta\/orders\/([a-f0-9]{24})$/.exec(path);
        if (order) {
          const status = meta.orderStatus(account.id, order[1]!);
          if (!status) throw new AuthError(404, 'Order not found.');
          sendJson(res, 200, status);
          return true;
        }
        throw new AuthError(404, 'Not found.');
      }

      if (req.method !== 'POST') throw new AuthError(405, 'Use POST for this action.');
      assertMutation(req);
      const input = await readJson(req);
      switch (path) {
        case '/api/meta/quests/claim':
          sendJson(res, 200, meta.claimQuest(account.id, claimQuest.parse(input).questId, now));
          return true;
        case '/api/meta/season/claim': {
          const body = claimTier.parse(input);
          sendJson(res, 200, 'all' in body ? meta.claimAllTiers(account.id, now) : meta.claimTier(account.id, body.tier, body.track, now));
          return true;
        }
        case '/api/meta/daily':
          z.object({}).strict().parse(input);
          sendJson(res, 200, meta.claimDaily(account.id, now));
          return true;
        case '/api/meta/buy':
          sendJson(res, 200, meta.buy(account.id, buyOffer.parse(input).offerId, now));
          return true;
        case '/api/meta/deal':
          sendJson(res, 200, meta.buyDeal(account.id, buyDeal.parse(input).itemId, now));
          return true;
        case '/api/meta/checkout': {
          if (!checkouts.take(account.id, now)) throw new AuthError(429, 'Give the last checkout a moment.');
          const origin = config.appOrigin || `${config.nodeEnv === 'production' ? 'https' : 'http'}://${req.headers.host}`;
          sendJson(res, 200, await meta.checkout(account.id, buyOffer.parse(input).offerId, origin, now));
          return true;
        }
        default:
          throw new AuthError(404, 'This action could not be found.');
      }
    } catch (error) {
      if (error instanceof AuthError) sendJson(res, error.status, { error: error.message });
      else if (error instanceof z.ZodError) sendJson(res, 400, { error: error.issues[0]?.message ?? 'Check the request.' });
      else {
        log.error('meta request failed', { path, errorType: error instanceof Error ? error.name : 'unknown' });
        sendJson(res, 503, { error: 'The result could not be confirmed. Refresh your balance before trying again.' });
      }
      return true;
    }
  };
}
