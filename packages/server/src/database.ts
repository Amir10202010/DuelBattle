import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { hydrate, type PlayerProfile, type ProfileStore } from './profiles.js';
import type { BoardKind } from './leaderboard.js';
import { CASUAL_DAILY_CAP, casualCoins, casualRewardsToday, migrateEconomy, matchCoins } from './economy.js';
import { migrateTelegram } from './telegram/schema.js';
import { migrateMeta } from './meta/schema.js';
import { normalizeLoadout, type MatchRewards } from '@battle/shared';

/** One authoritative store. All game writes commit before a result is announced. */
export class Database implements ProfileStore {
  readonly sql: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.sql = new DatabaseSync(path);
    this.sql.exec(
      'PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;',
    );
    this.migrate();
    if (path !== ':memory:') this.importLegacy(join(dirname(path), 'profiles.json'));
  }

  private migrate(): void {
    this.transaction(() => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY, payload TEXT NOT NULL CHECK(json_valid(payload)),
          rating INTEGER NOT NULL CHECK(rating >= 100), wins INTEGER NOT NULL CHECK(wins >= 0),
          best_streak INTEGER NOT NULL CHECK(best_streak >= 0), matches INTEGER NOT NULL CHECK(matches >= 0)
        );
        CREATE INDEX IF NOT EXISTS profiles_rating ON profiles(rating DESC, wins DESC, id);
        CREATE INDEX IF NOT EXISTS profiles_wins ON profiles(wins DESC, rating DESC, id);
        CREATE INDEX IF NOT EXISTS profiles_streak ON profiles(best_streak DESC, rating DESC, id);
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
          username TEXT NOT NULL UNIQUE COLLATE NOCASE,
          password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
          onboarded INTEGER NOT NULL DEFAULT 0 CHECK(onboarded IN (0,1)), created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
        CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
        CREATE TABLE IF NOT EXISTS match_receipts (
          id TEXT PRIMARY KEY, a TEXT NOT NULL REFERENCES profiles(id), b TEXT NOT NULL REFERENCES profiles(id),
          at INTEGER NOT NULL, CHECK(a <> b)
        );
        CREATE INDEX IF NOT EXISTS receipts_pair ON match_receipts(a,b,at DESC);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS queue_cooldowns (
          account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, until INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS evaluation_audits (
          round_id TEXT PRIMARY KEY, at INTEGER NOT NULL, verdict TEXT NOT NULL CHECK(json_valid(verdict))
        );
        CREATE INDEX IF NOT EXISTS evaluation_audits_time ON evaluation_audits(at);
        INSERT OR IGNORE INTO migrations VALUES(1, unixepoch()*1000);
        INSERT OR IGNORE INTO migrations VALUES(2, unixepoch()*1000);
      `);
      const columns = this.sql.prepare('PRAGMA table_info(accounts)').all().map((row) => row.name);
      if (!columns.includes('email')) this.sql.exec('ALTER TABLE accounts ADD COLUMN email TEXT;');
      if (!columns.includes('google_sub')) this.sql.exec('ALTER TABLE accounts ADD COLUMN google_sub TEXT;');
      this.sql.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS accounts_email ON accounts(email COLLATE NOCASE) WHERE email IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS accounts_google ON accounts(google_sub) WHERE google_sub IS NOT NULL;
        CREATE TABLE IF NOT EXISTS email_challenges (
          id TEXT PRIMARY KEY, email TEXT NOT NULL, code_hash TEXT NOT NULL,
          purpose TEXT NOT NULL CHECK(purpose IN ('register','reset')),
          attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
          expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS email_challenges_email ON email_challenges(email,created_at DESC);
        CREATE INDEX IF NOT EXISTS email_challenges_expiry ON email_challenges(expires_at);
        CREATE TABLE IF NOT EXISTS oauth_challenges (
          state_hash TEXT PRIMARY KEY, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS oauth_challenges_expiry ON oauth_challenges(expires_at);
        INSERT OR IGNORE INTO migrations VALUES(4, unixepoch()*1000);
      `);
      migrateEconomy(this.sql);
      migrateTelegram(this.sql);
      migrateMeta(this.sql);
    });
  }

  transaction<T>(run: () => T): T {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const result = run();
      this.sql.exec('COMMIT');
      return result;
    } catch (error) {
      this.sql.exec('ROLLBACK');
      throw error;
    }
  }

  get(id: string): PlayerProfile | undefined {
    const row = this.sql.prepare('SELECT payload FROM profiles WHERE id=?').get(id);
    if (!row) return undefined;
    const profile = hydrate(JSON.parse(String(row.payload)) as PlayerProfile, Date.now());
    const equipped = this.sql.prepare('SELECT loadout FROM wallets WHERE account_id=?').get(id);
    if (equipped) profile.loadout = normalizeLoadout(JSON.parse(String(equipped.loadout)));
    return profile;
  }

  save(profile: PlayerProfile): void {
    this.sql
      .prepare(
        `INSERT INTO profiles VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
      payload=excluded.payload,rating=excluded.rating,wins=excluded.wins,
      best_streak=excluded.best_streak,matches=excluded.matches`,
      )
      .run(
        profile.id,
        JSON.stringify(profile),
        profile.rating,
        profile.wins,
        profile.bestStreak,
        profile.matchesPlayed,
      );
  }

  rewardMatch(id: string, receipt: string, reward: MatchRewards, at: number) {
    return matchCoins(this.sql, id, receipt, reward, at);
  }

  rewardCasual(id: string, receipt: string, reward: MatchRewards, won: boolean, at: number) {
    return casualCoins(this.sql, id, receipt, reward, won, at);
  }

  /** Whether this account still has casual rewards left today. */
  casualAllowance(id: string, at: number): boolean {
    return casualRewardsToday(this.sql, id, at) < CASUAL_DAILY_CAP;
  }

  /**
   * Records a casual match between two accounts, if the pair has not already
   * been paid for enough of them today. Five a day between the same two people
   * is an evening of rematches; more than that is two browsers farming.
   */
  claimCasual(id: string, a: string, b: string, at: number): boolean | null {
    if (this.sql.prepare('SELECT 1 FROM casual_receipts WHERE id=?').get(id)) return null;
    const [one, two] = [a, b].sort() as [string, string];
    const recent = this.sql
      .prepare('SELECT count(*) AS n FROM casual_receipts WHERE a=? AND b=? AND at>? AND rewarded=1')
      .get(one, two, at - 86_400_000);
    const rewarded = Number(recent!.n) < 5;
    this.sql.prepare('INSERT INTO casual_receipts(id,a,b,at,rewarded) VALUES(?,?,?,?,?)')
      .run(id, one, two, at, Number(rewarded));
    return rewarded;
  }

  all(): PlayerProfile[] {
    return this.sql
      .prepare('SELECT payload FROM profiles')
      .all()
      .map((row) => JSON.parse(String(row.payload)) as PlayerProfile);
  }

  /** SQL sorts and pages; the client never receives the whole population. */
  rankedPage(kind: BoardKind, viewer: string | null, offset: number, limit: number) {
    const order =
      kind === 'wins'
        ? 'p.wins DESC,p.rating DESC,p.id'
        : kind === 'streak'
          ? 'p.best_streak DESC,p.rating DESC,p.id'
          : 'p.rating DESC,p.wins DESC,p.id';
    const source = 'FROM profiles p JOIN accounts a ON a.id=p.id WHERE p.matches>=5';
    const total = Number(this.sql.prepare(`SELECT count(*) AS n ${source}`).get()!.n);
    const rows = this.sql
      .prepare(`SELECT p.payload ${source} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(limit, offset);
    const own = viewer
      ? this.sql
          .prepare(
            `SELECT payload,position FROM (
      SELECT p.id,p.payload,row_number() OVER(ORDER BY ${order}) AS position ${source}) WHERE id=?`,
          )
          .get(viewer)
      : undefined;
    return {
      total,
      profiles: rows.map((r) => JSON.parse(String(r.payload)) as PlayerProfile),
      own: own
        ? {
            profile: JSON.parse(String(own.payload)) as PlayerProfile,
            position: Number(own.position),
          }
        : null,
    };
  }

  claimMatch(id: string, a: string, b: string, at: number): boolean {
    const [one, two] = [a, b].sort() as [string, string];
    // Three rewarded encounters per pair/day. Further rematches remain playable.
    const recent = this.sql
      .prepare('SELECT count(*) AS n FROM match_receipts WHERE a=? AND b=? AND at>?')
      .get(one, two, at - 86_400_000);
    if (Number(recent!.n) >= 3) return false;
    return (
      this.sql.prepare('INSERT OR IGNORE INTO match_receipts VALUES(?,?,?,?)').run(id, one, two, at)
        .changes === 1
    );
  }

  queueCooldown(id: string): number {
    return Number(
      this.sql.prepare('SELECT until FROM queue_cooldowns WHERE account_id=?').get(id)?.until ?? 0,
    );
  }

  setQueueCooldown(id: string, until: number): void {
    this.sql
      .prepare(
        'INSERT INTO queue_cooldowns VALUES(?,?) ON CONFLICT(account_id) DO UPDATE SET until=max(until,excluded.until)',
      )
      .run(id, until);
  }

  auditEvaluation(roundId: string, verdict: unknown, at: number): void {
    this.transaction(() => {
      this.sql
        .prepare('INSERT OR REPLACE INTO evaluation_audits VALUES(?,?,?)')
        .run(roundId, at, JSON.stringify(verdict));
      this.sql.prepare('DELETE FROM evaluation_audits WHERE at<?').run(at - 30 * 86_400_000);
    });
  }

  private importLegacy(path: string): void {
    if (this.sql.prepare("SELECT 1 FROM metadata WHERE key='legacy_import'").get()) return;
    if (!existsSync(path)) return;
    // Fail closed on corrupt data. Never overwrite or silently reset the source.
    const rows: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(rows))
      throw new Error('Legacy profiles must be an array. Restore the source before migrating.');
    this.transaction(() => {
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !Number.isFinite(row.rating))
          throw new Error('Invalid legacy profile');
        if (!this.get(row.id)) this.save(hydrate(row as PlayerProfile, Date.now()));
      }
      this.sql.prepare('INSERT INTO metadata VALUES(?,?)').run('legacy_import', String(Date.now()));
    });
  }

  get size(): number {
    return Number(this.sql.prepare('SELECT count(*) AS n FROM profiles').get()!.n);
  }
  close(): void {
    this.sql.close();
  }
}
