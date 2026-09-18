import { randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { MAX_NAME_LENGTH } from '@battle/shared';
import type { Database } from '../database.js';
import { blankProfile } from '../profiles.js';
import type { TelegramLaunchUser } from './initData.js';

/**
 * Where a Telegram account meets a Duel Battle player.
 *
 * The one rule this file exists to enforce: there is no second user system.
 * A Telegram launch resolves to a row in `accounts`, which is the same row the
 * browser signs into, shares a primary key with `profiles`, and owns the
 * rating, the coins, the cosmetics and the history. Telegram adds a way in and
 * a way to reach somebody; it does not add a person.
 */

export interface TelegramIdentity {
  telegramUserId: number;
  accountId: string;
  username: string | null;
  firstName: string;
  lastName: string | null;
  languageCode: string | null;
  photoUrl: string | null;
  allowsWriteToPm: boolean;
  isPremium: boolean;
  createdAt: number;
  lastSeenAt: number;
}

function toIdentity(row: Record<string, unknown>): TelegramIdentity {
  return {
    telegramUserId: Number(row.telegram_user_id),
    accountId: String(row.account_id),
    username: row.username === null || row.username === undefined ? null : String(row.username),
    firstName: String(row.first_name ?? ''),
    lastName: row.last_name === null || row.last_name === undefined ? null : String(row.last_name),
    languageCode:
      row.language_code === null || row.language_code === undefined ? null : String(row.language_code),
    photoUrl: row.photo_url === null || row.photo_url === undefined ? null : String(row.photo_url),
    allowsWriteToPm: Number(row.allows_write_to_pm) === 1,
    isPremium: Number(row.is_premium) === 1,
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}

/**
 * A display name from a Telegram profile.
 *
 * The game's own name rules are narrower than Telegram's — eighteen characters,
 * no control marks — so a name that will not fit is trimmed rather than
 * rejected. Somebody whose Telegram name is entirely emoji still gets a player
 * they can use; they can change it in settings like anybody else.
 */
export function displayNameFrom(user: TelegramLaunchUser): string {
  const candidate = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const trimmed = candidate.slice(0, MAX_NAME_LENGTH).trim();
  if (trimmed) return trimmed;
  const handle = (user.username ?? '').slice(0, MAX_NAME_LENGTH).trim();
  return handle || 'Player';
}

export class TelegramIdentities {
  constructor(private readonly db: Database) {}

  private get sql(): DatabaseSync {
    return this.db.sql;
  }

  byTelegramId(telegramUserId: number): TelegramIdentity | null {
    const row = this.sql
      .prepare('SELECT * FROM telegram_identities WHERE telegram_user_id=?')
      .get(telegramUserId);
    return row ? toIdentity(row) : null;
  }

  byAccount(accountId: string): TelegramIdentity | null {
    const row = this.sql
      .prepare('SELECT * FROM telegram_identities WHERE account_id=?')
      .get(accountId);
    return row ? toIdentity(row) : null;
  }

  /**
   * Resolves a verified launch to an account, creating one on a first visit.
   *
   * Runs in one transaction because two taps on a cold start are two concurrent
   * launches, and the unique constraint on `telegram_user_id` is what decides
   * which of them creates the player.
   */
  resolve(user: TelegramLaunchUser, now: number): { accountId: string; created: boolean } {
    return this.db.transaction(() => {
      const existing = this.sql
        .prepare('SELECT account_id FROM telegram_identities WHERE telegram_user_id=?')
        .get(user.id);
      if (existing) {
        const accountId = String(existing.account_id);
        this.refresh(user, accountId, now);
        return { accountId, created: false };
      }
      const accountId = this.createAccount(displayNameFrom(user), now);
      this.attach(user, accountId, now);
      return { accountId, created: true };
    });
  }

  /**
   * Attaches a Telegram account to an account that already exists.
   *
   * Used by the linking flow, where the account was proved by a one-time code
   * rather than by the launch itself. Refuses if either side is already spoken
   * for, because a silent re-point is how somebody loses a rating.
   */
  attach(user: TelegramLaunchUser, accountId: string, now: number): 'linked' | 'telegram-taken' | 'account-taken' {
    const byTelegram = this.sql
      .prepare('SELECT account_id FROM telegram_identities WHERE telegram_user_id=?')
      .get(user.id);
    if (byTelegram) return String(byTelegram.account_id) === accountId ? 'linked' : 'telegram-taken';
    if (this.sql.prepare('SELECT 1 FROM telegram_identities WHERE account_id=?').get(accountId))
      return 'account-taken';
    this.sql
      .prepare(
        `INSERT INTO telegram_identities
         (telegram_user_id,account_id,username,first_name,last_name,language_code,photo_url,
          allows_write_to_pm,is_premium,created_at,updated_at,last_seen_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        user.id,
        accountId,
        user.username,
        user.firstName,
        user.lastName,
        user.languageCode,
        user.photoUrl,
        user.allowsWriteToPm ? 1 : 0,
        user.isPremium ? 1 : 0,
        now,
        now,
        now,
      );
    return 'linked';
  }

  /**
   * Updates the cached copy of a Telegram profile.
   *
   * A username is a label somebody can change this afternoon, so it is stored
   * as cache and refreshed on every authentication. Nothing ever decides who
   * somebody is from it.
   */
  refresh(user: TelegramLaunchUser, accountId: string, now: number): void {
    this.sql
      .prepare(
        `UPDATE telegram_identities SET username=?,first_name=?,last_name=?,language_code=?,
         photo_url=?,allows_write_to_pm=?,is_premium=?,updated_at=?,last_seen_at=?
         WHERE telegram_user_id=? AND account_id=?`,
      )
      .run(
        user.username,
        user.firstName,
        user.lastName,
        user.languageCode,
        user.photoUrl,
        user.allowsWriteToPm ? 1 : 0,
        user.isPremium ? 1 : 0,
        now,
        now,
        user.id,
        accountId,
      );
  }

  /** Records that this player is looking at the app right now. */
  touch(accountId: string, now: number): void {
    this.sql
      .prepare('UPDATE telegram_identities SET last_seen_at=? WHERE account_id=?')
      .run(now, accountId);
  }

  /** How recently a player was in the Mini App. Zero if they never have been. */
  lastSeen(accountId: string): number {
    return Number(
      this.sql
        .prepare('SELECT last_seen_at FROM telegram_identities WHERE account_id=?')
        .get(accountId)?.last_seen_at ?? 0,
    );
  }

  /** Detaches Telegram without touching the account, rating or purchases. */
  unlink(accountId: string): boolean {
    return (
      this.sql.prepare('DELETE FROM telegram_identities WHERE account_id=?').run(accountId)
        .changes > 0
    );
  }

  /**
   * Whether this account can also be signed into from a browser.
   *
   * A Telegram-only account has no email, no Google subject and a password hash
   * that can never match, so unlinking it would lock the player out. The Mini
   * App uses this to say so before anybody presses the button.
   */
  hasWebSignIn(accountId: string): boolean {
    const row = this.sql
      .prepare('SELECT email, google_sub, password_hash FROM accounts WHERE id=?')
      .get(accountId);
    if (!row) return false;
    if (row.email || row.google_sub) return true;
    return /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(String(row.password_hash ?? ''));
  }

  /**
   * An opaque name for a player, minted on first use.
   *
   * Everything a Mini App screen does with another player — open their card,
   * challenge them, block them — goes through this rather than through the
   * account id, so the database's own key never leaves the server.
   */
  refFor(accountId: string, now: number): string {
    const existing = this.sql.prepare('SELECT ref FROM player_refs WHERE account_id=?').get(accountId);
    if (existing) return String(existing.ref);
    for (let attempt = 0; attempt < 8; attempt++) {
      const ref = `u${randomBytes(9).toString('base64url')}`;
      const inserted = this.sql
        .prepare('INSERT OR IGNORE INTO player_refs VALUES(?,?,?)')
        .run(accountId, ref, now);
      if (inserted.changes) return ref;
      const now2 = this.sql.prepare('SELECT ref FROM player_refs WHERE account_id=?').get(accountId);
      if (now2) return String(now2.ref);
    }
    throw new Error('Could not allocate a player reference');
  }

  accountForRef(ref: string): string | null {
    if (!/^u[A-Za-z0-9_-]{12}$/.test(ref)) return null;
    const row = this.sql.prepare('SELECT account_id FROM player_refs WHERE ref=?').get(ref);
    return row ? String(row.account_id) : null;
  }

  /**
   * A brand new player.
   *
   * Deliberately the same shape the Google path already creates: a generated
   * `p_…` username so the column stays unique and meaningful, and a password
   * hash of `external`, which cannot match the stored-hash format and therefore
   * can never be signed into with a password.
   */
  private createAccount(name: string, now: number): string {
    const id = randomBytes(16).toString('hex');
    this.db.save({ ...blankProfile(id, now), name });
    this.sql
      .prepare(
        'INSERT INTO accounts(id,username,password_hash,recovery_hash,onboarded,created_at) VALUES(?,?,?,?,1,?)',
      )
      .run(id, `p_${id.slice(0, 18)}`, 'external', randomBytes(32).toString('hex'), now);
    return id;
  }
}
