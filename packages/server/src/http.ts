import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { normalizeRoomCode } from '@battle/shared';
import type { RoomManager } from './rooms.js';
import { log } from './log.js';

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
  '.webmanifest': 'application/manifest+json',
};

export interface HttpOptions {
  clientDir: string;
  rooms: RoomManager;
}

/**
 * Sent with the app document.
 *
 * `connect-src 'self'` covers the WebSocket: under CSP3 a same-origin ws:// or
 * wss:// endpoint matches 'self', so the socket needs no wildcard. `img-src`
 * has to allow data: because every camera frame and every piece of evidence
 * arrives as a data URL.
 */
const DOCUMENT_HEADERS: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    // React writes inline style attributes for the timer and detection bars.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; '),
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

export function createHttpServer(options: HttpOptions): Server {
  const clientRoot = options.clientDir ? resolve(options.clientDir) : '';

  return createServer((req, res) => {
    void handle(req, res, options, clientRoot).catch((err) => {
      log.error('request failed', {
        url: req.url,
        error: err instanceof Error ? err.stack ?? err.message : String(err),
      });
      if (!res.headersSent) json(res, 500, { error: 'internal' });
      else res.end();
    });
  });
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpOptions,
  clientRoot: string,
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

  // Lets the join screen tell someone their code is wrong before they hand over
  // a camera permission prompt.
  const roomLookup = /^\/api\/rooms\/([^/]+)$/.exec(url.pathname);
  if (roomLookup) {
    const room = options.rooms.get(normalizeRoomCode(decodeURIComponent(roomLookup[1] ?? '')));
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

  if (!clientRoot) {
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
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': stat.size,
    // Vite fingerprints assets, so everything but the entry document is immutable.
    'cache-control': isEntry ? 'no-cache' : 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
    ...(isEntry ? DOCUMENT_HEADERS : {}),
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
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
