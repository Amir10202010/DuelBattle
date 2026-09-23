import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { PROTOCOL_VERSION, type ServerMessage } from '@battle/shared';
import { Database } from '../src/database.js';
import { AuthService } from '../src/auth.js';
import { createApp, type App } from '../src/app.js';
import { Identities } from '../src/identity.js';

let app: App;
const sockets: WebSocket[] = [];
afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  if (app) await app.close();
});
async function setup() {
  const db = new Database(':memory:');
  const auth = new AuthService(db);
  app = createApp({
    profiles: db,
    auth,
    identities: new Identities(Buffer.from('a-test-secret-that-is-long-enough-for-tests')),
  });
  const port = await app.listen(0, '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;
  const request = (
    action: string,
    body: unknown = {},
    cookie = '',
    headers: Record<string, string> = {},
  ) =>
    fetch(`${url}/api/auth/${action}`, {
      method: 'POST',
      headers: {
        origin: url,
        'content-type': 'application/json',
        'x-battle-request': '1',
        cookie,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { db, auth, port, url, request };
}
async function socketAt(port: number, cookie = '') {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
    headers: { cookie, origin: `http://127.0.0.1:${port}` },
  });
  sockets.push(socket);
  const messages: ServerMessage[] = [];
  socket.on('message', (raw) => messages.push(JSON.parse(String(raw)) as ServerMessage));
  await new Promise<void>((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  socket.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL_VERSION }));
  return {
    socket,
    messages,
    send: (input: unknown) => socket.send(JSON.stringify(input)),
    wait: async (predicate: (m: ServerMessage) => boolean) => {
      const deadline = Date.now() + 3000;
      while (Date.now() < deadline) {
        const found = messages.find(predicate);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error('Expected WebSocket event did not arrive');
    },
  };
}
const accountInput = {
  username: 'integration_player',
  name: 'Integration Player',
  password: 'Integration-test-password',
};

async function verifiedRegistration(request: Awaited<ReturnType<typeof setup>>['request']) {
  const start = await request('register', { email: 'player@example.test' });
  expect(start.status).toBe(202);
  expect(start.headers.get('set-cookie')).toBeNull();
  const { challenge, developmentCode: code } = await start.json();
  return request('email/verify', { challenge, code, name: accountInput.name, password: accountInput.password });
}

describe('real authentication HTTP and socket boundaries', () => {
  it('registers, onboards, restores and signs out with a revocable cookie', async () => {
    const { request, url } = await setup();
    const anonymous = await fetch(`${url}/api/auth/session`);
    expect((await anonymous.json()).account).toBeNull();
    const registered = await verifiedRegistration(request);
    expect(registered.status).toBe(201);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    /*
     * Lax, not Strict.
     *
     * Signing in with Google ends with Google navigating the browser to our
     * callback, which sets this cookie and redirects on to `/home`. A browser
     * withholds a `Strict` cookie for the whole of a navigation chain a third
     * party started, so that last hop would arrive with no session and the
     * player would land on a logged-out page seconds after signing in. `Lax`
     * rides a top-level GET navigation, which is exactly that hop.
     *
     * Nothing is traded away: mutations are POST-only and additionally demand
     * the `x-battle-request` header and a matching `Origin`, so CSRF is held
     * off by those rather than by SameSite, and no GET route changes state.
     */
    const attributes = registered.headers.get('set-cookie')!;
    expect(attributes).toMatch(/SameSite=Lax/i);
    expect(attributes).toMatch(/HttpOnly/i);
    const created = await registered.json();
    expect(created.account.onboarded).toBe(false);
    expect(created.profile.rating).toBe(1000);
    expect(created).not.toHaveProperty('token');
    const onboarded = await request('onboard', {}, cookie);
    expect((await onboarded.json()).account.onboarded).toBe(true);
    const restored = await fetch(`${url}/api/auth/session`, { headers: { cookie } });
    expect((await restored.json()).account.username).toBe(created.account.username);
    expect((await request('logout', {}, cookie)).status).toBe(200);
    const ended = await fetch(`${url}/api/auth/session`, { headers: { cookie } });
    expect((await ended.json()).account).toBeNull();
    expect((await request('onboard', {}, cookie)).status).toBe(401);
  });
  it('rejects cross-origin mutations, forged fields, bad JSON and oversized inputs', async () => {
    const { request, url } = await setup();
    expect(
      (await request('register', accountInput, '', { origin: 'https://attacker.example' })).status,
    ).toBe(403);
    expect((await request('register', accountInput, '', { 'x-battle-request': '' })).status).toBe(
      403,
    );
    expect((await request('register', { ...accountInput, rating: 99999 })).status).toBe(400);
    expect((await request('register', { ...accountInput, name: 'x'.repeat(5000) })).status).toBe(
      413,
    );
    const bad = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { origin: url, 'x-battle-request': '1', 'content-type': 'application/json' },
      body: '{invalid',
    });
    expect(bad.status).toBe(400);
    expect((await fetch(`${url}/api/not-real`)).status).toBe(404);
  });
  it('rate limits sign-in attempts before password work', async () => {
    const { request } = await setup();
    for (let i = 0; i < 8; i++) expect((await request('login', {})).status).toBe(400);
    const denied = await request('login', {});
    expect(denied.status).toBe(429);
    expect(denied.headers.get('retry-after')).toBeTruthy();
  });
  it('permits casual guest play and refuses progression and client-supplied scores', async () => {
    const { port } = await setup();
    const guest = await socketAt(port);
    guest.send({ t: 'leaderboard', board: 'rating' });
    expect(await guest.wait((m) => m.t === 'error')).toMatchObject({ t: 'error' });
    guest.messages.length = 0;
    guest.send({ t: 'findMatch', name: 'Guest', mode: 'ranked' });
    expect(await guest.wait((m) => m.t === 'error')).toMatchObject({ t: 'error' });
    guest.messages.length = 0;
    guest.send({ t: 'setProfile', name: 'Impostor' });
    expect(await guest.wait((m) => m.t === 'error')).toMatchObject({ t: 'error' });
    guest.messages.length = 0;
    guest.send({
      t: 'submit',
      roundId: 'round1',
      image: 'data:image/jpeg;base64,aaaa',
      score: 100,
      rating: 9000,
    });
    expect(await guest.wait((m) => m.t === 'error')).toMatchObject({
      t: 'error',
      code: 'bad-message',
    });
    guest.send({ t: 'findMatch', name: 'Guest', mode: 'casual' });
    expect(await guest.wait((m) => m.t === 'queued')).toMatchObject({ t: 'queued' });
  });
  it('rejects socket authority after the account session is revoked', async () => {
    const { request, port } = await setup();
    const registered = await verifiedRegistration(request);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const player = await socketAt(port, cookie);
    player.send({ t: 'leaderboard', board: 'rating' });
    expect(await player.wait((m) => m.t === 'leaderboard')).toMatchObject({
      t: 'leaderboard',
      total: 0,
    });
    await request('logout', {}, cookie);
    player.send({ t: 'findMatch', name: 'Player', mode: 'ranked' });
    expect(await player.wait((m) => m.t === 'error')).toMatchObject({
      t: 'error',
      code: 'session-expired',
      fatal: true,
    });
  });
  it('protects the shop, ignores duplicate purchases and rejects forged prices and ownership', async () => {
    const { request, url, db } = await setup();
    expect((await fetch(`${url}/api/economy`)).status).toBe(401);
    const registered = await verifiedRegistration(request);
    const cookie = registered.headers.get('set-cookie')!.split(';')[0]!;
    const post = (action: string, body: unknown) => fetch(`${url}/api/economy/${action}`, {
      method: 'POST', headers: { origin: url, 'x-battle-request': '1', 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
    const initial = await fetch(`${url}/api/economy`, { headers: { cookie } });
    expect(await initial.json()).toMatchObject({ coins: 160, loadout: { weapon: 'mitten' } });
    // The embedded Telegram client uses the same wallet with no browser cookie.
    const authorization = `Bearer ${cookie.slice('battle_session='.length)}`;
    expect(await (await fetch(`${url}/api/economy`, { headers: { authorization } })).json()).toMatchObject({ coins: 160 });
    expect((await fetch(`${url}/api/economy/equip`, {
      method: 'POST', headers: { authorization, origin: url, 'x-battle-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ itemId: 'cloud' }),
    })).status).toBe(200);
    expect((await post('buy', { itemId: 'visor', price: 0, accountId: 'someone-else' })).status).toBe(400);
    expect((await post('equip', { itemId: 'comet' })).status).toBe(403);
    const purchases = await Promise.all([post('buy', { itemId: 'visor' }), post('buy', { itemId: 'visor' })]);
    for (const response of purchases) expect(await response.json()).toMatchObject({ coins: 80 });
    expect(db.sql.prepare("SELECT count(*) AS n FROM economy_ledger WHERE receipt='purchase:visor'").get()!.n).toBe(1);
    expect(await (await post('equip', { itemId: 'visor' })).json()).toMatchObject({ loadout: { accessory: 'visor' } });
    const session = await fetch(`${url}/api/auth/session`, { headers: { cookie } });
    expect((await session.json()).profile.loadout.accessory).toBe('visor');
    expect((await (await post('unequip', { slot: 'accessory' })).json()).loadout.accessory).toBeUndefined();
    expect((await post('buy', { itemId: 'comet' })).status).toBe(409);
    const claim = await post('daily', {});
    expect(await claim.json()).toMatchObject({ coins: 110, granted: 30 });
    expect(await (await post('daily', {})).json()).toMatchObject({ coins: 110, granted: 0 });
    await request('logout', {}, cookie);
    expect((await post('buy', { itemId: 'visor' })).status).toBe(401);
  });

  /**
   * The two Google routes are opened by a top-level browser navigation, so
   * whatever they answer with is what the player is left looking at. A JSON
   * body is a dead end there: no navigation back, no explanation they can
   * read. Every refusal has to come back as the login page carrying a reason.
   */
  it('sends a blocked Google sign-in back to the login page, never raw JSON', async () => {
    const { url } = await setup();
    const unconfigured = await fetch(`${url}/api/auth/google`, { redirect: 'manual' });
    expect(unconfigured.status).toBe(303);
    expect(unconfigured.headers.get('location')).toBe('/login?auth_error=google_unavailable');
    expect(unconfigured.headers.get('content-type')).toBeNull();
    expect(await unconfigured.text()).toBe('');

    // Burn the per-IP budget, then confirm the limiter answers the same way.
    let limited: Response | null = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await fetch(`${url}/api/auth/google/callback?state=x`, {
        redirect: 'manual',
      });
      if (response.headers.get('location') === '/login?auth_error=busy') {
        limited = response;
        break;
      }
    }
    expect(limited?.status).toBe(303);
  });
});
