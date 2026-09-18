import type { Server } from 'node:http';
import { config } from './config.js';
import { GeminiPhotoJudge, type AiJudge } from './ai/judge.js';
import { type ProfileStore } from './profiles.js';
import { Database } from './database.js';
import { AuthService } from './auth.js';
import { VerifiedJudge } from './ai/pipeline.js';
import { join } from 'node:path';
import { Identities } from './identity.js';
import { identitySecret } from './secret.js';
import { YoloObjectDetector } from './ai/detector.js';

/**
 * Builds the AI referee, if this deployment has one.
 *
 * No keys is a supported way to run the game, not a misconfiguration: the
 * prompts a referee would have taken simply stay with the opponent. A bad key
 * list is a misconfiguration, and says so rather than starting up pretending
 * the referee exists.
 */
/**
 * Ratings, if this deployment keeps any.
 *
 * An empty DATA_DIR is a supported way to run: matches play exactly the same,
 * they simply stop counting for anything afterwards.
 */
function buildProfiles(): ProfileStore | undefined {
  if (!config.dataDir) {
    if (config.nodeEnv === 'production')
      throw new Error('DATA_DIR is required in production. Mount a writable persistent directory.');
    log.info('ratings disabled', { reason: 'no DATA_DIR configured' });
    return undefined;
  }
  const store = new Database(join(config.dataDir, 'battle.sqlite'));
  log.info('ratings enabled', { dir: config.dataDir, profiles: store.size });
  return store;
}

function buildIdentities(): Identities | undefined {
  if (!config.dataDir && !process.env.IDENTITY_SECRET) return undefined;
  return new Identities(identitySecret(config.dataDir || '.'));
}

function buildJudge(): AiJudge | undefined {
  if (config.geminiApiKeys.length === 0) {
    log.info('ai judge disabled', { reason: 'no GEMINI_API_KEYS configured' });
    return undefined;
  }
  const detector = config.yoloUrl
    ? new YoloObjectDetector(config.yoloUrl, config.yoloToken)
    : undefined;
  const judge = new GeminiPhotoJudge({
    apiKeys: config.geminiApiKeys,
    model: config.geminiModel,
    ...(detector ? { detector } : {}),
  });
  log.info('ai judge enabled', {
    model: config.geminiModel,
    keys: config.geminiApiKeys.length,
    detector: detector ? 'yolo' : 'none',
  });
  return new VerifiedJudge(judge);
}
import { Gateway } from './gateway.js';
import { createHttpServer } from './http.js';
import { RoomManager } from './rooms.js';
import type { LimiterOptions } from './limiter.js';
import { log } from './log.js';
import { telegramConfig } from './telegram/config.js';
import { TelegramService } from './telegram/service.js';
import { telegramHttp } from './telegram/http.js';

const SWEEP_INTERVAL_MS = 30_000;
const MATCHMAKE_INTERVAL_MS = 1_000;
/**
 * How often queued notifications go out.
 *
 * Slow on purpose. Nothing here is urgent — the messages that matter are the
 * ones reaching somebody who has already closed the app — and a tighter loop
 * would spend the whole day asking an empty table whether it has work.
 */
const TELEGRAM_TICK_MS = 5_000;

export interface AppOptions {
  clientDir?: string;
  tickMs?: number;
  /**
   * Per-IP budget for opening rooms. Overridable so a test suite, where every
   * client shares one address, is not fighting a limit meant for the internet.
   */
  roomCreateLimit?: LimiterOptions;
  /** Injected by tests; production builds these from the environment. */
  judge?: AiJudge;
  profiles?: ProfileStore;
  identities?: Identities;
  auth?: AuthService;
}

export interface App {
  server: Server;
  rooms: RoomManager;
  gateway: Gateway;
  /** Present only when this deployment has a bot token. */
  telegram?: TelegramService;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

/**
 * Wires the HTTP server, the WebSocket gateway and the room registry together.
 * Split out from the process entry point so tests can run a real server on an
 * ephemeral port rather than mocking the transport.
 */
export function createApp(options: AppOptions = {}): App {
  const judge = options.judge ?? buildJudge();
  const profiles = options.profiles ?? buildProfiles();
  const identities = options.identities ?? buildIdentities();
  const auth =
    options.auth ??
    (profiles instanceof Database ? new AuthService(profiles, identities) : undefined);
  /**
   * The Telegram side is built last and switched on by nothing but a token.
   *
   * Constructed after the room manager because it opens rooms for friend
   * challenges, and handed to the room manager as a listener in the same
   * breath. A deployment with no `TELEGRAM_BOT_TOKEN` never builds any of it,
   * never adds a route and never changes behaviour.
   */
  let telegram: TelegramService | undefined;
  const rooms = new RoomManager({
    maxRooms: config.maxRooms,
    emptyRoomTtlMs: config.emptyRoomTtlMs,
    maxRoomAgeMs: config.maxRoomAgeMs,
    ...(judge ? { judge } : {}),
    ...(profiles ? { profiles } : {}),
    onSettled: (match) => telegram?.onSettled(match),
  });

  if (telegramConfig.enabled && auth && profiles instanceof Database) {
    telegram = new TelegramService({ db: profiles, auth, rooms });
    log.info('telegram integration enabled', {
      bot: telegramConfig.botUsername || 'unknown',
      miniApp: Boolean(telegramConfig.miniAppUrl),
      webhook: Boolean(telegramConfig.webhookSecret),
      admins: telegramConfig.adminIds.size,
    });
  } else if (telegramConfig.botToken) {
    log.warn('telegram integration disabled', {
      reason: telegramConfig.enabled ? 'no database or auth service' : 'TELEGRAM_BOT_ENABLED=0',
    });
  }

  const server = createHttpServer({
    clientDir: options.clientDir ?? config.clientDir,
    rooms,
    ...(auth ? { auth } : {}),
    ...(telegram && auth ? { telegram: telegramHttp(telegram, auth) } : {}),
  });
  const gateway = new Gateway(
    rooms,
    options.roomCreateLimit,
    identities ?? null,
    profiles ?? null,
    auth ?? null,
  );

  server.on('upgrade', (req, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    gateway.handleUpgrade(req, socket, head);
  });

  const ticker = setInterval(() => rooms.tick(Date.now()), options.tickMs ?? config.tickMs);
  // Pairing runs on its own, slower clock. Nobody notices a second's wait for
  // an opponent, and checking every hundred milliseconds would sort the queue
  // ten times for every person who joins it.
  const matchmaker = setInterval(() => gateway.matchmake(Date.now()), MATCHMAKE_INTERVAL_MS);
  const sweeper = setInterval(() => rooms.sweep(Date.now()), SWEEP_INTERVAL_MS);
  const telegramTicker = telegram
    ? setInterval(() => void telegram!.tick(Date.now()), TELEGRAM_TICK_MS)
    : null;
  ticker.unref?.();
  sweeper.unref?.();
  matchmaker.unref?.();
  telegramTicker?.unref?.();

  return {
    server,
    rooms,
    gateway,
    ...(telegram ? { telegram } : {}),
    listen(port, host = config.host) {
      gateway.start();
      // Commands, descriptions, the menu button and the webhook are declarative
      // and idempotent, so they are re-applied on every boot rather than being
      // a checklist somebody has to remember after a deploy. Failing to reach
      // Telegram must never stop the game from starting.
      void telegram?.register().catch((error: unknown) => {
        log.warn('telegram registration failed', {
          errorType: error instanceof Error ? error.name : 'unknown',
        });
      });
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const address = server.address();
          const bound = typeof address === 'object' && address ? address.port : port;
          log.info('battle server listening', { port: bound, host, env: config.nodeEnv });
          resolve(bound);
        });
      });
    },
    close() {
      clearInterval(ticker);
      clearInterval(sweeper);
      clearInterval(matchmaker);
      if (telegramTicker) clearInterval(telegramTicker);
      gateway.stop();
      return new Promise((resolve) =>
        server.close(() => {
          profiles?.close();
          resolve();
        }),
      );
    },
  };
}
