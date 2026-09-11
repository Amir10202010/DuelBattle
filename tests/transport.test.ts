import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { PROTOCOL_VERSION, type Profile, type Reply, type RoomSnapshot } from '../shared/protocol';

describe('real HTTP and Socket.IO trust boundary', () => {
  let instance: Awaited<ReturnType<typeof createApp>>;
  let url: string;
  const origin = 'http://localhost:3199';
  const sockets: Socket[] = [];
  beforeAll(async () => {
    instance = await createApp({ databasePath: ':memory:', origin, production: true });
    await new Promise<void>((resolve) => instance.http.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(instance.http.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await instance.close();
  });
  async function identity() {
    const response = await fetch(`${url}/api/session`);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    const profile = (await response.json()) as Profile;
    return { cookie, profile };
  }
  async function client(cookie: string, csrf: string, requestOrigin = origin) {
    const socket = connect(url, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      auth: { csrf, protocol: PROTOCOL_VERSION },
      extraHeaders: { Cookie: cookie, Origin: requestOrigin },
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
      socket.connect();
    });
    return socket;
  }
  async function action<T>(socket: Socket, event: string, data: unknown) {
    return (await socket.timeout(3000).emitWithAck(event, data)) as Reply<T>;
  }
  it('serves health, noncacheable session and hardened HttpOnly cookie', async () => {
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
    const r = await fetch(`${url}/api/session`);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(r.headers.get('set-cookie')).toContain('HttpOnly');
    expect(r.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect(r.headers.get('set-cookie')).toContain('Secure');
    expect(r.headers.get('content-security-policy')).toContain("object-src 'none'");
    expect(r.headers.get('permissions-policy')).toContain('camera=(self)');
  });
  it('rejects unauthenticated WebSocket, forged CSRF and foreign origins', async () => {
    const { cookie, profile } = await identity();
    await expect(client('', profile.csrf)).rejects.toThrow();
    await expect(client(cookie, 'forged')).rejects.toThrow();
    await expect(client(cookie, profile.csrf, 'https://attacker.example')).rejects.toThrow();
  });
  it('creates and joins through real transport, rejects forged premium/winner and unauthorized review', async () => {
    const alice = await identity(),
      bob = await identity(),
      stranger = await identity();
    const a = await client(alice.cookie, alice.profile.csrf),
      b = await client(bob.cookie, bob.profile.csrf),
      c = await client(stranger.cookie, stranger.profile.csrf);
    const invalid = await action(a, 'create', { name: 'Alex', premium: true });
    expect(invalid.ok).toBe(false);
    const created = await action<{ code: string }>(a, 'create', { name: 'Alex' });
    if (!created.ok) throw new Error(created.error);
    const roomCode = created.data.code;
    const joined = await action<RoomSnapshot>(b, 'join', { roomCode, name: 'Jamie' });
    expect(joined.ok).toBe(true);
    const denied = await action(c, 'ready', { roomCode, ready: true });
    expect(denied).toMatchObject({ ok: false, code: 'NOT_MEMBER' });
    const spoof = await action(a, 'ready', { roomCode, ready: true, score: 99 });
    expect(spoof).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    const third = await action(c, 'join', { roomCode, name: 'Sam' });
    expect(third).toMatchObject({ ok: false, code: 'ROOM_FULL' });
    const duplicateSocket = await client(alice.cookie, alice.profile.csrf);
    expect(await action(duplicateSocket, 'join', { roomCode, name: 'Alex' })).toMatchObject({
      ok: false,
      code: 'DUPLICATE_JOIN',
    });
    const signal = await action(c, 'signal', {
      roomCode,
      description: { type: 'offer', sdp: 'v=0' },
    });
    expect(signal).toMatchObject({ ok: false, code: 'NOT_MEMBER' });
    await action(a, 'media', { roomCode, camera: true, microphone: false });
    await action(b, 'media', { roomCode, camera: true, microphone: false });
    await action(a, 'ready', { roomCode, ready: true });
    await action(b, 'ready', { roomCode, ready: true });
    expect(instance.engine.snapshot(roomCode).state).toBe('COUNTDOWN');
    const before = instance.engine.snapshot(roomCode).round!.id;
    a.disconnect();
    await new Promise<void>((resolve) => b.once('snapshot', () => resolve()));
    expect(instance.engine.snapshot(roomCode).state).toBe('RECONNECTING');
    const reconnected = await client(alice.cookie, alice.profile.csrf);
    expect((await action(reconnected, 'join', { roomCode, name: 'Alex' })).ok).toBe(true);
    await action(reconnected, 'media', { roomCode, camera: true, microphone: false });
    expect(instance.engine.snapshot(roomCode).state).toBe('COUNTDOWN');
    expect(instance.engine.snapshot(roomCode).round!.id).not.toBe(before);
  });
  it('protects ICE configuration and never exposes TURN secrets', async () => {
    const { cookie } = await identity();
    expect((await fetch(`${url}/api/ice`)).status).toBe(401);
    const response = await fetch(`${url}/api/ice`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain('TURN_SECRET');
  });
  it('caps concurrent sockets per identity even without joining a room', async () => {
    const { cookie, profile } = await identity();
    const opened = [];
    for (let i = 0; i < 4; i++) opened.push(await client(cookie, profile.csrf));
    await expect(client(cookie, profile.csrf)).rejects.toThrow('Too many open connections');
    opened.forEach((socket) => socket.disconnect());
  });
});
