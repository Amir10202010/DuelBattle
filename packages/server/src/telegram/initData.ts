import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Proving that a Mini App launch really came from Telegram.
 *
 * This is the only thing standing between "this person is Telegram user 4242"
 * and anybody with a text editor, so it is a pure function: a string and a
 * token in, a verdict out. No database, no clock of its own, no logging, no
 * network. Everything it decides can be reproduced in a test, which is the
 * whole reason it does not live inside a route handler.
 *
 * The algorithm is Telegram's, not ours:
 *
 *   secret = HMAC_SHA256(key: "WebAppData", message: bot_token)
 *   check  = every received field except `hash` and `signature`,
 *            sorted by key, as `key=value`, joined with \n
 *   expect = HMAC_SHA256(key: secret, message: check)
 *
 * `signature` is excluded because Telegram excludes it: it is an Ed25519
 * signature added for third parties who must verify a launch *without* holding
 * the bot token, and folding it into the check string rejects every launch from
 * a current client.
 */

/**
 * How old an authorisation may be.
 *
 * Telegram does not expire `initData`; it hands the same signed string to the
 * page for the whole session. Left unbounded, one copied string is a permanent
 * credential, so the window is ours to choose. Twenty-four hours is long enough
 * that a Mini App left open on a phone overnight still works when it is picked
 * up, and short enough that a string lifted from a log is worthless by the time
 * anybody reads it.
 */
export const INIT_DATA_MAX_AGE_MS = 24 * 60 * 60_000;

/**
 * How far ahead of us a client's clock may be.
 *
 * `auth_date` is stamped by Telegram, not by the device, so a future date is
 * nearly always our own clock running slow. A minute absorbs that; ten minutes
 * would be a replay window.
 */
const MAX_CLOCK_SKEW_MS = 60_000;

/** A launch payload is a few hundred bytes. Anything larger is not one. */
const MAX_INIT_DATA_BYTES = 4_096;

/** Telegram's own limit on a start parameter, and its alphabet. */
const START_PARAM = /^[A-Za-z0-9_-]{1,64}$/;

export interface TelegramLaunchUser {
  /** Telegram's numeric id. The identity. Never the username. */
  id: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  languageCode: string | null;
  photoUrl: string | null;
  /** Whether the bot may message them without being spoken to first. */
  allowsWriteToPm: boolean;
  isPremium: boolean;
}

export type InitDataFailure =
  /** The deployment has no bot token, so nothing can be proved either way. */
  | 'not-configured'
  /** Not a launch payload at all: no hash, no auth_date, no usable user. */
  | 'malformed'
  /** Correctly shaped, but not signed by this bot. */
  | 'bad-hash'
  /** Signed by this bot, but too long ago (or dated in the future). */
  | 'expired';

export type InitDataResult =
  | {
      ok: true;
      user: TelegramLaunchUser;
      /** Epoch ms, from Telegram's own `auth_date`. */
      authDate: number;
      /** The `startapp=` payload, already checked against Telegram's alphabet. */
      startParam: string | null;
      /** Identifies the chat the Mini App was opened from, when there is one. */
      chatInstance: string | null;
    }
  | { ok: false; reason: InitDataFailure };

const fail = (reason: InitDataFailure): InitDataResult => ({ ok: false, reason });

/**
 * Control characters, zero-width marks and bidi overrides, by code point.
 *
 * Built from an escaped source string rather than written as a literal, so
 * the characters this rejects never appear in the file that rejects them.
 */
const UNSAFE = new RegExp(
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  '[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]',
  'g',
);

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Control characters and bidi marks are how a display name becomes a
  // scoreboard exploit; the rest of the app already refuses them, so do not
  // introduce a new door.
  return trimmed.replace(UNSAFE, '').slice(0, max) || null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseUser(raw: string | null): TelegramLaunchUser | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const user = parsed as Record<string, unknown>;
  // Telegram ids are positive integers well inside the safe range. A string
  // that looks like one is not one: it is somebody probing the parser.
  if (typeof user.id !== 'number' || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
  const firstName = text(user.first_name, 64);
  return {
    id: user.id,
    firstName: firstName ?? 'Player',
    lastName: text(user.last_name, 64),
    username: text(user.username, 32),
    languageCode: text(user.language_code, 16)?.toLowerCase() ?? null,
    photoUrl: httpsUrl(user.photo_url),
    allowsWriteToPm: user.allows_write_to_pm === true,
    isPremium: user.is_premium === true,
  };
}

/**
 * Verifies a raw `Telegram.WebApp.initData` string.
 *
 * `now` is a parameter rather than a call to `Date.now()` so the expiry rule
 * can be tested at all, and so a caller that has already read the clock does
 * not read it twice for one request.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  now: number,
): InitDataResult {
  if (!botToken) return fail('not-configured');
  if (typeof initData !== 'string' || !initData || initData.length > MAX_INIT_DATA_BYTES)
    return fail('malformed');

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return fail('malformed');
  }

  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return fail('malformed');

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw || !/^\d{1,12}$/.test(authDateRaw)) return fail('malformed');

  const user = parseUser(params.get('user'));
  if (!user) return fail('malformed');

  /*
   * Every received field except `hash` itself.
   *
   * `signature` stays in. It is tempting to drop it — it is a signature, after
   * all, and Telegram's *other* validation method does drop it — but the two
   * methods are not symmetrical and getting this backwards is silent: the
   * server says "we could not verify this session" for every launch from a
   * current client, while any test that signs the string the same wrong way
   * passes happily.
   *
   * The asymmetry makes sense from Telegram's side. It builds the payload,
   * computes the Ed25519 `signature` over the fields excluding `hash` and
   * `signature`, and only then computes this HMAC over everything except
   * `hash` — by which point `signature` is just another received field.
   * Third parties, who hold the public key but not the bot token, verify the
   * Ed25519 one and therefore exclude both.
   */
  const check = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(check).digest('hex');
  // Both sides are fixed-length lowercase hex by construction, so the lengths
  // always match and timingSafeEqual cannot throw.
  if (!timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(hash, 'utf8')))
    return fail('bad-hash');

  const authDate = Number(authDateRaw) * 1000;
  if (now - authDate > INIT_DATA_MAX_AGE_MS || authDate - now > MAX_CLOCK_SKEW_MS)
    return fail('expired');

  const startParam = params.get('start_param');
  const chatInstance = params.get('chat_instance');

  return {
    ok: true,
    user,
    authDate,
    startParam: startParam && START_PARAM.test(startParam) ? startParam : null,
    chatInstance: chatInstance && /^[-\w]{1,64}$/.test(chatInstance) ? chatInstance : null,
  };
}
