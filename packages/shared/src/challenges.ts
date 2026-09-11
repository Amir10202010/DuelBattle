import type { ColorKey } from './vision/color.js';
import type { DetectorSpec } from './vision/run.js';
import type { RandomSource } from './ids.js';

/**
 * How a round is decided.
 *  - `auto`: a detector runs on the submitted frame and the server re-runs it
 *    authoritatively. Instant, objective, no waiting.
 *  - `peer`: the opponent judges the snapshot. Used for everything a camera
 *    genuinely cannot decide ("older than you", "your mum gave you"). This is a
 *    deliberate product choice, not a stand-in for a missing model.
 */
export type JudgingMode = 'auto' | 'peer';

export type ChallengeCategory = 'color' | 'object' | 'action' | 'story' | 'wildcard';

export type { DetectorSpec };

export interface Challenge {
  readonly id: string;
  /** Shown huge, in the player's face. Written as an instruction, not a riddle. */
  readonly prompt: string;
  /** One short clarifying line, shown smaller. Optional by design. */
  readonly hint?: string;
  readonly category: ChallengeCategory;
  readonly difficulty: 1 | 2 | 3;
  readonly durationMs: number;
  readonly judging: JudgingMode;
  /** Present if and only if `judging === 'auto'`. */
  readonly detector?: DetectorSpec;
  readonly tags: readonly string[];
}

const SHORT = 20_000;
const NORMAL = 28_000;
const LONG = 38_000;

function color(
  id: string,
  prompt: string,
  target: ColorKey,
  difficulty: 1 | 2 | 3,
  durationMs: number,
  hint?: string,
): Challenge {
  return {
    id,
    prompt,
    ...(hint ? { hint } : {}),
    category: 'color',
    difficulty,
    durationMs,
    judging: 'auto',
    detector: { kind: 'color', target },
    tags: ['color', target],
  };
}

function peer(
  id: string,
  prompt: string,
  category: ChallengeCategory,
  difficulty: 1 | 2 | 3,
  durationMs: number,
  tags: string[],
  hint?: string,
): Challenge {
  return {
    id,
    prompt,
    ...(hint ? { hint } : {}),
    category,
    difficulty,
    durationMs,
    judging: 'peer',
    tags,
  };
}

function auto(
  id: string,
  prompt: string,
  detector: DetectorSpec,
  category: ChallengeCategory,
  difficulty: 1 | 2 | 3,
  durationMs: number,
  tags: string[],
  hint?: string,
): Challenge {
  return {
    id,
    prompt,
    ...(hint ? { hint } : {}),
    category,
    difficulty,
    durationMs,
    judging: 'auto',
    detector,
    tags,
  };
}

export const CHALLENGES: readonly Challenge[] = [
  // ---- Colour: objective, instant, and the backbone of the pacing. ----
  color('color-red', 'SHOW SOMETHING RED', 'red', 1, SHORT),
  color('color-blue', 'SHOW SOMETHING BLUE', 'blue', 1, SHORT),
  color('color-green', 'TOUCH SOMETHING GREEN', 'green', 1, SHORT, 'Bring it to the camera while you touch it.'),
  color('color-yellow', 'SHOW SOMETHING YELLOW', 'yellow', 2, SHORT),
  color('color-white', 'SHOW SOMETHING WHITE', 'white', 1, SHORT),
  color('color-black', 'SHOW SOMETHING BLACK', 'black', 1, SHORT),
  color('color-orange', 'SHOW SOMETHING ORANGE', 'orange', 2, NORMAL),
  color('color-purple', 'SHOW SOMETHING PURPLE', 'purple', 3, NORMAL),
  color('color-pink', 'SHOW SOMETHING PINK', 'pink', 3, NORMAL),
  color('color-red-fill', 'FILL YOUR SCREEN WITH RED', 'red', 2, SHORT, 'Get it right up to the lens.'),
  color('color-blue-fill', 'FILL YOUR SCREEN WITH BLUE', 'blue', 2, SHORT, 'Get it right up to the lens.'),

  // ---- Physical: no colour involved, still decided by the camera. ----
  auto(
    'cover-lens',
    'BLACK OUT YOUR CAMERA',
    { kind: 'darkness', maxLuminance: 0.05 },
    'action',
    1,
    SHORT,
    ['action', 'camera'],
    'Anything over the lens. Total darkness.',
  ),
  auto(
    'cover-frame',
    'FILL THE WHOLE FRAME WITH ONE THING',
    { kind: 'coverage', minChange: 0.82 },
    'action',
    2,
    SHORT,
    ['action', 'camera'],
    'Push it right up until nothing else is visible.',
  ),
  auto(
    'lum-dark',
    'SHOW SOMETHING DARKER THAN YOUR ROOM',
    { kind: 'luminance', mode: 'darker', ratio: 0.45 },
    'object',
    2,
    NORMAL,
    ['object', 'light'],
  ),
  auto(
    'lum-bright',
    'SHOW SOMETHING BRIGHTER THAN YOUR ROOM',
    { kind: 'luminance', mode: 'brighter', ratio: 2.2 },
    'object',
    2,
    NORMAL,
    ['object', 'light'],
  ),
  auto(
    'pair-red-white',
    'SHOW SOMETHING RED AND WHITE',
    { kind: 'colorPair', targets: ['red', 'white'] },
    'object',
    3,
    NORMAL,
    ['object', 'color'],
    'Both colours, on one thing.',
  ),
  auto(
    'pair-blue-white',
    'SHOW SOMETHING BLUE AND WHITE',
    { kind: 'colorPair', targets: ['blue', 'white'] },
    'object',
    3,
    NORMAL,
    ['object', 'color'],
    'Both colours, on one thing.',
  ),
  auto(
    'pair-black-white',
    'SHOW SOMETHING BLACK AND WHITE',
    { kind: 'colorPair', targets: ['black', 'white'] },
    'object',
    2,
    NORMAL,
    ['object', 'color'],
    'Both colours, on one thing.',
  ),

  // ---- Objects: quick scavenger hunts, judged by your opponent. ----
  peer('obj-face', 'SHOW SOMETHING WITH A FACE', 'object', 2, NORMAL, ['object', 'face'], 'A toy, a poster, a mug — not your own face.'),
  peer('obj-letter-b', 'SHOW SOMETHING STARTING WITH THE LETTER B', 'object', 2, NORMAL, ['object', 'letter']),
  peer('obj-letter-s', 'SHOW SOMETHING STARTING WITH THE LETTER S', 'object', 2, NORMAL, ['object', 'letter']),
  peer('obj-round', 'SHOW SOMETHING PERFECTLY ROUND', 'object', 2, NORMAL, ['object', 'shape']),
  peer('obj-cheap', 'FIND SOMETHING THAT COSTS LESS THAN $5', 'object', 2, NORMAL, ['object', 'value']),
  peer('obj-expensive', 'SHOW THE MOST EXPENSIVE THING WITHIN REACH', 'object', 2, NORMAL, ['object', 'value']),
  peer('obj-useless', 'SHOW THE MOST USELESS THING IN YOUR ROOM', 'object', 1, NORMAL, ['object', 'funny']),
  peer('obj-soft', 'SHOW SOMETHING SOFTER THAN A PILLOW', 'object', 2, NORMAL, ['object', 'texture']),
  peer('obj-tiny', 'SHOW THE SMALLEST THING YOU OWN', 'object', 2, NORMAL, ['object', 'size']),
  peer('obj-heavy', 'LIFT THE HEAVIEST THING YOU CAN REACH', 'action', 2, NORMAL, ['object', 'size']),
  peer('obj-battery', 'SHOW SOMETHING THAT NEEDS A BATTERY', 'object', 2, NORMAL, ['object', 'tech']),
  peer('obj-broken', 'SHOW SOMETHING THAT IS BROKEN', 'object', 3, NORMAL, ['object', 'story']),
  peer('obj-written', 'SHOW SOMETHING WITH YOUR HANDWRITING ON IT', 'object', 3, NORMAL, ['object', 'story']),
  peer('obj-liquid', 'SHOW SOMETHING YOU CAN DRINK', 'object', 1, SHORT, ['object']),
  peer('obj-smell', 'SHOW THE BEST-SMELLING THING IN THE ROOM', 'object', 2, NORMAL, ['object', 'funny']),
  peer('obj-book', 'SHOW A BOOK AND READ ONE LINE OUT LOUD', 'action', 3, LONG, ['object', 'voice']),

  // ---- Stories: the reason anyone plays this with a friend. ----
  peer('story-older', 'FIND SOMETHING OLDER THAN YOU', 'story', 3, LONG, ['story', 'time']),
  peer('story-mom', 'FIND SOMETHING YOUR MOM GAVE YOU', 'story', 3, LONG, ['story', 'family']),
  peer('story-travel', 'SHOW SOMETHING FROM ANOTHER COUNTRY', 'story', 3, LONG, ['story', 'travel']),
  peer('story-regret', 'SHOW A PURCHASE YOU REGRET', 'story', 2, LONG, ['story', 'funny']),
  peer('story-gift', 'SHOW SOMETHING YOU WOULD NEVER THROW AWAY', 'story', 3, LONG, ['story', 'sentimental']),
  peer('story-year', 'SHOW SOMETHING YOU HAVE HAD FOR 5+ YEARS', 'story', 3, LONG, ['story', 'time']),
  peer('story-embarrassing', 'SHOW THE THING YOU WOULD HIDE FROM A GUEST', 'story', 2, LONG, ['story', 'funny']),

  // ---- Actions: get people out of their chair. ----
  peer('act-hands', 'SHOW BOTH HANDS, PALMS TO THE CAMERA', 'action', 1, SHORT, ['action', 'body']),
  peer('act-blue-head', 'PUT SOMETHING BLUE ON YOUR HEAD', 'action', 2, NORMAL, ['action', 'color', 'blue']),
  peer('act-hat', 'WEAR SOMETHING THAT IS NOT A HAT AS A HAT', 'action', 2, NORMAL, ['action', 'funny']),
  peer('act-stack', 'STACK THREE THINGS ON TOP OF EACH OTHER', 'action', 3, LONG, ['action', 'build']),
  peer('act-behind', 'SHOW WHAT IS BEHIND YOU RIGHT NOW', 'action', 1, SHORT, ['action', 'room']),
  peer('act-pocket', 'EMPTY YOUR POCKETS ON CAMERA', 'action', 2, NORMAL, ['action', 'reveal']),
  peer('act-impression', 'DO AN IMPRESSION OF YOUR OPPONENT', 'action', 2, NORMAL, ['action', 'funny', 'voice']),
  peer('act-furthest', 'TOUCH THE FURTHEST WALL AND COME BACK', 'action', 3, NORMAL, ['action', 'move']),

  // ---- Wildcards: rare, high-variance, memorable. ----
  peer('wild-swap', 'SHOW SOMETHING THAT PROVES WHAT TIME IT IS', 'wildcard', 3, NORMAL, ['wildcard']),
  peer('wild-three-red', 'SHOW THREE RED THINGS AT ONCE', 'wildcard', 3, NORMAL, ['wildcard', 'color']),
  peer('wild-selfcam', 'SHOW YOUR SCREEN TO YOUR CAMERA', 'wildcard', 3, NORMAL, ['wildcard', 'meta']),
];

export const CHALLENGES_BY_ID: ReadonlyMap<string, Challenge> = new Map(
  CHALLENGES.map((c) => [c.id, c]),
);

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES_BY_ID.get(id);
}

/** Structural invariants the catalogue must satisfy; asserted by the tests. */
export function validateCatalog(challenges: readonly Challenge[] = CHALLENGES): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenPrompts = new Set<string>();

  for (const c of challenges) {
    if (seenIds.has(c.id)) problems.push(`duplicate id: ${c.id}`);
    seenIds.add(c.id);

    const promptKey = c.prompt.trim().toUpperCase();
    if (seenPrompts.has(promptKey)) problems.push(`duplicate prompt: ${c.prompt}`);
    seenPrompts.add(promptKey);

    if (c.prompt !== promptKey) problems.push(`${c.id}: prompt must be upper case`);
    if (c.prompt.length > 48) problems.push(`${c.id}: prompt too long to render large`);
    if (c.judging === 'auto' && !c.detector) problems.push(`${c.id}: auto round without a detector`);
    if (c.judging === 'peer' && c.detector) problems.push(`${c.id}: peer round must not carry a detector`);
    if (c.durationMs < 10_000 || c.durationMs > 60_000) problems.push(`${c.id}: implausible duration`);
    if (c.tags.length === 0) problems.push(`${c.id}: needs at least one tag`);
  }
  return problems;
}

/**
 * A few prompts that show the range of the game, for the lobby.
 *
 * Deliberately spread across categories rather than sampled at random: three
 * colour rounds in a row would tell a new player the game is only about
 * colours, which is the wrong expectation to set while they wait.
 */
export function samplePrompts(count = 3, random: RandomSource = Math.random): string[] {
  const wanted: ChallengeCategory[] = ['color', 'story', 'action', 'object', 'wildcard'];
  const picked: string[] = [];

  for (const category of wanted) {
    if (picked.length >= count) break;
    const options = CHALLENGES.filter((c) => c.category === category);
    if (options.length === 0) continue;
    const choice = options[Math.min(options.length - 1, Math.floor(random() * options.length))];
    if (choice) picked.push(choice.prompt);
  }
  return picked.slice(0, count);
}

export interface PickOptions {
  /** Challenge ids already played in this match. */
  used: readonly string[];
  /** 1-based. Drives the difficulty ramp. */
  roundNumber: number;
  /** Judging modes of the previous rounds, most recent last. */
  recentModes?: readonly JudgingMode[];
  random?: RandomSource;
  pool?: readonly Challenge[];
}

/**
 * Picks the next challenge.
 *
 * Three rules, in order of importance:
 *  1. Never repeat inside a match.
 *  2. Round one is always auto-judged — it is the fastest way to teach the
 *     mechanic, and a brand-new player should not have to vote before they have
 *     seen a round resolve.
 *  3. Never three peer rounds in a row; voting back-to-back-to-back drags.
 * Difficulty ramps with the round number but stays a preference, not a filter,
 * so a long match never runs out of options.
 */
export function pickChallenge(opts: PickOptions): Challenge {
  const pool = opts.pool ?? CHALLENGES;
  const random = opts.random ?? Math.random;
  const used = new Set(opts.used);

  let candidates = pool.filter((c) => !used.has(c.id));
  if (candidates.length === 0) candidates = [...pool];

  const recent = opts.recentModes ?? [];
  const lastTwoArePeer =
    recent.length >= 2 && recent.slice(-2).every((m) => m === 'peer');

  if (opts.roundNumber <= 1 || lastTwoArePeer) {
    const autos = candidates.filter((c) => c.judging === 'auto');
    if (autos.length > 0) candidates = autos;
  }

  const targetDifficulty = opts.roundNumber <= 1 ? 1 : opts.roundNumber <= 3 ? 2 : 3;
  const weights = candidates.map((c) => {
    const distance = Math.abs(c.difficulty - targetDifficulty);
    return distance === 0 ? 3 : distance === 1 ? 1.5 : 0.6;
  });

  return weightedPick(candidates, weights, random);
}

function weightedPick<T>(items: readonly T[], weights: readonly number[], random: RandomSource): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}
