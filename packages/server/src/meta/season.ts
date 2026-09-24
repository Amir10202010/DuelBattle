import type { DatabaseSync } from 'node:sqlite';
import {
  PASS_PLUS_PRICE_GEMS,
  PASS_PLUS_TIERS,
  PASS_PRICE_GEMS,
  POINTS_PER_TIER,
  TIERS_PER_SEASON,
  seasonAt,
  seasonLevel,
  type Reward,
  type SeasonView,
} from '@battle/shared';
import { AuthError } from '../auth.js';
import type { Entitlements } from '../entitlements.js';

/** Points on this season's track right now. */
export function seasonPoints(sql: DatabaseSync, accountId: string, seasonId: string): number {
  return Number(
    sql.prepare('SELECT points FROM season_progress WHERE account_id=? AND season_id=?').get(accountId, seasonId)?.points ?? 0,
  );
}

/**
 * Moves a player along the current track, once per receipt.
 *
 * Returns the totals either side, or null when the receipt was already paid.
 * Points past the last tier are still recorded — they are how the dashboard
 * knows who finished early — they simply move nothing on screen.
 */
export function addPassPoints(
  sql: DatabaseSync,
  accountId: string,
  receipt: string,
  points: number,
  now: number,
): { before: number; after: number; seasonId: string } | null {
  if (!Number.isSafeInteger(points) || points <= 0 || points > 50_000) return null;
  const season = seasonAt(now);
  const inserted = sql
    .prepare('INSERT OR IGNORE INTO pass_ledger(account_id,receipt,season_id,points,at) VALUES(?,?,?,?,?)')
    .run(accountId, receipt, season.id, points, now);
  if (!inserted.changes) return null;
  const before = seasonPoints(sql, accountId, season.id);
  sql
    .prepare(
      `INSERT INTO season_progress(account_id,season_id,points,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(account_id,season_id) DO UPDATE SET points=points+excluded.points, updated_at=excluded.updated_at`,
    )
    .run(accountId, season.id, points, now);
  return { before, after: before + points, seasonId: season.id };
}

export class SeasonPass {
  constructor(
    private readonly sql: DatabaseSync,
    private readonly entitlements: Entitlements,
  ) {}

  view(accountId: string, now: number): SeasonView {
    const season = seasonAt(now);
    const points = seasonPoints(this.sql, accountId, season.id);
    const level = seasonLevel(points);
    const track = this.entitlements.premiumTrack(accountId, season.id, now);
    const claims = new Set(
      this.sql
        .prepare('SELECT tier, track FROM season_claims WHERE account_id=? AND season_id=?')
        .all(accountId, season.id)
        .map((row) => `${String(row.track)}:${Number(row.tier)}`),
    );
    return {
      id: season.id,
      number: season.number,
      name: season.name,
      tagline: season.tagline,
      accent: season.accent,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      points,
      tier: level.tier,
      into: level.into,
      cost: level.cost,
      maxed: level.maxed,
      premium: track.open,
      premiumViaMembership: track.viaMembership,
      passPrice: PASS_PRICE_GEMS,
      plusPrice: PASS_PLUS_PRICE_GEMS,
      plusTiers: PASS_PLUS_TIERS,
      tiers: season.tiers.map((tier) => ({
        ...tier,
        reached: tier.tier <= level.tier,
        freeClaimed: claims.has(`free:${tier.tier}`),
        premiumClaimed: claims.has(`premium:${tier.tier}`),
      })),
    };
  }

  /**
   * Marks a tier's reward as taken and returns what it holds.
   *
   * The caller pays it out inside the same transaction. A premium claim needs
   * the premium track open at the moment of claiming — buying the pass later
   * opens every tier already reached, which is the whole promise of it.
   */
  claim(accountId: string, tier: number, trackName: 'free' | 'premium', now: number): Reward[] {
    const season = seasonAt(now);
    if (!Number.isInteger(tier) || tier < 1 || tier > TIERS_PER_SEASON) throw new AuthError(404, 'That tier does not exist.');
    const reached = seasonLevel(seasonPoints(this.sql, accountId, season.id)).tier;
    if (tier > reached) throw new AuthError(409, 'Reach this tier first.');
    if (trackName === 'premium' && !this.entitlements.premiumTrack(accountId, season.id, now).open)
      throw new AuthError(402, 'Unlock the premium track to claim this.');
    const inserted = this.sql
      .prepare('INSERT OR IGNORE INTO season_claims(account_id,season_id,tier,track,claimed_at) VALUES(?,?,?,?,?)')
      .run(accountId, season.id, tier, trackName, now);
    if (!inserted.changes) throw new AuthError(409, 'Already collected.');
    const definition = season.tiers[tier - 1]!;
    return trackName === 'free' ? definition.free : definition.premium;
  }

  /** Every reward that is reached and waiting, in tier order. */
  claimable(accountId: string, now: number): { tier: number; track: 'free' | 'premium' }[] {
    const view = this.view(accountId, now);
    const open: { tier: number; track: 'free' | 'premium' }[] = [];
    for (const tier of view.tiers) {
      if (!tier.reached) break;
      if (!tier.freeClaimed) open.push({ tier: tier.tier, track: 'free' });
      if (view.premium && !tier.premiumClaimed) open.push({ tier: tier.tier, track: 'premium' });
    }
    return open;
  }

  /** Ten tiers straight away, for the plus pass. Paid once per season. */
  skipTiers(accountId: string, tiers: number, now: number) {
    const season = seasonAt(now);
    return addPassPoints(this.sql, accountId, `pass-plus:${season.id}`, tiers * POINTS_PER_TIER, now);
  }
}
