import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Profile, RoomSnapshot } from '../shared/protocol';
import { GameError } from './errors';

const DAY = 86_400_000;
export interface Session {
  id: string;
  csrf: string;
  expiresAt: number;
}
export interface SubscriptionProvider {
  getPlan(userId: string, now: number): 'free' | 'premium';
}
export class Store implements SubscriptionProvider {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY);
    `);
    if (!this.db.prepare('SELECT 1 FROM migrations WHERE version=1').get()) {
      this.db.exec(`BEGIN IMMEDIATE;
        CREATE TABLE users(id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
        CREATE TABLE sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
        CREATE INDEX idx_sessions_expiry ON sessions(expires_at);
        CREATE TABLE subscriptions(user_id TEXT PRIMARY KEY REFERENCES users(id), expires_at INTEGER NOT NULL, provider TEXT NOT NULL);
        CREATE TABLE usage(user_id TEXT NOT NULL REFERENCES users(id), day TEXT NOT NULL, count INTEGER NOT NULL CHECK(count >= 0), last_start INTEGER NOT NULL, PRIMARY KEY(user_id, day));
        CREATE TABLE match_results(id TEXT PRIMARY KEY, room_code TEXT NOT NULL, summary TEXT NOT NULL, finished_at INTEGER NOT NULL);
        CREATE INDEX idx_match_results_finished ON match_results(finished_at);
        INSERT INTO migrations VALUES(1);
        COMMIT;`);
    }
  }
  createSession(now = Date.now()) {
    const token = randomBytes(32).toString('base64url');
    const session: Session = {
      id: randomUUID(),
      csrf: randomBytes(24).toString('base64url'),
      expiresAt: now + 30 * DAY,
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO users VALUES(?,?)').run(session.id, now);
      this.db
        .prepare('INSERT INTO sessions VALUES(?,?,?,?)')
        .run(this.hash(token), session.id, session.csrf, session.expiresAt);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return { token, session };
  }
  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  session(token: string | undefined, now = Date.now()): Session | undefined {
    if (!token || token.length > 128) return;
    const row = this.db
      .prepare(
        'SELECT user_id id, csrf, expires_at expiresAt FROM sessions WHERE token_hash=? AND expires_at>?',
      )
      .get(this.hash(token), now);
    return row as unknown as Session | undefined;
  }
  getPlan(userId: string, now: number): 'free' | 'premium' {
    return this.db
      .prepare('SELECT 1 FROM subscriptions WHERE user_id=? AND expires_at>?')
      .get(userId, now)
      ? 'premium'
      : 'free';
  }
  profile(session: Session, now = Date.now()): Profile {
    const day = new Date(now).toISOString().slice(0, 10);
    const plan = this.getPlan(session.id, now);
    const row = this.db
      .prepare('SELECT count, last_start FROM usage WHERE user_id=? AND day=?')
      .get(session.id, day);
    const recent = this.db
      .prepare('SELECT MAX(last_start) last FROM usage WHERE user_id=?')
      .get(session.id);
    const last = Number(recent?.last ?? 0);
    return {
      id: session.id,
      csrf: session.csrf,
      plan,
      remaining: plan === 'free' ? Math.max(0, 3 - Number(row?.count ?? 0)) : null,
      resetAt: (Math.floor(now / DAY) + 1) * DAY,
      nextBattleAt: plan === 'premium' && last && last + 3_600_000 > now ? last + 3_600_000 : null,
    };
  }
  consumeBattle(userIds: string[], now: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of new Set(userIds)) {
        const p = this.profile({ id, csrf: '', expiresAt: 0 }, now);
        if (p.remaining === 0)
          throw new GameError(
            'USAGE_LIMIT',
            "A player has reached today's free battle limit. Come back after midnight UTC.",
          );
        if (p.nextBattleAt)
          throw new GameError(
            'USAGE_LIMIT',
            'A Premium player can start their next battle one hour after their last.',
          );
      }
      for (const id of new Set(userIds))
        this.db
          .prepare(
            `INSERT INTO usage VALUES(?,?,1,?) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1,last_start=excluded.last_start`,
          )
          .run(id, new Date(now).toISOString().slice(0, 10), now);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  grantPremium(userId: string, expiresAt: number, provider = 'operator') {
    this.db
      .prepare(
        'INSERT INTO subscriptions VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at,provider=excluded.provider',
      )
      .run(userId, expiresAt, provider);
  }
  saveResult(room: RoomSnapshot, now: number) {
    // Metadata only: no webcam images, microphone data, or session credentials.
    this.db.prepare('INSERT OR IGNORE INTO match_results VALUES(?,?,?,?)').run(
      room.matchId!,
      room.code,
      JSON.stringify({
        players: room.players.map((p) => ({ id: p.id, name: p.name, score: p.score })),
        winnerId: room.winnerId,
        history: room.history,
      }),
      now,
    );
  }
  cleanup(now: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
    this.db
      .prepare('DELETE FROM usage WHERE day<?')
      .run(new Date(now - 32 * DAY).toISOString().slice(0, 10));
    this.db.prepare('DELETE FROM match_results WHERE finished_at<?').run(now - 30 * DAY);
    this.db.prepare('DELETE FROM subscriptions WHERE expires_at<?').run(now);
    this.db
      .prepare(
        'DELETE FROM users WHERE NOT EXISTS(SELECT 1 FROM sessions WHERE user_id=users.id) AND NOT EXISTS(SELECT 1 FROM subscriptions WHERE user_id=users.id) AND NOT EXISTS(SELECT 1 FROM usage WHERE user_id=users.id)',
      )
      .run();
  }
  close() {
    this.db.close();
  }
}
