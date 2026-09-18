import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Database } from '../database.js';

/**
 * Attaching Telegram to an account somebody already has.
 *
 * The temptation is to ask for a username and trust it. That is an account
 * takeover with extra steps: usernames are public, and anybody who can read one
 * off a leaderboard could claim the player it belongs to.
 *
 * Instead the *browser*, already signed in, asks for a code. The code proves
 * only that whoever holds it was signed into that account minutes ago. It is
 * hashed at rest, single use, short-lived, and drawn from a CSPRNG over an
 * alphabet with no characters anybody confuses when reading a code aloud.
 */

/** No I, O, 0 or 1: a code is read off one screen and typed into another. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const TTL_MS = 10 * 60_000;
/** Codes an account may have outstanding. Enough for a retry, not for a sweep. */
const MAX_OUTSTANDING = 3;

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

/** `TG-XXXXXX`, which is what the player sees and types. */
export function formatLinkCode(code: string): string {
  return `TG-${code}`;
}

export function parseLinkCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/^TG-?/, '');
  if (cleaned.length !== CODE_LENGTH) return null;
  for (const character of cleaned) if (!ALPHABET.includes(character)) return null;
  return cleaned;
}

export class LinkCodes {
  constructor(private readonly db: Database) {}

  /**
   * Issues a code for an account.
   *
   * Returns null when the account already has as many live codes as it is
   * allowed, which is the rate limit: a code is cheap to make and expensive to
   * guess, so the thing worth bounding is how many valid ones exist at once.
   */
  issue(accountId: string, now: number): string | null {
    return this.db.transaction(() => {
      this.db.sql.prepare('DELETE FROM telegram_link_codes WHERE expires_at<?').run(now);
      const live = Number(
        this.db.sql
          .prepare(
            'SELECT count(*) AS n FROM telegram_link_codes WHERE account_id=? AND used_at IS NULL AND expires_at>?',
          )
          .get(accountId, now)!.n,
      );
      if (live >= MAX_OUTSTANDING) return null;

      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
      this.db.sql
        .prepare('INSERT OR REPLACE INTO telegram_link_codes VALUES(?,?,?,?,NULL)')
        .run(digest(code), accountId, now, now + TTL_MS);
      return code;
    });
  }

  /**
   * Spends a code, returning the account it belongs to.
   *
   * The delete is the check: one statement decides validity, expiry and single
   * use together, so two taps on the same link cannot both win.
   */
  redeem(raw: string, now: number): string | null {
    const code = parseLinkCode(raw);
    if (!code) return null;
    const row = this.db.sql
      .prepare(
        'DELETE FROM telegram_link_codes WHERE code_hash=? AND used_at IS NULL AND expires_at>? RETURNING account_id',
      )
      .get(digest(code), now);
    return row ? String(row.account_id) : null;
  }

  /** Whether two codes match, without leaking where they stop matching. */
  static equal(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  /** How long a freshly issued code is good for, so the UI can say. */
  get ttlMs(): number {
    return TTL_MS;
  }
}
