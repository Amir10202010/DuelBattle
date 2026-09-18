import type { TelegramQuest, TelegramQuestBoard } from '@battle/shared';
import type { Database } from '../database.js';
import { grantCoins } from '../economy.js';

/**
 * Today's three things to do.
 *
 * Two rules, both learned from games that got this wrong.
 *
 * Every quest is a question a *settled match* can answer. Nothing counts taps,
 * nothing counts screens opened, nothing asks you to come back at six o'clock.
 * That is also what makes the progress trustworthy: it is written by the same
 * code path that writes the rating, from the same summary, on the server.
 *
 * The board is the same for everybody on a given day, and the day is UTC. A
 * per-player board would be a slot machine, and a local-midnight reset would
 * mean two friends comparing quests see different ones and think it is broken.
 */

export interface QuestDefinition {
  id: string;
  title: string;
  description: string;
  target: number;
  reward: number;
  /** Which slot of the board it may fill, so the three are never all the same. */
  slot: 'play' | 'win' | 'spice';
  /** How much this match advances it. Pure, and evaluated server-side only. */
  advance: (match: QuestMatch) => number;
}

/** The parts of a finished match the quest rules are allowed to read. */
export interface QuestMatch {
  result: 'win' | 'loss' | 'draw';
  roundsWon: number;
  /** Consecutive wins after this match. */
  streak: number;
  /** Their rating before the match, so an upset can be recognised. */
  opponentRating: number;
  ratingBefore: number;
  /** True when the match came out of a friend challenge rather than the queue. */
  fromChallenge: boolean;
  ranked: boolean;
}

export const QUESTS: readonly QuestDefinition[] = [
  {
    id: 'play-1',
    title: 'Answer the bell',
    description: 'Finish one duel.',
    target: 1,
    reward: 40,
    slot: 'play',
    advance: () => 1,
  },
  {
    id: 'play-3',
    title: 'Three rounds of it',
    description: 'Finish three duels.',
    target: 3,
    reward: 70,
    slot: 'play',
    advance: () => 1,
  },
  {
    id: 'win-1',
    title: 'Take one',
    description: 'Win a duel.',
    target: 1,
    reward: 50,
    slot: 'win',
    advance: (m) => (m.result === 'win' ? 1 : 0),
  },
  {
    id: 'win-2',
    title: 'Twice over',
    description: 'Win two duels.',
    target: 2,
    reward: 80,
    slot: 'win',
    advance: (m) => (m.result === 'win' ? 1 : 0),
  },
  {
    id: 'rounds-5',
    title: 'Five clean finds',
    description: 'Win five rounds.',
    target: 5,
    reward: 60,
    slot: 'win',
    advance: (m) => m.roundsWon,
  },
  {
    id: 'upset',
    title: 'Punch upwards',
    description: 'Beat somebody rated above you.',
    target: 1,
    reward: 90,
    slot: 'spice',
    advance: (m) => (m.result === 'win' && m.opponentRating > m.ratingBefore ? 1 : 0),
  },
  {
    id: 'streak-2',
    title: 'Back to back',
    description: 'Win two in a row.',
    target: 1,
    reward: 80,
    slot: 'spice',
    advance: (m) => (m.result === 'win' && m.streak >= 2 ? 1 : 0),
  },
  {
    id: 'friend-duel',
    title: 'Settle it privately',
    description: 'Play a duel from a friend challenge.',
    target: 1,
    reward: 70,
    slot: 'spice',
    advance: (m) => (m.fromChallenge ? 1 : 0),
  },
] as const;

const BY_SLOT = {
  play: QUESTS.filter((q) => q.slot === 'play'),
  win: QUESTS.filter((q) => q.slot === 'win'),
  spice: QUESTS.filter((q) => q.slot === 'spice'),
} as const;

export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Midnight UTC after the given moment. What the countdown on screen counts to. */
export function nextResetAt(now: number): number {
  return Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
  );
}

/** A small, stable hash of the day, so the board is reproducible from the date. */
function dayHash(day: string): number {
  let hash = 2166136261;
  for (let i = 0; i < day.length; i++) {
    hash ^= day.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/** The three quests for a day. Same for every player, derived from the date. */
export function questsFor(day: string): QuestDefinition[] {
  const hash = dayHash(day);
  return [
    BY_SLOT.play[hash % BY_SLOT.play.length]!,
    BY_SLOT.win[Math.floor(hash / 7) % BY_SLOT.win.length]!,
    BY_SLOT.spice[Math.floor(hash / 53) % BY_SLOT.spice.length]!,
  ];
}

export class DailyQuests {
  constructor(private readonly db: Database) {}

  board(accountId: string, now: number): TelegramQuestBoard {
    const day = dayKey(now);
    const definitions = questsFor(day);
    const rows = this.db.sql
      .prepare('SELECT quest_id, progress, claimed_at FROM daily_quests WHERE account_id=? AND day=?')
      .all(accountId, day);
    const progress = new Map(
      rows.map((row) => [
        String(row.quest_id),
        { progress: Number(row.progress), claimed: row.claimed_at !== null },
      ]),
    );
    const quests: TelegramQuest[] = definitions.map((definition) => {
      const state = progress.get(definition.id) ?? { progress: 0, claimed: false };
      const capped = Math.min(definition.target, state.progress);
      return {
        id: definition.id,
        title: definition.title,
        description: definition.description,
        progress: capped,
        target: definition.target,
        reward: definition.reward,
        done: capped >= definition.target,
        claimed: state.claimed,
      };
    });
    return { day, resetsAt: nextResetAt(now), quests };
  }

  /**
   * Advances today's board with one finished match.
   *
   * Called from the settlement hook, inside the caller's transaction, with a
   * summary the client never touched. Returns the quests this match completed,
   * so the player can be told the moment it happens rather than the next time
   * they happen to open the tab.
   */
  record(accountId: string, match: QuestMatch, now: number): QuestDefinition[] {
    const day = dayKey(now);
    const completed: QuestDefinition[] = [];
    for (const definition of questsFor(day)) {
      const step = definition.advance(match);
      if (step <= 0) continue;
      const before = Number(
        this.db.sql
          .prepare('SELECT progress FROM daily_quests WHERE account_id=? AND day=? AND quest_id=?')
          .get(accountId, day, definition.id)?.progress ?? 0,
      );
      if (before >= definition.target) continue;
      const after = Math.min(definition.target, before + step);
      this.db.sql
        .prepare(
          `INSERT INTO daily_quests(account_id,day,quest_id,progress,claimed_at) VALUES(?,?,?,?,NULL)
           ON CONFLICT(account_id,day,quest_id) DO UPDATE SET progress=excluded.progress`,
        )
        .run(accountId, day, definition.id, after);
      if (after >= definition.target) completed.push(definition);
    }
    return completed;
  }

  /**
   * Pays out a finished quest.
   *
   * The claim and the payment are one transaction, and the coin receipt names
   * the day and the quest, so a double tap pays once even if the row update
   * somehow ran twice.
   */
  claim(
    accountId: string,
    questId: string,
    now: number,
  ): { ok: true; coins: number } | { ok: false; reason: 'unknown' | 'incomplete' | 'claimed' } {
    const day = dayKey(now);
    const definition = questsFor(day).find((quest) => quest.id === questId);
    if (!definition) return { ok: false, reason: 'unknown' };
    return this.db.transaction(() => {
      const row = this.db.sql
        .prepare('SELECT progress, claimed_at FROM daily_quests WHERE account_id=? AND day=? AND quest_id=?')
        .get(accountId, day, questId);
      if (!row || Number(row.progress) < definition.target)
        return { ok: false as const, reason: 'incomplete' as const };
      if (row.claimed_at !== null) return { ok: false as const, reason: 'claimed' as const };
      this.db.sql
        .prepare('UPDATE daily_quests SET claimed_at=? WHERE account_id=? AND day=? AND quest_id=?')
        .run(now, accountId, day, questId);
      const coins = grantCoins(
        this.db.sql,
        accountId,
        `quest:${day}:${questId}`,
        definition.reward,
        now,
      );
      return { ok: true as const, coins };
    });
  }
}
