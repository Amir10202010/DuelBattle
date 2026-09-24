import type { CalendarView } from './calendar.js';
import type { QuestBoardView } from './quests.js';
import type { SeasonView } from './season.js';
import type { StoreView } from './store.js';
import type { Granted } from './rewards.js';

export * from './rewards.js';
export * from './chests.js';
export * from './quests.js';
export * from './season.js';
export * from './calendar.js';
export * from './store.js';
export * from './analytics.js';

/** Everything the lobby needs, in one round trip. */
export interface MetaView {
  wallet: { coins: number; gems: number };
  quests: QuestBoardView;
  season: SeasonView;
  calendar: CalendarView;
  store: StoreView;
  /** Things waiting to be collected: finished quests, reached tiers, today's claim. */
  claimable: number;
  /** An operator of this server, allowed to read the KPI dashboard. */
  admin: boolean;
  serverTime: number;
}

/** What a meta action answers with: what landed, and the view after it landed. */
export interface MetaActionResult {
  granted: Granted[];
  view: MetaView;
}

/** What a finished match did to the season and the quest boards, for one player. */
export interface MetaMatchRewards {
  pass: { points: number; before: number; after: number } | null;
  /** Quests this match moved, with where they are now. */
  quests: { id: string; progress: number; target: number; done: boolean }[];
  /** The casual reward ceiling for today has been reached. */
  capped?: boolean;
}
