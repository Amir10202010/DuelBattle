import { randomInt } from 'node:crypto';
import type { Database } from '../database.js';
import { grantCoins } from '../economy.js';
import { telegramConfig } from './config.js';

/**
 * Invites, and what an invite is worth.
 *
 * Three decisions carry the whole design.
 *
 * A referral is recorded **once**, on the invitee, and never rewritten. The
 * primary key is the invitee, so "whoever invited me" has exactly one answer
 * for as long as the account exists. Opening a second friend's link later does
 * nothing, which is the point: otherwise the reward goes to whoever sends the
 * most recent link rather than to whoever actually brought somebody in.
 *
 * Nobody is paid for a click. The reward lands when the invitee **finishes a
 * real match**, because a link that pays on open is a link people post in
 * comment sections, and every one of those costs the game money and gives it
 * nothing.
 *
 * Both sides are paid through the coin ledger, whose primary key is
 * (account, receipt), so the reward cannot be paid twice however many times the
 * activation path runs.
 */

/** Readable, shoutable, and free of characters people mistype. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 7;

export type ReferralOutcome =
  | 'accepted'
  | 'self'
  /** They already have an inviter. The first one stands. */
  | 'already-referred'
  | 'unknown-code'
  /** They have played too much to plausibly be a new arrival. */
  | 'not-new';

/**
 * How much of a head start disqualifies somebody from being "invited".
 *
 * Somebody who has already played a handful of matches did not arrive through
 * the link they just opened; treating them as a new player is how two friends
 * pay each other for meeting again.
 */
const MAX_MATCHES_TO_BE_NEW = 3;

export interface ReferralStats {
  joined: number;
  activated: number;
  rewarded: number;
}

export class Referrals {
  constructor(private readonly db: Database) {}

  /** The account's own code, minted on first use and never changed after. */
  codeFor(accountId: string, now: number): string {
    const existing = this.db.sql
      .prepare('SELECT code FROM referral_codes WHERE account_id=?')
      .get(accountId);
    if (existing) return String(existing.code);

    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(0, ALPHABET.length)];
      const inserted = this.db.sql
        .prepare('INSERT OR IGNORE INTO referral_codes VALUES(?,?,?)')
        .run(accountId, code, now);
      if (inserted.changes) return code;
      const settled = this.db.sql
        .prepare('SELECT code FROM referral_codes WHERE account_id=?')
        .get(accountId);
      if (settled) return String(settled.code);
    }
    throw new Error('Could not allocate a referral code');
  }

  accountForCode(code: string): string | null {
    const cleaned = code.trim().toUpperCase();
    if (cleaned.length !== CODE_LENGTH) return null;
    for (const character of cleaned) if (!ALPHABET.includes(character)) return null;
    const row = this.db.sql
      .prepare('SELECT account_id FROM referral_codes WHERE code=?')
      .get(cleaned);
    return row ? String(row.account_id) : null;
  }

  /** Records who brought this player in. Idempotent, and impossible to redirect. */
  claim(inviteeAccountId: string, code: string, now: number): ReferralOutcome {
    const inviter = this.accountForCode(code);
    if (!inviter) return 'unknown-code';
    if (inviter === inviteeAccountId) return 'self';
    return this.db.transaction(() => {
      if (
        this.db.sql
          .prepare('SELECT 1 FROM referral_claims WHERE invitee_account_id=?')
          .get(inviteeAccountId)
      )
        return 'already-referred' as const;
      const played = Number(
        this.db.sql.prepare('SELECT matches FROM profiles WHERE id=?').get(inviteeAccountId)
          ?.matches ?? 0,
      );
      if (played > MAX_MATCHES_TO_BE_NEW) return 'not-new' as const;
      this.db.sql
        .prepare("INSERT INTO referral_claims VALUES(?,?,'pending',?,NULL,NULL)")
        .run(inviteeAccountId, inviter, now);
      return 'accepted' as const;
    });
  }

  /**
   * Called when an invited player finishes a match that counted.
   *
   * Returns who to thank and with how much, or null when there is nothing to
   * do — which is the usual case, because almost every match is played by
   * somebody nobody invited.
   */
  activate(
    inviteeAccountId: string,
    now: number,
  ): { inviterAccountId: string; inviterCoins: number; inviteeCoins: number } | null {
    const row = this.db.sql
      .prepare(
        "SELECT inviter_account_id FROM referral_claims WHERE invitee_account_id=? AND status='pending'",
      )
      .get(inviteeAccountId);
    if (!row) return null;
    const inviterAccountId = String(row.inviter_account_id);
    const receipt = `referral:${inviteeAccountId}`;
    const inviterCoins = grantCoins(
      this.db.sql,
      inviterAccountId,
      receipt,
      telegramConfig.referralReward,
      now,
    );
    const inviteeCoins = grantCoins(
      this.db.sql,
      inviteeAccountId,
      `referral-welcome:${inviterAccountId}`,
      telegramConfig.referralWelcome,
      now,
    );
    this.db.sql
      .prepare(
        "UPDATE referral_claims SET status='rewarded', activated_at=?, rewarded_at=? WHERE invitee_account_id=?",
      )
      .run(now, now, inviteeAccountId);
    return { inviterAccountId, inviterCoins, inviteeCoins };
  }

  stats(accountId: string): ReferralStats {
    const row = this.db.sql
      .prepare(
        `SELECT count(*) AS joined,
                sum(CASE WHEN status IN ('activated','rewarded') THEN 1 ELSE 0 END) AS activated,
                sum(CASE WHEN status='rewarded' THEN 1 ELSE 0 END) AS rewarded
         FROM referral_claims WHERE inviter_account_id=?`,
      )
      .get(accountId)!;
    return {
      joined: Number(row.joined ?? 0),
      activated: Number(row.activated ?? 0),
      rewarded: Number(row.rewarded ?? 0),
    };
  }

  /** Who invited this player, if anybody did. Used to say thank you. */
  inviterOf(accountId: string): string | null {
    const row = this.db.sql
      .prepare('SELECT inviter_account_id FROM referral_claims WHERE invitee_account_id=?')
      .get(accountId);
    return row ? String(row.inviter_account_id) : null;
  }
}
