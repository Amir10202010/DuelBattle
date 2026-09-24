import { chest, coins, gems, item, type Reward } from './rewards.js';

/**
 * The season: six weeks, thirty tiers, two tracks.
 *
 * The free track is for everybody and pays something at every tier, because a
 * tier with nothing on it is a bar that moved for no reason. The premium track
 * is the thing worth buying: every original look the season introduces, plus
 * most of its own price back in gems for a player who finishes it.
 *
 * Seasons are computed rather than stored. A season that an operator has not
 * written content for still runs — with currency and chests where the
 * exclusives would be, and a plain name — so the pass never stops working on a
 * deployment nobody has touched in months.
 */

export const TIERS_PER_SEASON = 30;
export const POINTS_PER_TIER = 500;
export const SEASON_LENGTH_MS = 42 * 86_400_000;
/** Monday 21 September 2026, 00:00 UTC: the first day of Season 1. */
export const SEASON_ANCHOR = Date.UTC(2026, 8, 21);

/** Premium track, in gems. */
export const PASS_PRICE_GEMS = 600;
/** Premium track plus ten tiers of progress, in gems. */
export const PASS_PLUS_PRICE_GEMS = 1000;
export const PASS_PLUS_TIERS = 10;

/**
 * Pass points for one finished match.
 *
 * Showing up is most of it. A loss still moves the bar — the point of a pass
 * is that an evening of losing was not nothing — and ranked pays a little more
 * because it asks more of you.
 */
export const PASS_POINTS = { finish: 20, win: 30, round: 5, ranked: 10, firstWinOfDay: 60 } as const;

export function matchPassPoints(input: { result: 'win' | 'loss' | 'draw'; roundsWon: number; ranked: boolean }): number {
  return (
    PASS_POINTS.finish +
    (input.result === 'win' ? PASS_POINTS.win : 0) +
    Math.max(0, input.roundsWon) * PASS_POINTS.round +
    (input.ranked ? PASS_POINTS.ranked : 0)
  );
}

export interface SeasonTier {
  tier: number;
  free: Reward[];
  premium: Reward[];
}

export interface Season {
  id: string;
  number: number;
  name: string;
  tagline: string;
  accent: string;
  startsAt: number;
  endsAt: number;
  tiers: SeasonTier[];
}

/** Hand-written content: the exclusive rewards and the name of a season. */
interface SeasonContent {
  name: string;
  tagline: string;
  accent: string;
  free: Record<number, Reward[]>;
  premium: Record<number, Reward[]>;
}

const CONTENT: Record<number, SeasonContent> = {
  1: {
    name: 'Lights On',
    tagline: 'Everything in your room is fair game.',
    accent: '#ffcf5a',
    free: {
      3: [item('title-scavenger')],
      12: [item('banner-pinboard')],
      20: [item('copper-curls')],
      28: [item('title-night-owl')],
    },
    premium: {
      1: [item('lamplighter'), item('title-lights-on')],
      5: [item('banner-filament')],
      10: [item('neon-fringe')],
      15: [item('afterglow')],
      20: [item('title-room-raider')],
      25: [item('night-shift')],
      30: [item('banner-golden-hour'), item('title-showstopper')],
    },
  },
};

/** The currency spine every season shares. Content above replaces a tier's slot. */
const FREE_SPINE: Record<number, Reward[]> = {
  1: [coins(100)], 2: [coins(120)], 3: [coins(150)], 4: [coins(150)], 5: [chest('battle')],
  6: [gems(10)], 7: [coins(150)], 8: [coins(180)], 9: [coins(180)], 10: [chest('battle')],
  11: [coins(200)], 12: [coins(200)], 13: [coins(200)], 14: [gems(10)], 15: [chest('rare')],
  16: [coins(220)], 17: [coins(220)], 18: [gems(15)], 19: [coins(250)], 20: [coins(250)],
  21: [coins(250)], 22: [chest('battle')], 23: [coins(250)], 24: [gems(15)], 25: [chest('rare')],
  26: [coins(300)], 27: [coins(300)], 28: [coins(300)], 29: [gems(20)], 30: [chest('epic')],
};

const PREMIUM_SPINE: Record<number, Reward[]> = {
  1: [gems(40)], 2: [coins(250)], 3: [gems(50)], 4: [chest('battle')], 5: [coins(300)],
  6: [coins(300)], 7: [chest('rare')], 8: [gems(50)], 9: [coins(300)], 10: [gems(40)],
  11: [coins(350)], 12: [gems(60)], 13: [chest('rare')], 14: [coins(350)], 15: [coins(400)],
  16: [gems(60)], 17: [coins(400)], 18: [chest('rare')], 19: [gems(70)], 20: [coins(450)],
  21: [coins(400)], 22: [gems(70)], 23: [chest('epic')], 24: [coins(450)], 25: [coins(500)],
  26: [gems(80)], 27: [chest('epic')], 28: [coins(500)], 29: [gems(100)], 30: [chest('epic'), gems(60)],
};

function build(number: number): Season {
  const content = CONTENT[number];
  const startsAt = SEASON_ANCHOR + (number - 1) * SEASON_LENGTH_MS;
  const tiers: SeasonTier[] = [];
  for (let tier = 1; tier <= TIERS_PER_SEASON; tier++) {
    tiers.push({
      tier,
      free: content?.free[tier] ?? FREE_SPINE[tier] ?? [],
      premium: content?.premium[tier] ?? PREMIUM_SPINE[tier] ?? [],
    });
  }
  return {
    id: `s${number}`,
    number,
    name: content?.name ?? `Season ${number}`,
    tagline: content?.tagline ?? 'Play, climb the track, collect it all.',
    accent: content?.accent ?? '#d5f861',
    startsAt,
    endsAt: startsAt + SEASON_LENGTH_MS,
    tiers,
  };
}

const cache = new Map<number, Season>();

/** The season running at a moment. Before the anchor it is Season 1. */
export function seasonAt(now: number): Season {
  const number = Math.max(1, Math.floor((now - SEASON_ANCHOR) / SEASON_LENGTH_MS) + 1);
  let season = cache.get(number);
  if (!season) {
    season = build(number);
    cache.set(number, season);
  }
  return season;
}

/** Where a points total sits on the track. Tier 0 means nothing reached yet. */
export function seasonLevel(points: number): {
  tier: number;
  into: number;
  cost: number;
  progress: number;
  maxed: boolean;
} {
  const safe = Math.max(0, Math.floor(points));
  const tier = Math.min(TIERS_PER_SEASON, Math.floor(safe / POINTS_PER_TIER));
  const maxed = tier >= TIERS_PER_SEASON;
  const into = maxed ? POINTS_PER_TIER : safe - tier * POINTS_PER_TIER;
  return { tier, into, cost: POINTS_PER_TIER, progress: into / POINTS_PER_TIER, maxed };
}

export interface SeasonTierView extends SeasonTier {
  reached: boolean;
  freeClaimed: boolean;
  premiumClaimed: boolean;
}

export interface SeasonView {
  id: string;
  number: number;
  name: string;
  tagline: string;
  accent: string;
  startsAt: number;
  endsAt: number;
  points: number;
  tier: number;
  into: number;
  cost: number;
  maxed: boolean;
  premium: boolean;
  /** Premium comes with an active membership rather than a purchase. */
  premiumViaMembership: boolean;
  passPrice: number;
  plusPrice: number;
  plusTiers: number;
  tiers: SeasonTierView[];
}
