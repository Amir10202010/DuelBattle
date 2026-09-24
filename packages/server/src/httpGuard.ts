import type { IncomingMessage, ServerResponse } from 'node:http';
import { AuthError } from './auth.js';
import { config } from './config.js';

/**
 * Whether a request came from a page this server serves.
 *
 * The Origin header, scheme included, must be this host or one of the
 * explicitly allowed origins. Browsers send it on every POST, including the
 * ones `sendBeacon` makes, and a page on another site cannot forge it.
 */
export function fromOurOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  const proto = config.nodeEnv === 'production' ? 'https' : 'http';
  return Boolean(origin) && (origin === `${proto}://${req.headers.host}` || config.allowedOrigins.includes(origin!));
}

/**
 * The gate every state-changing request passes.
 *
 * A custom header plus a JSON body means a cross-site page cannot send this
 * without a preflight, which this server never answers; the Origin check is
 * the second lock on the same door. SameSite on the cookie is not relied on.
 */
export function assertMutation(req: IncomingMessage): void {
  if (req.headers['x-battle-request'] !== '1' || !fromOurOrigin(req))
    throw new AuthError(403, 'Open DuelBattle directly and try again.');
  if (!req.headers['content-type']?.startsWith('application/json')) throw new AuthError(415, 'Send JSON.');
}

/** The raw body, refused past a size ceiling. Webhook signatures need it byte for byte. */
export async function readRaw(req: IncomingMessage, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > limit) throw new AuthError(413, 'That request is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req: IncomingMessage, limit = 4096): Promise<unknown> {
  const raw = await readRaw(req, limit);
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw new AuthError(400, 'Check the form and try again.');
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}
