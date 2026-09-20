import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import {
  AuthError,
  type AuthService,
  credentialsSchema,
  sessionCookie,
} from './auth.js';
import { TokenBuckets } from './limiter.js';
import { config } from './config.js';
import { AuthProviders } from './authProviders.js';
import { dailyCoins, economyView, ensureWallet, equip, purchase, unequip } from './economy.js';
import { COSMETIC_SLOTS } from '@battle/shared';
import { log } from './log.js';

const recoverySchema = credentialsSchema.extend({ code: z.string().regex(/^[a-f0-9]{48}$/) });

export function authHttp(auth: AuthService) {
  const providers = new AuthProviders(auth);
  // Said once, at boot, for the same reason the Telegram integration says it:
  // a provider that is quietly off looks identical to one that is broken.
  const gap = providers.googleGap();
  if (gap) log.warn('google sign-in disabled', { reason: gap });
  else log.info('google sign-in enabled');
  const mutationBudget = new TokenBuckets({ burst: 8, refillPerSec: 0.05 });
  const economyBudget = new TokenBuckets({ burst: 30, refillPerSec: 1 });
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    ip: string,
  ): Promise<boolean> => {
    if (!path.startsWith('/api/auth/') && !path.startsWith('/api/economy')) return false;
    const respond = (status: number, body: unknown) => {
      res.writeHead(status, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (path === '/api/auth/providers' && req.method === 'GET') { respond(200, providers.options()); return true; }
      if (req.method === 'GET' && (path === '/api/auth/google' || path === '/api/auth/google/callback')) {
        if (!mutationBudget.take(ip, Date.now())) throw new AuthError(429, 'Too many attempts. Try again shortly.');
        if (path.endsWith('/callback')) await providers.googleCallback(req, res);
        else providers.googleStart(res);
        return true;
      }
      if (path === '/api/economy' && req.method === 'GET') {
        const account = auth.account(req);
        if (!account) throw new AuthError(401, 'Sign in to continue.');
        if (!economyBudget.take(account.id, Date.now())) throw new AuthError(429, 'Too many attempts. Wait a little and try again.');
        const result = auth.db.transaction(() => {
          ensureWallet(auth.db.sql, account.id, Date.now());
          return economyView(auth.db.sql, account.id, auth.db.get(account.id)!.xp, Date.now());
        });
        respond(200, result); return true;
      }
      if (path === '/api/auth/session' && req.method === 'GET') {
        const account = auth.account(req);
        respond(
          200,
          account ? auth.view(account) : { account: null, profile: null, serverTime: Date.now() },
        );
        return true;
      }
      if (req.method !== 'POST') throw new AuthError(405, 'Use POST for this action.');
      // Custom header + JSON requires a same-origin request or an explicit preflight,
      // which this server never authorizes. Validate Origin too, including scheme.
      const origin = req.headers.origin;
      const proto = config.nodeEnv === 'production' ? 'https' : 'http';
      if (
        req.headers['x-battle-request'] !== '1' ||
        !origin ||
        (origin !== `${proto}://${req.headers.host}` && !config.allowedOrigins.includes(origin))
      ) {
        throw new AuthError(403, 'Open DuelBattle directly and try again.');
      }
      if (!path.startsWith('/api/economy/') && !mutationBudget.take(ip, Date.now())) {
        res.setHeader('retry-after', '20');
        throw new AuthError(429, 'Too many attempts. Wait a little and try again.');
      }
      if (!req.headers['content-type']?.startsWith('application/json'))
        throw new AuthError(415, 'Send JSON.');
      let raw = '';
      for await (const chunk of req) {
        raw += String(chunk);
        if (Buffer.byteLength(raw) > 4096) throw new AuthError(413, 'That request is too large.');
      }
      let input: unknown;
      try {
        input = JSON.parse(raw || '{}');
      } catch {
        throw new AuthError(400, 'Check the form and try again.');
      }
      if (path === '/api/auth/register' || path === '/api/auth/email/start') {
        respond(202, await providers.startEmail(input));
      } else if (path === '/api/auth/email/verify') {
        const token = await providers.verifyEmail(input);
        res.setHeader('set-cookie', sessionCookie(token, config.nodeEnv === 'production'));
        respond(201, auth.view(auth.resolve(token)!));
      } else if (path === '/api/auth/login') {
        const token = await auth.login(credentialsSchema.parse(input));
        res.setHeader('set-cookie', sessionCookie(token, config.nodeEnv === 'production'));
        respond(200, auth.view(auth.resolve(token)!));
      } else if (path === '/api/auth/recover') {
        const data = recoverySchema.parse(input);
        const recovery = await auth.recover(data.username, data.code, data.password);
        respond(200, { recovery });
      } else {
        const account = auth.account(req);
        if (!account) throw new AuthError(401, 'Sign in to continue.');
        if (path.startsWith('/api/economy/')) {
          if (!economyBudget.take(account.id, Date.now())) throw new AuthError(429, 'Too many attempts. Wait a little and try again.');
          const result = auth.db.transaction(() => {
            ensureWallet(auth.db.sql, account.id, Date.now());
            const profile = auth.db.get(account.id)!;
            let granted = 0;
            if (path === '/api/economy/daily') {
              z.object({}).strict().parse(input);
              granted = dailyCoins(auth.db.sql, account.id, Date.now());
            } else if (path === '/api/economy/unequip') {
              const { slot } = z.object({ slot: z.enum(COSMETIC_SLOTS) }).strict().parse(input);
              unequip(auth.db.sql, account.id, slot);
            } else {
              const { itemId } = z.object({ itemId: z.string().min(1).max(40) }).strict().parse(input);
              if (path === '/api/economy/buy') purchase(auth.db.sql, account.id, itemId, profile.xp, Date.now());
              else if (path === '/api/economy/equip') equip(auth.db.sql, account.id, itemId);
              else throw new AuthError(404, 'This action could not be found.');
            }
            return { ...economyView(auth.db.sql, account.id, profile.xp, Date.now()), granted };
          });
          respond(200, result);
        } else if (path === '/api/auth/logout') {
          auth.logout(req);
          res.setHeader('set-cookie', sessionCookie('', config.nodeEnv === 'production'));
          respond(200, { account: null, profile: null });
        } else if (path === '/api/auth/onboard') {
          auth.db.sql.prepare('UPDATE accounts SET onboarded=1 WHERE id=?').run(account.id);
          respond(200, auth.view({ ...account, onboarded: true }));
        } else throw new AuthError(404, 'This action could not be found.');
      }
    } catch (error) {
      if (error instanceof AuthError) respond(error.status, { error: error.message });
      else if (error instanceof z.ZodError)
        respond(400, { error: error.issues[0]?.message ?? 'Check the form.' });
      else throw error;
    }
    return true;
  };
}
