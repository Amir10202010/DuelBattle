import { chest, coins, gems, item, passPoints, type Reward } from './rewards.js';

/**
 * Things to do, in three rhythms.
 *
 * Daily quests are the reason to open the game today, weekly ones the reason to
 * keep a week, and the starter chain is the first session made legible: every
 * step of it is something a new player should do anyway, paid for doing it.
 *
 * Two rules carried over from the first quest board. Every quest is answered by
 * something the server already knows — a settled match, an equip, a claim — so
 * nothing counts taps or screens. And a board is the same for everybody on a
 * given UTC day or ISO week: friends comparing quests see the same three.
 */

export type QuestPeriod = 'daily' | 'weekly' | 'starter';

/** A finished match, from one player's side, as the quest rules may read it. */
export interface QuestMatchEvent {
  type: 'match';
  result: 'win' | 'loss' | 'draw';
  roundsWon: number;
  validAnswers: number;
  /** Consecutive wins after this match. */
  streak: number;
  ranked: boolean;
  /** Played in a room one of the players opened, rather than from the queue. */
  friendRoom: boolean;
  /** Won against somebody rated above you. Ranked only. */
  upset: boolean;
  /** Your fastest round-winning answer, in milliseconds. */
  fastestWinMs: number | null;
  /** This was your first finished match of the UTC day. */
  firstOfDay: boolean;
}

export type QuestEvent =
  | QuestMatchEvent
  | { type: 'equip' }
  | { type: 'daily' }
  | { type: 'purchase' };

export interface QuestDefinition {
  id: string;
  period: QuestPeriod;
  title: string;
  description: string;
  target: number;
  rewards: Reward[];
  /** Which slot of a daily board it may fill, so the three are never alike. */
  slot?: 'play' | 'win' | 'spice';
  /** How far one event moves it. Pure, and evaluated on the server only. */
  advance: (event: QuestEvent) => number;
}

const match = (event: QuestEvent): event is QuestMatchEvent => event.type === 'match';
const won = (event: QuestEvent) => match(event) && event.result === 'win';

export const DAILY_QUESTS: readonly QuestDefinition[] = [
  { id: 'play-1', period: 'daily', slot: 'play', title: 'Answer the bell', description: 'Finish one duel.', target: 1, rewards: [coins(40), passPoints(80)], advance: (e) => (match(e) ? 1 : 0) },
  { id: 'play-3', period: 'daily', slot: 'play', title: 'Three rounds of it', description: 'Finish three duels.', target: 3, rewards: [coins(70), passPoints(150)], advance: (e) => (match(e) ? 1 : 0) },
  { id: 'answers-6', period: 'daily', slot: 'play', title: 'Show and tell', description: 'Land six valid answers.', target: 6, rewards: [coins(60), passPoints(120)], advance: (e) => (match(e) ? e.validAnswers : 0) },
  { id: 'win-1', period: 'daily', slot: 'win', title: 'Take one', description: 'Win a duel.', target: 1, rewards: [coins(50), passPoints(120)], advance: (e) => (won(e) ? 1 : 0) },
  { id: 'win-2', period: 'daily', slot: 'win', title: 'Twice over', description: 'Win two duels.', target: 2, rewards: [coins(80), passPoints(180)], advance: (e) => (won(e) ? 1 : 0) },
  { id: 'rounds-5', period: 'daily', slot: 'win', title: 'Five clean finds', description: 'Win five rounds.', target: 5, rewards: [coins(60), passPoints(140)], advance: (e) => (match(e) ? e.roundsWon : 0) },
  { id: 'upset', period: 'daily', slot: 'spice', title: 'Punch upwards', description: 'Beat a higher-rated player in ranked.', target: 1, rewards: [coins(90), passPoints(160)], advance: (e) => (match(e) && e.upset ? 1 : 0) },
  { id: 'streak-2', period: 'daily', slot: 'spice', title: 'Back to back', description: 'Win two in a row.', target: 1, rewards: [coins(80), passPoints(160)], advance: (e) => (won(e) && match(e) && e.streak >= 2 ? 1 : 0) },
  { id: 'friend-duel', period: 'daily', slot: 'spice', title: 'Settle it privately', description: 'Finish a duel in a friend room.', target: 1, rewards: [coins(70), passPoints(140)], advance: (e) => (match(e) && e.friendRoom ? 1 : 0) },
  { id: 'fast-5', period: 'daily', slot: 'spice', title: 'Quick hands', description: 'Win a round in under five seconds.', target: 1, rewards: [coins(80), passPoints(160)], advance: (e) => (match(e) && e.fastestWinMs !== null && e.fastestWinMs < 5000 ? 1 : 0) },
  { id: 'ranked-1', period: 'daily', slot: 'spice', title: 'On the record', description: 'Finish a ranked duel.', target: 1, rewards: [coins(60), passPoints(140)], advance: (e) => (match(e) && e.ranked ? 1 : 0) },
];

export const WEEKLY_QUESTS: readonly QuestDefinition[] = [
  { id: 'w-play-12', period: 'weekly', title: 'Regular', description: 'Finish twelve duels this week.', target: 12, rewards: [gems(25), passPoints(500)], advance: (e) => (match(e) ? 1 : 0) },
  { id: 'w-win-6', period: 'weekly', title: 'Winning week', description: 'Win six duels this week.', target: 6, rewards: [gems(30), passPoints(600)], advance: (e) => (won(e) ? 1 : 0) },
  { id: 'w-rounds-25', period: 'weekly', title: 'Finder', description: 'Win twenty-five rounds this week.', target: 25, rewards: [gems(25), passPoints(500)], advance: (e) => (match(e) ? e.roundsWon : 0) },
  { id: 'w-days-4', period: 'weekly', title: 'Four good days', description: 'Play on four different days this week.', target: 4, rewards: [chest('rare'), passPoints(600)], advance: (e) => (match(e) && e.firstOfDay ? 1 : 0) },
  { id: 'w-ranked-5', period: 'weekly', title: 'Climber', description: 'Finish five ranked duels this week.', target: 5, rewards: [gems(30), passPoints(500)], advance: (e) => (match(e) && e.ranked ? 1 : 0) },
  { id: 'w-friends-3', period: 'weekly', title: 'Company', description: 'Finish three duels in friend rooms.', target: 3, rewards: [chest('rare'), passPoints(400)], advance: (e) => (match(e) && e.friendRoom ? 1 : 0) },
];

/**
 * The first session, as a checklist that pays.
 *
 * In the order a new player meets things: a duel, a round, their locker, the
 * daily claim, a win, and — once they know the game — the ladder. Finishing the
 * chain completes an original look, so the first thing a player unlocks is
 * something nobody can buy.
 */
export const STARTER_QUESTS: readonly QuestDefinition[] = [
  { id: 'st-first-duel', period: 'starter', title: 'First duel', description: 'Finish your first duel, win or lose.', target: 1, rewards: [coins(150), passPoints(100)], advance: (e) => (match(e) ? 1 : 0) },
  { id: 'st-first-round', period: 'starter', title: 'First find', description: 'Win a round.', target: 1, rewards: [coins(100), item('title-first-light')], advance: (e) => (match(e) && e.roundsWon > 0 ? 1 : 0) },
  { id: 'st-equip', period: 'starter', title: 'Make it yours', description: 'Equip something in your locker.', target: 1, rewards: [gems(10), item('sunrise-parka')], advance: (e) => (e.type === 'equip' ? 1 : 0) },
  { id: 'st-daily', period: 'starter', title: 'Come back tomorrow', description: 'Claim a daily reward.', target: 1, rewards: [coins(100)], advance: (e) => (e.type === 'daily' ? 1 : 0) },
  { id: 'st-first-win', period: 'starter', title: 'First victory', description: 'Win a duel.', target: 1, rewards: [gems(20), item('banner-sunrise'), passPoints(150)], advance: (e) => (won(e) ? 1 : 0) },
  { id: 'st-ranked', period: 'starter', title: 'Onto the ladder', description: 'Finish a ranked duel.', target: 1, rewards: [coins(200), chest('battle')], advance: (e) => (match(e) && e.ranked ? 1 : 0) },
];

const ALL = [...DAILY_QUESTS, ...WEEKLY_QUESTS, ...STARTER_QUESTS];
const BY_ID = new Map(ALL.map((quest) => [quest.id, quest]));
export const questById = (id: string) => BY_ID.get(id);

// ---------------------------------------------------------------------------
// Calendar keys. UTC everywhere, so a reset is the same moment for everyone.
// ---------------------------------------------------------------------------

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Midnight UTC after the given moment. */
export function nextDayAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** ISO-8601 week, `YYYY-Www`: weeks start on Monday and belong to their Thursday's year. */
export function weekKey(now: number): string {
  const thursdayOf = (utc: number) => {
    const d = new Date(utc);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  };
  const thursday = thursdayOf(now);
  const year = new Date(thursday).getUTCFullYear();
  const week = 1 + Math.round((thursday - thursdayOf(Date.UTC(year, 0, 4))) / 604_800_000);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday midnight UTC after the given moment. */
export function nextWeekAt(now: number): number {
  const d = new Date(now);
  const day = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 7);
}

/** A small, stable hash, so a board is reproducible from its key alone. */
export function keyHash(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const SLOTS = {
  play: DAILY_QUESTS.filter((q) => q.slot === 'play'),
  win: DAILY_QUESTS.filter((q) => q.slot === 'win'),
  spice: DAILY_QUESTS.filter((q) => q.slot === 'spice'),
};

/** The three quests for a UTC day. Same for every player. */
export function dailyBoard(day: string): QuestDefinition[] {
  const hash = keyHash(day);
  return [
    SLOTS.play[hash % SLOTS.play.length]!,
    SLOTS.win[Math.floor(hash / 7) % SLOTS.win.length]!,
    SLOTS.spice[Math.floor(hash / 53) % SLOTS.spice.length]!,
  ];
}

/** Three of the weekly quests for an ISO week, never the same one twice. */
export function weeklyBoard(week: string): QuestDefinition[] {
  const pool = [...WEEKLY_QUESTS];
  let hash = keyHash(week);
  const picked: QuestDefinition[] = [];
  while (picked.length < 3 && pool.length) {
    picked.push(pool.splice(hash % pool.length, 1)[0]!);
    hash = Math.floor(hash / 5) + 17;
  }
  return picked;
}

/** The row key a quest's progress is stored under at a given moment. */
export function periodKey(period: QuestPeriod, now: number): string {
  return period === 'daily' ? `d:${dayKey(now)}` : period === 'weekly' ? `w:${weekKey(now)}` : 'starter';
}

/** What a client is shown for one quest. */
export interface QuestView {
  id: string;
  period: QuestPeriod;
  title: string;
  description: string;
  progress: number;
  target: number;
  rewards: Reward[];
  done: boolean;
  claimed: boolean;
}

export interface QuestBoardView {
  daily: QuestView[];
  weekly: QuestView[];
  /** Empty once every starter quest has been claimed. */
  starter: QuestView[];
  dailyResetsAt: number;
  weeklyResetsAt: number;
}
