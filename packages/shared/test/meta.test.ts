import { describe, expect, it } from 'vitest';
import { COSMETICS, cosmetic, cosmeticState, soldForCoins } from '../src/cosmetics.js';
import {
  CHESTS,
  DAILY_CALENDAR,
  DAILY_QUESTS,
  OFFERS,
  POINTS_PER_TIER,
  SEASON_ANCHOR,
  SEASON_LENGTH_MS,
  STARTER_QUESTS,
  TIERS_PER_SEASON,
  WEEKLY_QUESTS,
  calendarIndex,
  chestPool,
  dailyBoard,
  dailyDeals,
  dayKey,
  isClientEvent,
  matchPassPoints,
  nextDayAt,
  nextWeekAt,
  rollChest,
  sanitizeProps,
  seasonAt,
  seasonLevel,
  totals,
  weekKey,
  weeklyBoard,
  type QuestMatchEvent,
  type Reward,
} from '../src/meta/index.js';

/** Deterministic randomness for the chest tests. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const matchEvent = (patch: Partial<QuestMatchEvent> = {}): QuestMatchEvent => ({
  type: 'match', result: 'win', roundsWon: 3, validAnswers: 4, streak: 1, ranked: false,
  friendRoom: false, upset: false, fastestWinMs: 8000, firstOfDay: false, ...patch,
});

const itemIds = (rewards: readonly Reward[]) =>
  rewards.flatMap((reward) => (reward.kind === 'item' ? [reward.itemId] : []));

describe('calendar keys', () => {
  it('names ISO weeks the way a calendar does', () => {
    expect(weekKey(Date.UTC(2026, 8, 23))).toBe('2026-W39');
    // 1 January 2027 is a Friday, so it still belongs to the last week of 2026.
    expect(weekKey(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    expect(weekKey(Date.UTC(2027, 0, 4))).toBe('2027-W01');
    // 29 December 2025 is a Monday that already belongs to 2026's first week.
    expect(weekKey(Date.UTC(2025, 11, 29))).toBe('2026-W01');
  });

  it('resets days at midnight UTC and weeks on Monday', () => {
    const wednesday = Date.UTC(2026, 8, 23, 15, 30);
    expect(nextDayAt(wednesday)).toBe(Date.UTC(2026, 8, 24));
    expect(nextWeekAt(wednesday)).toBe(Date.UTC(2026, 8, 28));
    expect(dayKey(wednesday)).toBe('2026-09-23');
  });
});

describe('quest boards', () => {
  it('deals the same three dailies to everyone, one per slot', () => {
    const board = dailyBoard('2026-09-23');
    expect(board).toHaveLength(3);
    expect(board.map((q) => q.slot)).toEqual(['play', 'win', 'spice']);
    expect(dailyBoard('2026-09-23').map((q) => q.id)).toEqual(board.map((q) => q.id));
  });

  it('rotates across days', () => {
    const seen = new Set<string>();
    for (let d = 1; d <= 20; d++) seen.add(dailyBoard(`2026-10-${String(d).padStart(2, '0')}`).map((q) => q.id).join());
    expect(seen.size).toBeGreaterThan(5);
  });

  it('deals three different weekly quests', () => {
    for (const week of ['2026-W39', '2026-W40', '2026-W41', '2027-W01']) {
      const ids = weeklyBoard(week).map((q) => q.id);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
    }
  });

  it('moves only on the events a quest asks about', () => {
    const win1 = DAILY_QUESTS.find((q) => q.id === 'win-1')!;
    expect(win1.advance(matchEvent({ result: 'loss' }))).toBe(0);
    expect(win1.advance(matchEvent())).toBe(1);
    expect(win1.advance({ type: 'equip' })).toBe(0);
    const upset = DAILY_QUESTS.find((q) => q.id === 'upset')!;
    expect(upset.advance(matchEvent({ upset: false }))).toBe(0);
    expect(upset.advance(matchEvent({ upset: true, ranked: true }))).toBe(1);
    const days = WEEKLY_QUESTS.find((q) => q.id === 'w-days-4')!;
    expect(days.advance(matchEvent({ firstOfDay: false }))).toBe(0);
    expect(days.advance(matchEvent({ firstOfDay: true }))).toBe(1);
  });

  it('walks a new player through the game in order, ending on the ladder', () => {
    expect(STARTER_QUESTS.map((q) => q.id)).toEqual([
      'st-first-duel', 'st-first-round', 'st-equip', 'st-daily', 'st-first-win', 'st-ranked',
    ]);
    expect(STARTER_QUESTS.find((q) => q.id === 'st-equip')!.advance({ type: 'equip' })).toBe(1);
    expect(STARTER_QUESTS.find((q) => q.id === 'st-daily')!.advance({ type: 'daily' })).toBe(1);
  });

  it('only pays rewards that exist', () => {
    for (const quest of [...DAILY_QUESTS, ...WEEKLY_QUESTS, ...STARTER_QUESTS]) {
      expect(quest.rewards.length).toBeGreaterThan(0);
      for (const id of itemIds(quest.rewards)) expect(cosmetic(id), `${quest.id} -> ${id}`).toBeDefined();
    }
  });
});

describe('the season', () => {
  it('starts on the anchor and lasts six weeks', () => {
    const one = seasonAt(SEASON_ANCHOR + 1000);
    expect(one.id).toBe('s1');
    expect(one.name).toBe('Lights On');
    expect(one.endsAt - one.startsAt).toBe(SEASON_LENGTH_MS);
    expect(seasonAt(SEASON_ANCHOR - 86_400_000).id).toBe('s1');
    expect(seasonAt(one.endsAt).id).toBe('s2');
  });

  it('has a reward on both tracks of every tier', () => {
    for (const number of [1, 2, 7]) {
      const season = seasonAt(SEASON_ANCHOR + (number - 1) * SEASON_LENGTH_MS);
      expect(season.tiers).toHaveLength(TIERS_PER_SEASON);
      for (const tier of season.tiers) {
        expect(tier.free.length).toBeGreaterThan(0);
        expect(tier.premium.length).toBeGreaterThan(0);
        for (const id of itemIds([...tier.free, ...tier.premium])) expect(cosmetic(id)).toBeDefined();
      }
    }
  });

  it('never hands a later season the first season\'s exclusives', () => {
    const later = seasonAt(SEASON_ANCHOR + 3 * SEASON_LENGTH_MS);
    const exclusive = later.tiers.flatMap((t) => itemIds([...t.free, ...t.premium]))
      .filter((id) => cosmetic(id)?.exclusive === 'season-1');
    expect(exclusive).toEqual([]);
  });

  it('keeps every season-one exclusive on the track, so each can actually be earned', () => {
    const one = seasonAt(SEASON_ANCHOR);
    const onTrack = new Set(one.tiers.flatMap((t) => itemIds([...t.free, ...t.premium])));
    for (const item of COSMETICS.filter((entry) => entry.exclusive === 'season-1')) {
      expect(onTrack.has(item.id), item.id).toBe(true);
    }
  });

  it('places points on the track and stops at the top', () => {
    expect(seasonLevel(0)).toMatchObject({ tier: 0, into: 0, maxed: false });
    expect(seasonLevel(POINTS_PER_TIER - 1)).toMatchObject({ tier: 0, into: POINTS_PER_TIER - 1 });
    expect(seasonLevel(POINTS_PER_TIER * 3 + 20)).toMatchObject({ tier: 3, into: 20 });
    expect(seasonLevel(POINTS_PER_TIER * 99)).toMatchObject({ tier: TIERS_PER_SEASON, maxed: true });
  });

  it('pays a loss something and a ranked win the most', () => {
    const loss = matchPassPoints({ result: 'loss', roundsWon: 0, ranked: false });
    const casualWin = matchPassPoints({ result: 'win', roundsWon: 3, ranked: false });
    const rankedWin = matchPassPoints({ result: 'win', roundsWon: 3, ranked: true });
    expect(loss).toBeGreaterThan(0);
    expect(casualWin).toBeGreaterThan(loss);
    expect(rankedWin).toBeGreaterThan(casualWin);
  });
});

describe('chests', () => {
  it('always pays coins inside the printed range', () => {
    for (let seed = 1; seed < 200; seed++) {
      const contents = rollChest('battle', [], seeded(seed));
      const coins = contents[0]!;
      expect(coins.kind).toBe('coins');
      if (coins.kind === 'coins') {
        expect(coins.amount).toBeGreaterThanOrEqual(CHESTS.battle.coins[0]);
        expect(coins.amount).toBeLessThanOrEqual(CHESTS.battle.coins[1]);
      }
    }
  });

  it('never drops an item the player already owns', () => {
    const everything = COSMETICS.map((item) => item.id);
    for (let seed = 1; seed < 100; seed++) {
      const contents = rollChest('epic', everything, seeded(seed));
      expect(contents.some((entry) => entry.kind === 'item')).toBe(false);
    }
  });

  it('drops only cheap droppable cosmetics, never heroes or exclusives', () => {
    for (const item of chestPool('epic', [])) {
      expect(item.drop).toBe(true);
      expect(item.exclusive).toBeUndefined();
      expect(item.slot).not.toBe('body');
    }
  });

  it('lands near its printed item odds', () => {
    let items = 0;
    const random = seeded(42);
    for (let i = 0; i < 4000; i++) if (rollChest('rare', [], random).some((e) => e.kind === 'item')) items++;
    expect(items / 4000).toBeGreaterThan(CHESTS.rare.item.chance - 0.04);
    expect(items / 4000).toBeLessThan(CHESTS.rare.item.chance + 0.04);
  });
});

describe('the calendar', () => {
  it('cycles every seven claims without ever going backwards', () => {
    expect(DAILY_CALENDAR).toHaveLength(7);
    expect(calendarIndex(0)).toBe(0);
    expect(calendarIndex(6)).toBe(6);
    expect(calendarIndex(7)).toBe(0);
    expect(calendarIndex(-3)).toBe(0);
    expect(DAILY_CALENDAR[6]!.some((r) => r.kind === 'chest')).toBe(true);
  });
});

describe('the store', () => {
  it('names every offer the way a payment payload can carry it', () => {
    for (const offer of OFFERS) expect(offer.id).toMatch(/^[a-z0-9_]{1,24}$/);
    expect(new Set(OFFERS.map((o) => o.id)).size).toBe(OFFERS.length);
  });

  it('only sells items that exist, and prices everything', () => {
    for (const offer of OFFERS) {
      for (const id of itemIds(offer.rewards)) expect(cosmetic(id), `${offer.id} -> ${id}`).toBeDefined();
      if (offer.price.currency === 'money') {
        expect(offer.price.usdCents).toBeGreaterThan(0);
        expect(offer.price.stars).toBeGreaterThan(0);
      } else expect(offer.price.amount).toBeGreaterThan(0);
    }
  });

  it('never sells a chest for money', () => {
    // A paid random box is a loot box. Chests may only ride along in a pack
    // whose other contents are fixed and listed.
    for (const offer of OFFERS.filter((o) => o.kind === 'gems')) {
      expect(offer.rewards.every((r) => r.kind === 'gems')).toBe(true);
    }
  });

  it('refuses exclusive items at the coin counter', () => {
    const exclusive = COSMETICS.filter((item) => item.exclusive);
    expect(exclusive.length).toBeGreaterThan(0);
    for (const item of exclusive) {
      expect(soldForCoins(item)).toBe(false);
      expect(cosmeticState(item, { coins: 1e6, gems: 0, owned: [], loadout: {}, level: 99, dailyClaimed: false }).affordable).toBe(false);
    }
  });

  it('puts the same discounted deals on everyone\'s shelf for a day', () => {
    const deals = dailyDeals('2026-09-23');
    expect(deals).toHaveLength(3);
    expect(dailyDeals('2026-09-23')).toEqual(deals);
    for (const deal of deals) {
      const item = cosmetic(deal.itemId)!;
      expect(soldForCoins(item)).toBe(true);
      expect(deal.price).toBeLessThan(deal.was);
      expect(item.slot).not.toBe('body');
    }
  });
});

describe('rewards', () => {
  it('adds up currency through chests and duplicates', () => {
    expect(totals([
      { kind: 'coins', amount: 10 },
      { kind: 'item', itemId: 'snow', duplicate: { coins: 150 } },
      { kind: 'chest', chestId: 'battle', contents: [{ kind: 'coins', amount: 70 }, { kind: 'gems', amount: 5 }, { kind: 'item', itemId: 'visor' }] },
      { kind: 'pass', amount: 100 },
    ])).toEqual({ coins: 230, gems: 5, pass: 100, items: ['visor'] });
  });
});

describe('analytics', () => {
  it('keeps short, flat, token-shaped properties only', () => {
    expect(sanitizeProps({ screen: 'store', wait_ms: 1234.56789, ranked: true, note: 'free text with spaces', Bad: 1, nested: { a: 1 } }))
      .toEqual({ screen: 'store', wait_ms: 1234.568, ranked: true });
    expect(sanitizeProps(null)).toEqual({});
    expect(Object.keys(sanitizeProps(Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`k${i}`, i]))))).toHaveLength(12);
  });

  it('knows its own event names', () => {
    expect(isClientEvent('store_opened')).toBe(true);
    expect(isClientEvent('purchase_completed')).toBe(false);
  });
});
