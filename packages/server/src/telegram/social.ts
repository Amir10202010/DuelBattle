import { randomBytes } from 'node:crypto';
import type { Database } from '../database.js';

/**
 * Friends, the people you have just played, and the two ways to stop somebody.
 *
 * Following is one-directional on purpose. A request-and-accept dance is a
 * feature for a social network; here the only thing a "friend" buys you is a
 * smaller leaderboard and a shortcut to a challenge, neither of which the other
 * person needs to consent to. Blocking, which does affect somebody else, is the
 * part that is enforced.
 *
 * A report is evidence for a person to read. Nothing in this file bans anybody,
 * and nothing counts reports towards an automatic action — one angry opponent
 * is not a finding, and a system that treats it as one is a griefing tool.
 */

export const REPORT_REASONS = ['cheating', 'abuse', 'inappropriate', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** How many people each list keeps. Enough to be useful, not a social graph. */
const MAX_FRIENDS = 200;
const RECENT_KEPT = 12;

export class Social {
  constructor(private readonly db: Database) {}

  friends(accountId: string): string[] {
    return this.db.sql
      .prepare(
        'SELECT friend_account_id FROM player_friends WHERE account_id=? ORDER BY created_at DESC LIMIT ?',
      )
      .all(accountId, MAX_FRIENDS)
      .map((row) => String(row.friend_account_id));
  }

  isFriend(accountId: string, other: string): boolean {
    return Boolean(
      this.db.sql
        .prepare('SELECT 1 FROM player_friends WHERE account_id=? AND friend_account_id=?')
        .get(accountId, other),
    );
  }

  addFriend(accountId: string, other: string, now: number): 'added' | 'blocked' | 'full' | 'self' {
    if (accountId === other) return 'self';
    if (this.blocksEitherWay(accountId, other)) return 'blocked';
    const count = Number(
      this.db.sql
        .prepare('SELECT count(*) AS n FROM player_friends WHERE account_id=?')
        .get(accountId)!.n,
    );
    if (count >= MAX_FRIENDS) return 'full';
    this.db.sql.prepare('INSERT OR IGNORE INTO player_friends VALUES(?,?,?)').run(accountId, other, now);
    return 'added';
  }

  removeFriend(accountId: string, other: string): void {
    this.db.sql
      .prepare('DELETE FROM player_friends WHERE account_id=? AND friend_account_id=?')
      .run(accountId, other);
  }

  blocked(accountId: string): string[] {
    return this.db.sql
      .prepare('SELECT blocked_account_id FROM player_blocks WHERE account_id=? ORDER BY created_at DESC')
      .all(accountId)
      .map((row) => String(row.blocked_account_id));
  }

  /**
   * Blocking is symmetric in effect even though it is stored one way.
   *
   * Whoever pressed the button should not have to care which direction the row
   * points: neither person can challenge the other afterwards, and neither
   * appears in the other's friends list.
   */
  blocksEitherWay(accountId: string, other: string): boolean {
    return Boolean(
      this.db.sql
        .prepare(
          `SELECT 1 FROM player_blocks
           WHERE (account_id=? AND blocked_account_id=?) OR (account_id=? AND blocked_account_id=?)`,
        )
        .get(accountId, other, other, accountId),
    );
  }

  block(accountId: string, other: string, now: number): void {
    if (accountId === other) return;
    this.db.transaction(() => {
      this.db.sql.prepare('INSERT OR IGNORE INTO player_blocks VALUES(?,?,?)').run(accountId, other, now);
      // Blocking somebody you had added is not a contradiction to resolve later.
      this.db.sql
        .prepare(
          'DELETE FROM player_friends WHERE (account_id=? AND friend_account_id=?) OR (account_id=? AND friend_account_id=?)',
        )
        .run(accountId, other, other, accountId);
      this.db.sql
        .prepare("UPDATE telegram_duels SET status='declined' WHERE status='pending' AND ((host_account_id=? AND guest_account_id=?) OR (host_account_id=? AND guest_account_id=?))")
        .run(accountId, other, other, accountId);
    });
  }

  unblock(accountId: string, other: string): void {
    this.db.sql
      .prepare('DELETE FROM player_blocks WHERE account_id=? AND blocked_account_id=?')
      .run(accountId, other);
  }

  recentOpponents(accountId: string): string[] {
    return this.db.sql
      .prepare(
        `SELECT opponent_account_id FROM recent_opponents
         WHERE account_id=? ORDER BY at DESC LIMIT ?`,
      )
      .all(accountId, RECENT_KEPT)
      .map((row) => String(row.opponent_account_id));
  }

  /** Written from the settlement hook, for both players, in one call. */
  rememberOpponents(a: string, b: string, now: number): void {
    if (a === b) return;
    for (const [one, two] of [
      [a, b],
      [b, a],
    ] as const) {
      this.db.sql
        .prepare(
          'INSERT INTO recent_opponents VALUES(?,?,?) ON CONFLICT(account_id,opponent_account_id) DO UPDATE SET at=excluded.at',
        )
        .run(one, two, now);
      // Trim in the same breath, so the table cannot grow past what is read.
      this.db.sql
        .prepare(
          `DELETE FROM recent_opponents WHERE account_id=? AND opponent_account_id NOT IN
           (SELECT opponent_account_id FROM recent_opponents WHERE account_id=? ORDER BY at DESC LIMIT ?)`,
        )
        .run(one, one, RECENT_KEPT);
    }
  }

  /**
   * Files a report.
   *
   * One open report per pair: a second one adds no information and lets one
   * person fill a moderation queue on their own.
   */
  report(input: {
    reporterAccountId: string;
    targetAccountId: string;
    reason: ReportReason;
    note: string | null;
    now: number;
  }): 'filed' | 'duplicate' | 'self' {
    if (input.reporterAccountId === input.targetAccountId) return 'self';
    const open = this.db.sql
      .prepare(
        "SELECT 1 FROM player_reports WHERE reporter_account_id=? AND target_account_id=? AND state='open'",
      )
      .get(input.reporterAccountId, input.targetAccountId);
    if (open) return 'duplicate';
    this.db.sql
      .prepare("INSERT INTO player_reports VALUES(?,?,?,?,?,'open',?)")
      .run(
        randomBytes(12).toString('hex'),
        input.reporterAccountId,
        input.targetAccountId,
        input.reason,
        input.note?.slice(0, 400) ?? null,
        input.now,
      );
    return 'filed';
  }

  openReports(limit = 20): {
    id: string;
    reporter: string;
    target: string;
    reason: string;
    note: string | null;
    createdAt: number;
  }[] {
    return this.db.sql
      .prepare("SELECT * FROM player_reports WHERE state='open' ORDER BY created_at DESC LIMIT ?")
      .all(limit)
      .map((row) => ({
        id: String(row.id),
        reporter: String(row.reporter_account_id),
        target: String(row.target_account_id),
        reason: String(row.reason),
        note: row.note === null ? null : String(row.note),
        createdAt: Number(row.created_at),
      }));
  }

  resolveReport(id: string, state: 'reviewed' | 'dismissed'): boolean {
    return (
      this.db.sql.prepare('UPDATE player_reports SET state=? WHERE id=?').run(state, id).changes > 0
    );
  }
}
