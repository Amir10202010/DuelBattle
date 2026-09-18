import type { DatabaseSync } from 'node:sqlite';

/**
 * Every table the Telegram side owns, in one idempotent migration.
 *
 * It runs inside the same boot transaction as the rest of the schema, in the
 * same style: `CREATE TABLE IF NOT EXISTS`, foreign keys back to `accounts`,
 * `ON DELETE CASCADE` so deleting an account really does delete the person, and
 * one row in `migrations` so an operator can see it applied.
 *
 * Two rules held throughout:
 *
 *   - `accounts.id` is the only user identifier. Nothing here introduces a
 *     second one, and every table hangs off it.
 *   - Nothing stores raw `initData`, a bot token, a session token or a code in
 *     the clear. Codes are hashed the same way session tokens already are.
 *
 * Indexes are added where a query in this package actually sorts or filters,
 * and nowhere else: an index nobody reads is a write cost with a straight face.
 */
export function migrateTelegram(sql: DatabaseSync): void {
  sql.exec(`
    -- Who somebody is on Telegram, and which account that is here.
    -- Both sides unique: one Telegram account, one player, in both directions.
    CREATE TABLE IF NOT EXISTS telegram_identities (
      telegram_user_id INTEGER PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
      username TEXT,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT,
      language_code TEXT,
      photo_url TEXT,
      allows_write_to_pm INTEGER NOT NULL DEFAULT 0 CHECK(allows_write_to_pm IN (0,1)),
      is_premium INTEGER NOT NULL DEFAULT 0 CHECK(is_premium IN (0,1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS telegram_identities_seen ON telegram_identities(last_seen_at DESC);

    -- A name for a player that is safe to put in a payload.
    -- The account id is the database's own key and appears in half the schema;
    -- handing it to a client so that one profile card can link to another is
    -- how an internal identifier becomes a public one by accident.
    CREATE TABLE IF NOT EXISTS player_refs (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      ref TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    -- Telegram retries anything it thinks was not delivered, and a retry that
    -- pays a referral twice is the reason this table exists.
    CREATE TABLE IF NOT EXISTS telegram_updates (
      update_id INTEGER PRIMARY KEY,
      at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS telegram_updates_at ON telegram_updates(at);

    -- One-time codes that attach Telegram to an account someone already has in
    -- a browser. Hashed, short-lived, single use.
    CREATE TABLE IF NOT EXISTS telegram_link_codes (
      code_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS telegram_link_codes_account ON telegram_link_codes(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS telegram_link_codes_expiry ON telegram_link_codes(expires_at);

    -- A duel one player offered another. The room code is filled in when the
    -- first of them arrives to play it, and both sides read the same row.
    CREATE TABLE IF NOT EXISTS telegram_duels (
      code TEXT PRIMARY KEY,
      host_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      guest_account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','playing','completed','expired','declined')),
      room_code TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      accepted_at INTEGER,
      settled_at INTEGER,
      CHECK(guest_account_id IS NULL OR guest_account_id <> host_account_id)
    );
    CREATE INDEX IF NOT EXISTS telegram_duels_host ON telegram_duels(host_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS telegram_duels_guest ON telegram_duels(guest_account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS telegram_duels_expiry ON telegram_duels(status, expires_at);

    -- Invite codes. One per account, stable, and never reissued: a link a
    -- player has already shared must not stop working.
    CREATE TABLE IF NOT EXISTS referral_codes (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );

    -- Who invited whom. The invitee is the primary key, so an invitee has
    -- exactly one inviter, set once, for good.
    CREATE TABLE IF NOT EXISTS referral_claims (
      invitee_account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      inviter_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK(status IN ('pending','activated','rewarded')),
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      rewarded_at INTEGER,
      CHECK(inviter_account_id <> invitee_account_id)
    );
    CREATE INDEX IF NOT EXISTS referral_claims_inviter ON referral_claims(inviter_account_id, created_at DESC);

    -- What a player agreed to be messaged about. A row missing means defaults.
    CREATE TABLE IF NOT EXISTS notification_prefs (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      matches INTEGER NOT NULL DEFAULT 1 CHECK(matches IN (0,1)),
      challenges INTEGER NOT NULL DEFAULT 1 CHECK(challenges IN (0,1)),
      achievements INTEGER NOT NULL DEFAULT 1 CHECK(achievements IN (0,1)),
      social INTEGER NOT NULL DEFAULT 1 CHECK(social IN (0,1)),
      digest INTEGER NOT NULL DEFAULT 1 CHECK(digest IN (0,1)),
      quiet_from INTEGER,
      quiet_to INTEGER,
      utc_offset_minutes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    -- Nothing in a request path waits on api.telegram.org. Messages are written
    -- here and drained by one worker.
    CREATE TABLE IF NOT EXISTS notification_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL CHECK(json_valid(payload)),
      not_before INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('queued','sent','failed','dropped')),
      last_error TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS notification_outbox_due ON notification_outbox(state, not_before);
    CREATE INDEX IF NOT EXISTS notification_outbox_account ON notification_outbox(account_id, created_at DESC);

    -- What a player is entitled to, independent of who was paid for it.
    CREATE TABLE IF NOT EXISTS entitlements (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      feature TEXT NOT NULL,
      source TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      expires_at INTEGER,
      PRIMARY KEY(account_id, feature)
    );
    CREATE INDEX IF NOT EXISTS entitlements_expiry ON entitlements(expires_at);

    -- One row per charge Telegram confirmed. The charge id is the primary key,
    -- which is exactly what makes granting the entitlement idempotent.
    CREATE TABLE IF NOT EXISTS telegram_payments (
      charge_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      product TEXT NOT NULL,
      stars INTEGER NOT NULL CHECK(stars >= 0),
      payload TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('paid','refunded')),
      created_at INTEGER NOT NULL,
      refunded_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS telegram_payments_account ON telegram_payments(account_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS player_friends (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      friend_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, friend_account_id),
      CHECK(account_id <> friend_account_id)
    );

    -- Who you have just played. The match history keeps a name, which is enough
    -- to read a result and not enough to offer a rematch, so the pairing is
    -- written here when the match settles.
    CREATE TABLE IF NOT EXISTS recent_opponents (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      opponent_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      at INTEGER NOT NULL,
      PRIMARY KEY(account_id, opponent_account_id),
      CHECK(account_id <> opponent_account_id)
    );
    CREATE INDEX IF NOT EXISTS recent_opponents_at ON recent_opponents(account_id, at DESC);

    CREATE TABLE IF NOT EXISTS player_blocks (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      blocked_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, blocked_account_id),
      CHECK(account_id <> blocked_account_id)
    );

    -- Reports are evidence for a person to read, never an automatic ban.
    CREATE TABLE IF NOT EXISTS player_reports (
      id TEXT PRIMARY KEY,
      reporter_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      target_account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      note TEXT,
      state TEXT NOT NULL CHECK(state IN ('open','reviewed','dismissed')),
      created_at INTEGER NOT NULL,
      CHECK(reporter_account_id <> target_account_id)
    );
    CREATE INDEX IF NOT EXISTS player_reports_open ON player_reports(state, created_at DESC);
    CREATE INDEX IF NOT EXISTS player_reports_target ON player_reports(target_account_id, created_at DESC);

    -- Daily missions. Progress is written by the server, from settled matches.
    CREATE TABLE IF NOT EXISTS daily_quests (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0),
      claimed_at INTEGER,
      PRIMARY KEY(account_id, day, quest_id)
    );
    CREATE INDEX IF NOT EXISTS daily_quests_day ON daily_quests(day);

    -- Turning up two days running is a different thing from winning twice, and
    -- mixing them would make both meaningless.
    CREATE TABLE IF NOT EXISTS daily_streaks (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
      current INTEGER NOT NULL DEFAULT 0 CHECK(current >= 0),
      best INTEGER NOT NULL DEFAULT 0 CHECK(best >= 0),
      last_day TEXT NOT NULL
    );

    -- Product analytics, server-side, with no third party in it.
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      name TEXT NOT NULL,
      account_id TEXT,
      props TEXT NOT NULL CHECK(json_valid(props))
    );
    CREATE INDEX IF NOT EXISTS analytics_events_at ON analytics_events(at DESC);
    CREATE INDEX IF NOT EXISTS analytics_events_name ON analytics_events(name, at DESC);

    -- Anything an administrator did, and to whom.
    CREATE TABLE IF NOT EXISTS admin_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at INTEGER NOT NULL,
      admin_telegram_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      metadata TEXT NOT NULL CHECK(json_valid(metadata))
    );
    CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit(at DESC);

    INSERT OR IGNORE INTO migrations VALUES(5, unixepoch()*1000);
  `);
}

/**
 * Clears the rows that exist only to be forgotten.
 *
 * Idempotency records, spent codes and delivered messages are all evidence with
 * a shelf life. Left alone they are the only tables in this schema that grow
 * without bound, which on a one-file database is a real cost.
 */
export function sweepTelegram(sql: DatabaseSync, now: number): void {
  sql.prepare('DELETE FROM telegram_updates WHERE at < ?').run(now - 2 * 86_400_000);
  sql.prepare('DELETE FROM telegram_link_codes WHERE expires_at < ?').run(now - 86_400_000);
  sql
    .prepare("UPDATE telegram_duels SET status='expired' WHERE status='pending' AND expires_at < ?")
    .run(now);
  sql
    .prepare("DELETE FROM notification_outbox WHERE state IN ('sent','dropped','failed') AND created_at < ?")
    .run(now - 7 * 86_400_000);
  sql.prepare('DELETE FROM daily_quests WHERE day < ?').run(
    new Date(now - 14 * 86_400_000).toISOString().slice(0, 10),
  );
  sql.prepare('DELETE FROM analytics_events WHERE at < ?').run(now - 90 * 86_400_000);
  sql.prepare('DELETE FROM admin_audit WHERE at < ?').run(now - 365 * 86_400_000);
}
