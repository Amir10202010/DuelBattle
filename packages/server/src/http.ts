import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { normalizeRoomCode } from '@battle/shared';
import type { RoomManager } from './rooms.js';
import { config } from './config.js';
import { TokenBuckets, type LimiterOptions } from './limiter.js';
import { log } from './log.js';
import type { AuthService } from './auth.js';
import { authHttp } from './authHttp.js';
import type { MetaService } from './meta/service.js';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.tflite': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};

export interface HttpOptions {
  clientDir: string;
  rooms: RoomManager;
  auth?: AuthService;
  /** Handles the lobby API, analytics, the Stripe webhook and the dashboard. */
  meta?: (req: IncomingMessage, res: ServerResponse, path: string, ip: string) => Promise<boolean>;
  /** The service behind it, for the economy routes that feed quests. */
  metaService?: MetaService;
  /** Handles `/api/telegram/*`. Absent when this deployment has no bot. */
  telegram?: (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    ip: string,
  ) => Promise<boolean>;
}

/**
 * Per-IP budget for the room lookup.
 *
 * The endpoint exists so the join screen can say "no room with that code"
 * before asking anyone for a camera, but unmetered it is also a way to sweep
 * the code space for rooms with a free seat and drop in on strangers. A code is
 * one of 32^5, so a handful of guesses a minute costs an attacker centuries and
 * costs a real player nothing.
 */
const LOOKUP_LIMIT: LimiterOptions = { burst: 20, refillPerSec: 0.5 };

/**
 * Where the Telegram Mini App lives.
 *
 * A prefix rather than an exact path, because the Mini App has its own routes
 * under it and every one of them has to be reloadable inside Telegram.
 */
const TELEGRAM_PREFIX = '/tg';

/**
 * Origins Telegram serves its web clients from.
 *
 * On a phone a Mini App is a native WebView and none of this matters. On
 * Telegram Desktop and Telegram Web it is an **iframe** hosted by one of these,
 * so a blanket `frame-ancestors 'none'` — which is right for the rest of the
 * app — turns the Mini App into a blank pane on every desktop client.
 */
const TELEGRAM_FRAME_ANCESTORS = 'https://web.telegram.org https://telegram.org https://*.telegram.org';

/**
 * Sent with the app document.
 *
 * `connect-src 'self'` covers the WebSocket: under CSP3 a same-origin ws:// or
 * wss:// endpoint matches 'self', so the socket needs no wildcard. `img-src`
 * has to allow data: because every camera frame and every piece of evidence
 * arrives as a data URL.
 *
 * The Telegram variant differs in exactly three ways, and no more: it may be
 * framed by Telegram, it may load Telegram's own Mini App SDK, and it may show
 * a Telegram profile photograph. Everything else — including the ban on
 * inline script and on any other origin — is unchanged, and the ordinary app
 * keeps the original headers byte for byte.
 */
function documentHeaders(pathname: string): Record<string, string> {
  const telegram = pathname === TELEGRAM_PREFIX || pathname.startsWith(`${TELEGRAM_PREFIX}/`);
  const csp = [
    "default-src 'self'",
    telegram ? "script-src 'self' 'wasm-unsafe-eval' https://telegram.org" : "script-src 'self' 'wasm-unsafe-eval'",
    "worker-src 'self'",
    // React writes inline style attributes for the timer and detection bars.
    "style-src 'self' 'unsafe-inline'",
    telegram ? "img-src 'self' data: blob: https://t.me" : "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    telegram ? `frame-ancestors ${TELEGRAM_FRAME_ANCESTORS}` : "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
  return {
    'content-security-policy': csp,
    'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
    'referrer-policy': 'no-referrer',
    // X-Frame-Options has no allow-list, so a document Telegram must be able to
    // frame cannot send one at all; `frame-ancestors` above is the control.
    ...(telegram ? {} : { 'x-frame-options': 'DENY' }),
  };
}

export function createHttpServer(options: HttpOptions): Server {
  const clientRoot = options.clientDir ? resolve(options.clientDir) : '';
  const lookupLimiter = new TokenBuckets(LOOKUP_LIMIT);
  const authentication = options.auth ? authHttp(options.auth, options.metaService) : null;

  return createServer(
    {
      requestTimeout: 15_000,
      headersTimeout: 10_000,
      keepAliveTimeout: 5_000,
      maxHeaderSize: 16_384,
    },
    (req, res) => {
      res.setHeader('x-content-type-options', 'nosniff');
      if (config.nodeEnv === 'production')
        res.setHeader('strict-transport-security', 'max-age=31536000');
      let path: string;
      try {
        path = new URL(req.url ?? '/', 'http://localhost').pathname;
      } catch {
        json(res, 400, { error: 'Invalid request URL.' });
        return;
      }
      void (async () => {
        const ip = clientKey(req);
        if (options.telegram && (await options.telegram(req, res, path, ip))) return;
        if (options.meta && (await options.meta(req, res, path, ip))) return;
        if (authentication && (await authentication(req, res, path, ip))) return;
        await handle(req, res, options, clientRoot, lookupLimiter);
      })().catch(() => {
        log.error('request failed', {
          path,
        });
        if (!res.headersSent)
          json(res, 503, { error: 'We could not save that right now. Try again shortly.' });
        else res.end();
      });
    },
  );
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpOptions,
  clientRoot: string,
  lookupLimiter: TokenBuckets,
): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    json(res, 405, { error: 'method-not-allowed' });
    return;
  }

  if (url.pathname === '/healthz') {
    json(res, 200, { ok: true, ...options.rooms.stats(), uptimeSec: Math.round(process.uptime()) });
    return;
  }
  if (url.pathname === '/readyz') {
    try {
      options.auth?.db.sql.prepare('SELECT 1').get();
      json(res, 200, { ready: true });
    } catch {
      json(res, 503, { ready: false });
    }
    return;
  }
  if (!options.auth && url.pathname === '/api/auth/session') {
    json(res, 200, { account: null, profile: null, serverTime: Date.now() });
    return;
  }

  // Lets the join screen tell someone their code is wrong before they hand over
  // a camera permission prompt.
  const roomLookup = /^\/api\/rooms\/([^/]+)$/.exec(url.pathname);
  if (roomLookup) {
    if (!lookupLimiter.take(clientKey(req), Date.now())) {
      res.setHeader('retry-after', '30');
      json(res, 429, { error: 'rate-limited' });
      return;
    }
    let code: string;
    try {
      code = normalizeRoomCode(decodeURIComponent(roomLookup[1] ?? ''));
    } catch {
      json(res, 404, { exists: false });
      return;
    }
    const room = options.rooms.get(code);
    if (!room) {
      json(res, 404, { exists: false });
      return;
    }
    json(res, 200, {
      exists: true,
      hasFreeSeat: room.hasFreeSeat,
      players: room.playerCount,
      phase: room.phase,
    });
    return;
  }

  if (!clientRoot || url.pathname.startsWith('/api/')) {
    json(res, 404, { error: 'not-found' });
    return;
  }
  await serveStatic(req, res, url.pathname, clientRoot);
}

async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  root: string,
): Promise<void> {
  const requested = safeJoin(root, pathname);
  // Anything outside the build directory, or any unknown path, falls through to
  // the SPA entry point so deep links such as /r/AB12C load the app.
  let filePath = requested ?? join(root, 'index.html');

  let stat = await statOrNull(filePath);
  if ((!stat || stat.isDirectory()) && pathname.startsWith('/vision-runtime/')) {
    json(res, 404, { error: 'vision-asset-missing' });
    return;
  }
  if (!stat || stat.isDirectory()) {
    filePath = join(root, 'index.html');
    stat = await statOrNull(filePath);
  }
  if (!stat) {
    json(res, 404, { error: 'not-found' });
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const isEntry = filePath === join(root, 'index.html');
  // Keyed off the requested path rather than the file: the SPA serves one
  // document for every route, and it is the route that says whether Telegram
  // is allowed to frame it.
  const entryHeaders = isEntry ? documentHeaders(pathname) : {};
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': stat.size,
    // Vite fingerprints assets, so everything but the entry document is immutable.
    'cache-control': isEntry || pathname === '/vision-runtime/tracker.js'
      ? 'no-cache'
      : pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
    ...entryHeaders,
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath)
    .on('error', () => res.destroy())
    .pipe(res);
}

function clientKey(req: IncomingMessage): string {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
    if (first) return first.trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Resolves a URL path inside `root`, or null if it tries to escape. */
function safeJoin(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const candidate = resolve(join(root, normalize(decoded)));
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

async function statOrNull(path: string) {
  try {
    return await fs.stat(path);
  } catch {
    return null;
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  });
  res.end(text);
}
