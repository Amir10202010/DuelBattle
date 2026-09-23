import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Deployment environment takes precedence; tests never consume developer keys.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'test' && existsSync(envPath)) loadEnvFile(envPath);

/** All tunables in one place, each with a safe default and a clear owner. */
function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    (name.endsWith('PORT') && parsed > 65535)
  ) {
    throw new Error(
      `Environment variable ${name} must be a positive integer within its supported range.`,
    );
  }
  return parsed;
}

function list(name: string): string[] {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

/**
 * Where the API listens.
 *
 * In production, `PORT` and nothing else. It is the contract every host has,
 * most of them assign it at boot, and a deployment that binds some other port
 * simply fails its health check.
 *
 * In development the answer is `SERVER_PORT`, because there are two processes
 * and they have to agree: Vite serves the page on `CLIENT_PORT` and forwards
 * `/api` and `/ws` to `SERVER_PORT`. `.env.example` has shipped `SERVER_PORT`
 * as the server's port from the start while nothing here read it, so anything
 * that put a `PORT` in the environment — CI, a launcher, a shell — moved the
 * server out from under the proxy, and the only symptom was a browser
 * reporting that the API had vanished.
 *
 * Kept apart deliberately: a developer's `.env` is loaded in any environment,
 * and letting the `SERVER_PORT` in it outrank a production `PORT` would trade
 * a broken dev stack for a deploy that never comes up.
 */
function apiPort(): number {
  if (nodeEnv === 'production') return int('PORT', 8787);
  return int('SERVER_PORT', int('PORT', 8787));
}

export const config = {
  port: apiPort(),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv,
  /**
   * Origins allowed to open a WebSocket. Empty means "same origin only", which
   * is what a single-service deployment wants; set it when the client is served
   * from a different host.
   */
  allowedOrigins: list('ALLOWED_ORIGINS'),
  /** Directory of built client assets to serve; unset in development. */
  clientDir: process.env.CLIENT_DIR ?? '',
  /** How often the engine advances deadline-driven transitions. */
  tickMs: int('TICK_MS', 100),
  /** Rooms with nobody connected are collected after this long. */
  emptyRoomTtlMs: int('EMPTY_ROOM_TTL_MS', 5 * 60_000),
  /** Absolute ceiling on a room's lifetime, regardless of activity. */
  maxRoomAgeMs: int('MAX_ROOM_AGE_MS', 6 * 60 * 60_000),
  /**
   * A busy room holds, at worst, two evidence snapshots, two live frames and
   * two decoded baselines — roughly 700 KB. The default is therefore a ceiling
   * of about 350 MB of room state; raise it only with that arithmetic in mind.
   */
  maxRooms: int('MAX_ROOMS', 500),
  /** Optional server-side AI keys. Without keys, ranked play uses camera checks. */
  geminiApiKeys: list('GEMINI_API_KEYS').concat(list('GEMINI_API_KEY')),
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash',
  /**
   * An optional local YOLO service. Its detections are hints handed to the
   * referee alongside the photographs; they never award a point on their own.
   */
  yoloUrl: process.env.YOLO_URL ?? '',
  yoloToken: process.env.YOLO_TOKEN ?? '',
  /** Persistent SQLite database and legacy identity key. Required in production. */
  dataDir: process.env.DATA_DIR ?? './data',
  /**
   * Sustained client messages per second before we start dropping.
   *
   * The live camera stream is the bulk of it: a client paced off its webcam
   * sends about fifteen frames a second, and every one is a message. The
   * budget has to clear that with room for the handshake, pings and the
   * handful of actions a player can take in the same second, or the limiter
   * starts eating video on a perfectly healthy connection.
   */
  messageRatePerSec: int('MESSAGE_RATE_PER_SEC', 45),
  /** Image-bearing messages get their own budget; a frame is small, a snapshot is not. */
  imageRatePerSec: int('IMAGE_RATE_PER_SEC', 22),
  /** Connections from one IP. Keeps a single browser from exhausting the box. */
  maxConnectionsPerIp: int('MAX_CONNECTIONS_PER_IP', 12),
  /**
   * Rooms one address may open back to back, and how fast the allowance
   * returns. Without this, one client can fill the whole room table in seconds
   * and hold it for as long as an empty room survives.
   */
  roomCreateBurst: int('ROOM_CREATE_BURST', 5),
  roomCreatePerMin: int('ROOM_CREATE_PER_MIN', 3),
  /** A socket that misses this many heartbeats is considered gone. */
  heartbeatMs: int('HEARTBEAT_MS', 15_000),
  /**
   * How long a socket may stay open without ever joining a room.
   *
   * The client connects as soon as the page loads, so this is also how long
   * someone may read the landing page before their connection is recycled.
   * Generous on purpose: per-IP connection limits are what actually stop
   * squatting, and a short window here just churns real players.
   */
  idleSocketTtlMs: int('IDLE_SOCKET_TTL_MS', 10 * 60_000),
  /** Trust X-Forwarded-For. Only enable behind a proxy you control. */
  trustProxy: process.env.TRUST_PROXY === '1',
} as const;

export type Config = typeof config;
