import type { DatabaseSync } from 'node:sqlite';

/**
 * The tables behind quests, the season, the calendar, chests and purchases.
 *
 * Additive, like every migration before it: new columns are checked for before
 * they are added, new tables are `IF NOT EXISTS`, and nothing that already
 * holds a player's coins or items is rewritten. Two carry-overs keep existing
 * players whole — today's Telegram quest progress, and every daily gift ever
 * claimed, which is where the new calendar starts counting from.
 */
export function migrateMeta(sql: DatabaseSync): void {
  const columns = (table: string) =>
    sql.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name));

  if (!columns('wallets').includes('gems'))
    sql.exec('ALTER TABLE wallets ADD COLUMN gems INTEGER NOT NULL DEFAULT 0 CHECK(gems >= 0 AND gems <= 100000000);');
  if (!columns('economy_ledger').includes('currency'))
    sql.exec("ALTER TABLE economy_ledger ADD COLUMN currency TEXT NOT NULL DEFAULT 'coins';");
  if (!columns('analytics_events').includes('session_id'))
    sql.exec('ALTER TABLE analytics_events ADD COLUMN session_id TEXT;');

  sql.exec(`
    -- One row per quest per period: 'd:YYYY-MM-DD', 'w:YYYY-Www' or 'starter'.
    CREATE TABLE IF NOT EXISTS quest_progress (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      period_key TEXT NOT NULL,
      quest_id TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0),
      claimed_at INTEGER,
      PRIMARY KEY(account_id, period_key, quest_id)
    );
    CREATE INDEX IF NOT EXISTS quest_progress_period ON quest_progress(period_key);

    -- Where each player is on each season's track.
    CREATE TABLE IF NOT EXISTS season_progress (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, season_id)
    );
    CREATE INDEX IF NOT EXISTS season_progress_top ON season_progress(season_id, points DESC);

    -- Why points were paid, keyed so the same reason never pays twice.
    CREATE TABLE IF NOT EXISTS pass_ledger (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      receipt TEXT NOT NULL,
      season_id TEXT NOT NULL,
      points INTEGER NOT NULL CHECK(points >= 0),
      at INTEGER NOT NULL,
      PRIMARY KEY(account_id, receipt)
    );

    CREATE TABLE IF NOT EXISTS season_claims (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      season_id TEXT NOT NULL,
      tier INTEGER NOT NULL CHECK(tier >= 1),
      track TEXT NOT NULL CHECK(track IN ('free','premium')),
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, season_id, tier, track)
    );

    -- One claim per UTC day; the count of rows is the calendar position.
    CREATE TABLE IF NOT EXISTS calendar_claims (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      square INTEGER NOT NULL CHECK(square >= 0),
      at INTEGER NOT NULL,
      PRIMARY KEY(account_id, day)
    );

    -- What was inside, written once, so a replayed grant replays the same chest.
    CREATE TABLE IF NOT EXISTS chest_openings (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      receipt TEXT NOT NULL,
      chest_id TEXT NOT NULL,
      contents TEXT NOT NULL CHECK(json_valid(contents)),
      at INTEGER NOT NULL,
      PRIMARY KEY(account_id, receipt)
    );

    -- Every offer bought, with any currency. provider_ref is the payment
    -- provider's own id (a Stripe session, a Telegram charge) and is unique,
    -- which is what makes fulfilment idempotent against retried webhooks.
    CREATE TABLE IF NOT EXISTS purchases (
      order_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      offer_id TEXT NOT NULL,
      provider TEXT NOT NULL CHECK(provider IN ('stripe','telegram_stars','gems','coins')),
      provider_ref TEXT UNIQUE,
      provider_payment TEXT,
      amount INTEGER NOT NULL CHECK(amount >= 0),
      currency TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','paid','refunded','failed')),
      granted TEXT CHECK(granted IS NULL OR json_valid(granted)),
      created_at INTEGER NOT NULL,
      paid_at INTEGER,
      refunded_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS purchases_account ON purchases(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS purchases_paid ON purchases(status, paid_at);
    CREATE INDEX IF NOT EXISTS purchases_payment ON purchases(provider_payment);
    CREATE TABLE IF NOT EXISTS stripe_refunds (
      payment_intent TEXT PRIMARY KEY,
      amount INTEGER NOT NULL CHECK(amount >= 0),
      full INTEGER NOT NULL CHECK(full IN (0,1))
    );

    -- Casual match receipts, including capped matches, for replay protection.
    CREATE TABLE IF NOT EXISTS casual_receipts (
      id TEXT PRIMARY KEY,
      a TEXT NOT NULL REFERENCES profiles(id),
      b TEXT NOT NULL REFERENCES profiles(id),
      at INTEGER NOT NULL,
      CHECK(a <> b)
    );
    CREATE INDEX IF NOT EXISTS casual_receipts_pair ON casual_receipts(a, b, at DESC);

    CREATE TABLE IF NOT EXISTS meta_match_receipts (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      match_id TEXT NOT NULL,
      result TEXT NOT NULL CHECK(json_valid(result)),
      PRIMARY KEY(account_id, match_id)
    );
    CREATE TABLE IF NOT EXISTS reward_grants (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      receipt TEXT NOT NULL,
      granted TEXT NOT NULL CHECK(json_valid(granted)),
      PRIMARY KEY(account_id, receipt)
    );

    -- Days a player finished a match, and firsts that happen once per account.
    CREATE TABLE IF NOT EXISTS activity_days (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      day TEXT NOT NULL,
      PRIMARY KEY(account_id, day)
    );
    CREATE TABLE IF NOT EXISTS account_milestones (
      account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      at INTEGER NOT NULL,
      PRIMARY KEY(account_id, key)
    );

    CREATE INDEX IF NOT EXISTS analytics_events_account ON analytics_events(account_id, at);
    CREATE INDEX IF NOT EXISTS analytics_events_session ON analytics_events(session_id, at);

    INSERT OR IGNORE INTO quest_progress(account_id, period_key, quest_id, progress, claimed_at)
      SELECT account_id, 'd:' || day, quest_id, progress, claimed_at FROM daily_quests;
    INSERT OR IGNORE INTO calendar_claims(account_id, day, square, at)
      SELECT account_id, substr(receipt, 7), 0, at FROM economy_ledger WHERE receipt LIKE 'daily:____-__-__';

    INSERT OR IGNORE INTO migrations VALUES(6, unixepoch()*1000);
  `);
  if (!columns('casual_receipts').includes('rewarded'))
    sql.exec('ALTER TABLE casual_receipts ADD COLUMN rewarded INTEGER NOT NULL DEFAULT 1 CHECK(rewarded IN (0,1));');
  if (!columns('purchases').includes('refunded_amount'))
    sql.exec('ALTER TABLE purchases ADD COLUMN refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK(refunded_amount >= 0);');
  sql.exec('INSERT OR IGNORE INTO migrations VALUES(7, unixepoch()*1000);');
}

/** Remove obsolete daily quest progress; delivery receipts remain durable. */
export function sweepMeta(sql: DatabaseSync, now: number): void {
  const cutoff = new Date(now - 21 * 86_400_000).toISOString().slice(0, 10);
  sql.prepare("DELETE FROM quest_progress WHERE period_key LIKE 'd:%' AND period_key < ?").run(`d:${cutoff}`);
  // Match and payment receipts are durable: deleting them would let delayed
  // deliveries replay an old result or lose an already-paid pending order.
}
