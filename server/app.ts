import express from 'express';
import helmet from 'helmet';
import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { Server } from 'socket.io';
import type { ZodType } from 'zod';
import { actionSchemas, type Ack, type ClientEvents, type ServerEvents } from '../shared/protocol';
import { Store, type Session } from './store';
import { GameEngine, type GameConfig } from './game';
import { GameError } from './errors';
import { RateLimiter } from './rate-limit';

interface AppConfig {
  databasePath: string;
  origin: string;
  production?: boolean;
  game?: Partial<GameConfig>;
  trustProxy?: boolean;
}
function cookieToken(cookie?: string) {
  return cookie
    ?.split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('duel_session='))
    ?.slice(13);
}
function equal(a: unknown, b: string) {
  return (
    typeof a === 'string' &&
    a.length === b.length &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}

export async function createApp(config: AppConfig) {
  const app = express();
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  const http = createServer(app);
  const store = new Store(config.databasePath);
  const limits = new RateLimiter();
  const socketsPerUser = new Map<string, number>();
  const peerIp = (socket: {
    handshake: { address: string; headers: Record<string, string | string[] | undefined> };
  }) => {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    const candidate =
      typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : undefined;
    return config.trustProxy && candidate && isIP(candidate) ? candidate : socket.handshake.address;
  };
  const originAllowed = (origin: string | undefined) => origin === config.origin;
  const io = new Server<ClientEvents, ServerEvents, Record<string, never>, { session: Session }>(
    http,
    {
      serveClient: false,
      maxHttpBufferSize: 140_000,
      pingInterval: 10_000,
      pingTimeout: 8_000,
      cors: { origin: config.origin, credentials: true },
      // Browsers omit Origin on same-origin polling GETs. Fetch Metadata plus the configured
      // Host permits those without admitting cross-site cookie-authenticated handshakes.
      allowRequest: (req, callback) =>
        callback(
          null,
          originAllowed(req.headers.origin) ||
            (!req.headers.origin &&
              req.headers['sec-fetch-site'] === 'same-origin' &&
              req.headers.host === new URL(config.origin).host),
        ),
    },
  );
  const engine = new GameEngine(
    store,
    (room) => io.to(room.code).emit('snapshot', room),
    Date.now,
    config.game,
  );
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              mediaSrc: ["'self'", 'blob:'],
              connectSrc: ["'self'", config.origin.replace(/^http/, 'ws')],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'self'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: config.production ? undefined : false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/session', (req, res) => {
    limits.take(`session:${req.ip}`, 60, 60_000);
    let session = store.session(cookieToken(req.headers.cookie));
    if (!session) {
      limits.take(`identity:${req.ip}`, 20, 60 * 60_000);
      const created = store.createSession();
      session = created.session;
      res.cookie('duel_session', created.token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: !!config.production,
        maxAge: 30 * 86_400_000,
        path: '/',
      });
    }
    res.json(store.profile(session));
  });
  app.get('/api/ice', (req, res) => {
    const session = store.session(cookieToken(req.headers.cookie));
    if (!session) {
      res.status(401).json({ error: 'Please refresh to reconnect.' });
      return;
    }
    limits.take(`ice:${session.id}`, 20, 60_000);
    const iceServers: RTCIceServer[] = [];
    const stun = process.env.STUN_URL ?? 'stun:stun.cloudflare.com:3478';
    if (stun) iceServers.push({ urls: stun });
    if (process.env.TURN_URLS && process.env.TURN_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + 3600}:${session.id}`;
      iceServers.push({
        urls: process.env.TURN_URLS.split(','),
        username,
        credential: createHmac('sha1', process.env.TURN_SECRET).update(username).digest('base64'),
      });
    }
    res.json({ iceServers, relayConfigured: !!process.env.TURN_URLS && !!process.env.TURN_SECRET });
  });
  io.use((socket, next) => {
    try {
      limits.take(`connect:${peerIp(socket)}`, 120, 60_000);
      const session = store.session(cookieToken(socket.handshake.headers.cookie));
      if (!session || !equal(socket.handshake.auth.csrf, session.csrf)) {
        next(new Error('Your session expired. Refresh to reconnect.'));
        return;
      }
      if ((socketsPerUser.get(session.id) ?? 0) >= 4 || io.engine.clientsCount > 2000) {
        next(new Error('Too many open connections. Close an unused tab and try again.'));
        return;
      }
      socket.data.session = session;
      next();
    } catch {
      next(new Error('Too many connections. Try again shortly.'));
    }
  });
  io.on('connection', (socket) => {
    const userId = socket.data.session.id;
    socketsPerUser.set(userId, (socketsPerUser.get(userId) ?? 0) + 1);
    const handle =
      <T, R = undefined>(schema: ZodType<T>, fn: (data: T) => R, limit = 80) =>
      (input: unknown, ack?: Ack<R>) => {
        if (typeof ack !== 'function') return;
        try {
          if (Date.now() >= socket.data.session.expiresAt)
            throw new GameError('SESSION_EXPIRED', 'Your session expired. Refresh to reconnect.');
          limits.take(`events:${userId}`, limit, 10_000);
          const parsed = schema.safeParse(input);
          if (!parsed.success)
            throw new GameError('INVALID_REQUEST', 'That request was not valid. Please try again.');
          ack({ ok: true, data: fn(parsed.data) });
        } catch (error) {
          if (!(error instanceof GameError))
            console.error(
              'Action failed',
              error instanceof Error ? error.message : 'Unknown error',
            );
          ack({
            ok: false,
            error:
              error instanceof GameError
                ? error.message
                : 'Something went wrong. Please try again.',
            code: error instanceof GameError ? error.code : 'INTERNAL_ERROR',
          });
        }
      };
    socket.on(
      'create',
      handle(actionSchemas.create, (data) => {
        limits.take(`create:${peerIp(socket)}`, 20, 60 * 60_000);
        const result = engine.create(userId, data.name, socket.id);
        void socket.join(result.code);
        socket.emit('snapshot', engine.snapshot(result.code));
        return result;
      }),
    );
    socket.on(
      'join',
      handle(actionSchemas.join, (data) => {
        const snapshot = engine.join(data.roomCode, userId, data.name, socket.id);
        void socket.join(data.roomCode);
        socket.emit('snapshot', snapshot);
        return snapshot;
      }),
    );
    socket.on(
      'ready',
      handle(actionSchemas.ready, (d) => engine.ready(d.roomCode, userId, socket.id, d.ready)),
    );
    socket.on(
      'media',
      handle(actionSchemas.media, (d) =>
        engine.media(d.roomCode, userId, socket.id, d.camera, d.microphone),
      ),
    );
    socket.on(
      'submit',
      handle(actionSchemas.submit, (d) =>
        engine.submit(d.roomCode, userId, socket.id, d.roundId, d.nonce, d.image),
      ),
    );
    socket.on(
      'review',
      handle(actionSchemas.review, (d) =>
        engine.review(d.roomCode, userId, socket.id, d.roundId, d.attemptId, d.accept),
      ),
    );
    socket.on(
      'rematch',
      handle(actionSchemas.rematch, (d) => engine.rematch(d.roomCode, userId, socket.id)),
    );
    socket.on(
      'leave',
      handle(actionSchemas.leave, (d) => {
        engine.leave(d.roomCode, userId, socket.id);
        void socket.leave(d.roomCode);
      }),
    );
    socket.on(
      'signal',
      handle(actionSchemas.signal, (d) => {
        engine.authorize(d.roomCode, userId, socket.id);
        limits.take(`signal:${userId}`, 120, 10_000);
        socket.to(d.roomCode).emit('signal', d);
      }),
    );
    socket.on('clock', (ack) => {
      if (typeof ack !== 'function') return;
      try {
        limits.take(`clock:${userId}`, 20, 10_000);
        ack(Date.now());
      } catch {
        /* Drop excessive read-only probes. */
      }
    });
    socket.on('disconnect', () => {
      const count = (socketsPerUser.get(userId) ?? 1) - 1;
      if (count) socketsPerUser.set(userId, count);
      else socketsPerUser.delete(userId);
      engine.disconnect(userId, socket.id);
    });
  });
  let vite: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;
  if (!config.production) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server: http } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(
      express.static(resolve('dist/client'), {
        maxAge: '1h',
        setHeaders: (res, path) => {
          if (path.includes('assets'))
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    app.get('/{*path}', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve('dist/client/index.html'));
    });
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (!(error instanceof GameError))
        console.error(
          'HTTP request failed',
          error instanceof Error ? error.message : 'Unknown error',
        );
      res.status(error instanceof GameError ? 429 : 500).json({
        error:
          error instanceof GameError
            ? error.message
            : 'The arena is temporarily unavailable. Try again shortly.',
      });
    },
  );
  const tick = setInterval(() => {
    try {
      engine.tick();
    } catch (error) {
      console.error('Game tick failed', error);
    }
  }, 100);
  const cleanup = setInterval(() => {
    try {
      limits.cleanup();
      store.cleanup(Date.now());
    } catch (error) {
      console.error('Cleanup failed', error);
    }
  }, 60_000);
  tick.unref();
  cleanup.unref();
  return {
    app,
    http,
    io,
    engine,
    store,
    close: async () => {
      clearInterval(tick);
      clearInterval(cleanup);
      await vite?.close();
      await new Promise<void>((r) => io.close(() => r()));
      store.close();
    },
  };
}
