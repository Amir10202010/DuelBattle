import { config } from '../config.js';

/**
 * Everything the Telegram side reads from the environment, in one place.
 *
 * The rule the rest of the project follows applies here too: a secret is read
 * once, on this side of the wire, and never crosses into the client bundle or
 * into a log line. `telegramConfig.enabled` is the single switch the whole
 * subsystem hangs off — with no bot token there is no service, no routes and no
 * behaviour change of any kind.
 */

function list(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function int(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max)
    throw new Error(`Environment variable ${name} must be an integer between ${min} and ${max}.`);
  return parsed;
}

/** Admin ids are numeric Telegram user ids. A username is not an identity. */
function adminIds(): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const value of list('TELEGRAM_ADMIN_IDS')) {
    if (!/^\d{1,19}$/.test(value)) throw new Error('TELEGRAM_ADMIN_IDS must be numeric Telegram user ids.');
    ids.add(Number(value));
  }
  return ids;
}

/**
 * Where Telegram should open the Mini App.
 *
 * Telegram will not open anything but HTTPS, and a trailing slash turns every
 * built link into a double slash, so both are settled here rather than at the
 * dozen call sites that build a URL.
 */
function miniAppUrl(): string {
  const raw = (process.env.TELEGRAM_MINI_APP_URL || process.env.APP_ORIGIN || '').replace(/\/+$/, '');
  if (!raw) return '';
  if (config.nodeEnv === 'production' && !raw.startsWith('https://'))
    throw new Error('TELEGRAM_MINI_APP_URL must be an https origin in production.');
  return raw;
}

const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();

export const telegramConfig = {
  /**
   * The bot token. Present means "this deployment has a bot"; the flag below is
   * how an operator turns one off without deleting it from their secret store.
   */
  botToken: token,
  enabled: Boolean(token) && process.env.TELEGRAM_BOT_ENABLED !== '0',
  /** Without the @. Used to build every t.me link the product hands out. */
  botUsername: (process.env.TELEGRAM_BOT_USERNAME ?? '').replace(/^@/, '').trim(),
  /**
   * Shared secret Telegram echoes back on every webhook delivery. Without one
   * the endpoint is open to anybody who can guess the path, so the webhook is
   * simply not registered until it is set.
   */
  webhookSecret: (process.env.TELEGRAM_WEBHOOK_SECRET ?? '').trim(),
  miniAppUrl: miniAppUrl(),
  adminIds: adminIds(),
  /** Where `/support` sends anything a player asks to forward. Optional. */
  supportChatId: (process.env.TELEGRAM_SUPPORT_CHAT_ID ?? '').trim(),
  /** Price of premium, in Telegram Stars. One number, one place. */
  premiumStars: int('TELEGRAM_PREMIUM_STARS', 250, 1, 100_000),
  /** How long one purchase lasts. Zero means it never expires. */
  premiumDays: int('TELEGRAM_PREMIUM_DAYS', 30, 0, 3_650),
  /** Battle coins paid to an inviter once their invitee finishes a real match. */
  referralReward: int('TELEGRAM_REFERRAL_REWARD', 150, 0, 10_000),
  /** And to the invitee, for arriving through a friend. */
  referralWelcome: int('TELEGRAM_REFERRAL_WELCOME', 75, 0, 10_000),
} as const;

export type TelegramConfig = typeof telegramConfig;

/** The public bot link, or an empty string when the username is not configured. */
export function botLink(payload?: string): string {
  if (!telegramConfig.botUsername) return '';
  const base = `https://t.me/${telegramConfig.botUsername}`;
  return payload ? `${base}?startapp=${encodeURIComponent(payload)}` : base;
}

/** The chat-side deep link, which lands on `/start <payload>` rather than the app. */
export function botStartLink(payload: string): string {
  if (!telegramConfig.botUsername) return '';
  return `https://t.me/${telegramConfig.botUsername}?start=${encodeURIComponent(payload)}`;
}

export function isAdmin(telegramUserId: number): boolean {
  return telegramConfig.adminIds.has(telegramUserId);
}
