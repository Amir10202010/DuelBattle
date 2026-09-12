import type { Challenge, ChallengeCategory } from './challenges.js';
import { RAW_TOPICS } from './topics/pool.js';

/**
 * The topic pool, and how a thousand prompts join a game built for fifty.
 *
 * The hand-written catalogue is not replaced by this and could not be: every
 * camera-judged round in the game lives there, tied to a detector, and no
 * amount of generated English produces one of those. What the pool adds is the
 * other half — the rounds a person decides — and it adds enough of them that
 * two people who play all evening do not see the same prompt twice.
 *
 * It deliberately does not change the shape of a match. The picker already
 * guarantees a camera-judged opener and refuses three opponent-judged rounds in
 * a row, so the ratio of referees is set by those rules rather than by how many
 * prompts sit behind each one. A pool twenty times the size buys variety, not
 * a different game.
 */

/**
 * Where a topic came from, kept as a plain string rather than a union.
 *
 * The generator is allowed to invent a category; the game only ever uses these
 * for grouping and for telling a player what kind of evening they are in for,
 * so an unrecognised one costs nothing.
 */
export type TopicCategory = string;

export interface Topic {
  /** Stable across regenerations: derived from the prompt, not from position. */
  readonly id: string;
  readonly prompt: string;
  readonly category: TopicCategory;
  readonly difficulty: 1 | 2 | 3;
  /**
   * Whether a photograph could settle it.
   *
   * True means an AI referee may take the round when one is configured. False
   * means it stays with the opponent whatever else is available, because the
   * answer lives in the player's head rather than in the frame.
   */
  readonly visual: boolean;
}

/** How long a topic round runs. Longer than a colour hunt: they take thinking. */
const TOPIC_DURATION_MS = 30_000;

/** The render ceiling. A prompt is set in caps at 46px and has to fit a phone. */
export const MAX_TOPIC_LENGTH = 48;
export const MIN_TOPIC_LENGTH = 12;

export type TopicRejection =
  | 'too-short'
  | 'too-long'
  | 'unsupported-characters'
  | 'no-instruction'
  | 'needs-something-not-here'
  | 'duplicate';

/**
 * The gate every generated topic goes through.
 *
 * A model asked for a hundred prompts will return ninety that work and ten
 * that ask a player to fetch a passport, film a housemate or produce a pet on
 * demand. None of those are caught by a length check, so each one is refused by
 * name here rather than left to a reviewer's patience.
 *
 * Nothing calls this at play time — the pool shipped in the repo has already
 * been through it. It runs when the pool is built, which is the only moment a
 * prompt can still be wrong.
 */
const INSTRUCTION =
  /^(SHOW|FIND|GRAB|BRING|HOLD|GET|POINT|PUT|WEAR|BALANCE|BUILD|MAKE|SPELL|OPEN|EMPTY|STACK|TOUCH|PROVE|REACH|COVER|HIDE|LINE|STAND|SPIN|WRITE|DRAW|WRAP|FILL)\b/;

/**
 * Things no prompt may ask for.
 *
 * Identity documents and payment cards because a webcam game is not a place to
 * hold either up; other people and animals because they did not agree to be on
 * camera; anything that involves fire, blades in motion, medicines or a window
 * ledge because somebody will do it.
 */
const FORBIDDEN =
  /\b(PASSPORT NUMBER|ID CARD|IDENTITY CARD|DRIVING LICENCE|DRIVER'?S LICENSE|CREDIT CARD NUMBER|BANK DETAILS|PIN NUMBER|ADDRESS ON IT|POSTCODE|PHONE NUMBER|PASSWORD|NAKED|UNDERWEAR|YOUR BODY|BARE SKIN|A PET|YOUR PET|YOUR CAT|YOUR DOG|AN ANIMAL THAT IS ALIVE|A CHILD|YOUR HOUSEMATE|SOMEBODY ELSE IN THE ROOM|SET .* ON FIRE|LIGHT A FIRE|BURN|A WEAPON|A GUN|A KNIFE TO YOUR|PILLS|MEDICATION|PRESCRIPTION|ALCOHOL|DRUGS|OUT OF THE WINDOW AND|CLIMB)\b/;

export interface TopicCandidate {
  prompt: string;
  category: TopicCategory;
  difficulty: 1 | 2 | 3;
  visual: boolean;
}

/**
 * Normalises and checks one candidate, or says exactly why it cannot be used.
 *
 * `taken` is every prompt already in the game — the catalogue and the pool as
 * it stands — so a generator run cannot reintroduce something the game already
 * asks, however differently the model phrased its reasoning.
 */
export function validateTopic(
  input: { prompt: string; category?: string; difficulty?: number; visual?: boolean },
  taken: ReadonlySet<string>,
): { ok: true; topic: TopicCandidate } | { ok: false; reason: TopicRejection } {
  const prompt = input.prompt.replace(/\s+/g, ' ').trim().toUpperCase().replace(/[.]+$/, '');

  if (prompt.length < MIN_TOPIC_LENGTH) return { ok: false, reason: 'too-short' };
  if (prompt.length > MAX_TOPIC_LENGTH) return { ok: false, reason: 'too-long' };
  if (!/^[A-Z0-9 '’\-.,!?$&+:()]+$/.test(prompt)) {
    return { ok: false, reason: 'unsupported-characters' };
  }
  if (!INSTRUCTION.test(prompt)) return { ok: false, reason: 'no-instruction' };
  if (FORBIDDEN.test(prompt)) return { ok: false, reason: 'needs-something-not-here' };
  if (taken.has(prompt)) return { ok: false, reason: 'duplicate' };

  const difficulty = input.difficulty === 1 || input.difficulty === 3 ? input.difficulty : 2;
  return {
    ok: true,
    topic: {
      prompt,
      category: (input.category ?? 'object').toLowerCase().replace(/[^a-z]/g, '') || 'object',
      difficulty,
      visual: input.visual === true,
    },
  };
}

/**
 * A short, stable id.
 *
 * Derived from the prompt so that a regenerated pool keeps the ids of every
 * topic that survived it — a room's "recently played" memory and a match
 * history both refer to rounds by id, and shifting them on every rebuild would
 * quietly corrupt both.
 */
export function topicId(prompt: string): string {
  let hash = 2166136261;
  for (let i = 0; i < prompt.length; i++) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `t-${(hash >>> 0).toString(36)}`;
}

export const TOPICS: readonly Topic[] = RAW_TOPICS.map(([prompt, category, difficulty, visual]) => ({
  id: topicId(prompt),
  prompt,
  category,
  difficulty,
  visual: visual === 1,
}));

/** Every category in the pool with how many prompts sit behind it. */
export function topicCategories(): { category: TopicCategory; count: number }[] {
  const counts = new Map<TopicCategory, number>();
  for (const topic of TOPICS) counts.set(topic.category, (counts.get(topic.category) ?? 0) + 1);
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Which challenge category a topic plays as.
 *
 * The catalogue's five categories drive pacing and the lobby's sampler, so a
 * topic has to land in one of them rather than introduce a sixth. Anything the
 * generator invents falls through to `object`, which is the honest default for
 * "find a thing and hold it up".
 */
const CATEGORY_MAP: Record<string, ChallengeCategory> = {
  action: 'action',
  colour: 'color',
  confession: 'story',
  debate: 'story',
  feeling: 'story',
  hypothetical: 'wildcard',
  prove: 'action',
  self: 'story',
  sense: 'object',
  story: 'story',
  superlative: 'object',
  time: 'story',
  value: 'story',
  weird: 'wildcard',
};

function challengeCategory(category: TopicCategory): ChallengeCategory {
  return CATEGORY_MAP[category] ?? 'object';
}

/**
 * The pool as rounds the engine can play.
 *
 * Always opponent-judged: no detector decides an arbitrary sentence, and one
 * that pretended to would be worse than asking the person watching. Topics a
 * photograph *can* settle carry the `visual` tag, which is what lets an AI
 * referee take them when the deployment has one.
 */
let cached: readonly Challenge[] | null = null;

export function topicChallenges(): readonly Challenge[] {
  cached ??= TOPICS.map((topic) => ({
    id: topic.id,
    prompt: topic.prompt,
    category: challengeCategory(topic.category),
    difficulty: topic.difficulty,
    durationMs: TOPIC_DURATION_MS,
    judging: 'peer' as const,
    tags: topic.visual ? ['topic', topic.category, 'visual'] : ['topic', topic.category],
  }));
  return cached;
}
