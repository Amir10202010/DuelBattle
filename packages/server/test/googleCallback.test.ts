import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose';
import type * as Jose from 'jose';
import { Database } from '../src/database.js';
import { AuthService } from '../src/auth.js';

// `googleCallback` verifies against a module-level remote JWKS, so the remote
// set is swapped for a local one signed by this test's own key pair.
const hoisted = vi.hoisted(() => ({ keys: null as JWTVerifyGetKey | null }));
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof Jose>();
  return {
    ...actual,
    createRemoteJWKSet: () => ((...args: Parameters<JWTVerifyGetKey>) => hoisted.keys!(...args)),
  };
});

const ORIGIN = 'http://localhost:5173';
const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

/** A ServerResponse stand-in that merges headers the way `writeHead` does. */
function fakeRes() {
  const headers: Record<string, string | string[]> = {};
  const res = {
    statusCode: 0,
    headers,
    setHeader(name: string, value: string | string[]) {
      headers[name.toLowerCase()] = value;
    },
    writeHead(status: number, extra?: Record<string, string>) {
      res.statusCode = status;
      for (const [k, v] of Object.entries(extra ?? {})) headers[k.toLowerCase()] = v;
      return res;
    },
    end() {},
  };
  return res;
}

const cookiesOf = (res: ReturnType<typeof fakeRes>) =>
  [res.headers['set-cookie'] ?? []].flat() as string[];
const cookieValue = (res: ReturnType<typeof fakeRes>, name: string) =>
  cookiesOf(res)
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1)
    .split(';')[0] ?? '';

let db: Database;
let auth: AuthService;
let privateKey: CryptoKey;

beforeEach(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID);
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('APP_ORIGIN', ORIGIN);
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  hoisted.keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test' }] });
  db = new Database(':memory:');
  auth = new AuthService(db);
});
afterEach(() => {
  db.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** Imports the provider and the logger it will actually call, together. */
async function providers() {
  const { AuthProviders } = await import('../src/authProviders.js');
  const { log } = await import('../src/log.js');
  return { provider: new AuthProviders(auth), log };
}

/** Runs the browser's half of the round trip: start, Google, callback. */
async function roundTrip(identity: { sub: string; email: string; name?: string }) {
  const { provider } = await providers();
  const start = fakeRes();
  provider.googleStart(start as unknown as ServerResponse);
  const authorize = new URL(String(start.headers.location));
  const state = authorize.searchParams.get('state')!;
  const nonce = authorize.searchParams.get('nonce')!;
  const idToken = await new SignJWT({
    email: identity.email,
    email_verified: true,
    name: identity.name ?? 'Player',
    nonce,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(identity.sub)
    .setIssuer('https://accounts.google.com')
    .setAudience(CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ id_token: idToken }), { status: 200 })),
  );
  const req = {
    url: `/api/auth/google/callback?code=auth-code&state=${state}`,
    headers: { cookie: cookiesOf(start)[0]!.split(';')[0]! },
  } as unknown as IncomingMessage;
  const callback = fakeRes();
  await provider.googleCallback(req, callback as unknown as ServerResponse);
  return callback;
}

describe('Google sign-in round trip', () => {
  it('signs a new player in and lands them on the dashboard', async () => {
    const res = await roundTrip({ sub: 'google-1', email: 'player@example.test' });
    expect(res.headers.location).toBe('/home');
    expect(auth.resolve(cookieValue(res, 'battle_session'))).not.toBeNull();
  });

  it('signs the same player back in on a later visit', async () => {
    await roundTrip({ sub: 'google-1', email: 'player@example.test' });
    const res = await roundTrip({ sub: 'google-1', email: 'player@example.test' });
    expect(res.headers.location).toBe('/home');
    expect(auth.resolve(cookieValue(res, 'battle_session'))).not.toBeNull();
    expect(db.sql.prepare('SELECT count(*) AS n FROM accounts').get()!.n).toBe(1);
  });

  it('says why it bounced a player back to the login page', async () => {
    const { provider, log } = await providers();
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const start = fakeRes();
    provider.googleStart(start as unknown as ServerResponse);
    const state = new URL(String(start.headers.location)).searchParams.get('state')!;
    // The cookie the browser sends back belongs to an older attempt.
    const req = {
      url: `/api/auth/google/callback?code=auth-code&state=${state}`,
      headers: { cookie: `battle_oauth=${'0'.repeat(64)}` },
    } as unknown as IncomingMessage;
    const res = fakeRes();
    await provider.googleCallback(req, res as unknown as ServerResponse);
    expect(res.headers.location).toBe('/login?auth_error=google');
    expect(warn).toHaveBeenCalledWith('google sign-in failed', {
      reason: 'Invalid OAuth state',
    });
  });

  it('names the missing configuration rather than failing silently', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.resetModules();
    const { provider } = await providers();
    expect(provider.options().google).toBe(false);
    expect(provider.googleGap()).toMatch(/GOOGLE_CLIENT_ID/);
  });

  it('refuses a callback while Google is unconfigured, and says so', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    vi.resetModules();
    const { provider, log } = await providers();
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    const res = fakeRes();
    await provider.googleCallback(
      { url: '/api/auth/google/callback?code=c', headers: {} } as unknown as IncomingMessage,
      res as unknown as ServerResponse,
    );
    expect(res.headers.location).toBe('/login?auth_error=google');
    expect(warn.mock.calls[0]?.[1]).toMatchObject({
      reason: expect.stringContaining('GOOGLE_CLIENT_ID'),
    });
  });
});
