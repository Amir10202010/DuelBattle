import type { z } from 'zod';
import type { challengeSchema } from './validation';

export const categories = [
  'OBJECT',
  'COLOR',
  'ACTION',
  'OBJECT_ACTION',
  'PERSONAL',
  'MONEY',
  'LETTER',
  'FUNNY',
  'CREATIVE',
  'REACTION',
  'CHAOS',
] as const;
export type Challenge = z.infer<typeof challengeSchema>;

const safety = [
  'Stay in your room. Walk, never run.',
  'Use small, safe objects. Keep private information off camera.',
];

interface EntryOptions {
  color?: Challenge['color'];
  difficulty?: Challenge['difficulty'];
  timeLimit?: number;
}
function entry(
  id: string,
  prompt: string,
  category: Challenge['category'],
  verificationType: Challenge['verificationType'],
  instructions: string,
  options: EntryOptions = {},
): Challenge {
  return {
    id,
    prompt,
    category,
    verificationType,
    instructions,
    color: options.color,
    difficulty: options.difficulty ?? 'easy',
    timeLimit: options.timeLimit ?? 30,
    // Colour assistance is advisory evidence for the opponent, never an award.
    aiVerifiable: false,
    subjective: verificationType === 'SUBJECTIVE',
    language: 'en',
    safetyConstraints: safety,
    version: 2,
  };
}

/**
 * The reviewed first-party catalogue. Unreviewed text never enters this list at
 * runtime — custom prompts go through `validateProposal` on the server and stay
 * quarantined until a human approves them.
 *
 * A challenge carries a `color` only when the detector can offer the opponent
 * useful evidence about it. That is the single reason the field exists: no entry
 * is decided automatically.
 */
export const CHALLENGES: readonly Challenge[] = [
  // Colour — fast, legible, and the rounds the detector can actually assist with.
  entry(
    'show-red',
    'Show something red',
    'COLOR',
    'OBJECT',
    'Hold a red object close to the camera, inside the guide.',
    { color: 'red', timeLimit: 20 },
  ),
  entry(
    'show-blue',
    'Show something blue',
    'COLOR',
    'OBJECT',
    'Pick up a blue object and show it inside the guide.',
    { color: 'blue', timeLimit: 20 },
  ),
  entry(
    'show-green',
    'Show something green',
    'COLOR',
    'OBJECT',
    'Hold something green in your hand, close to the camera.',
    { color: 'green', timeLimit: 20 },
  ),
  entry(
    'show-white',
    'Show something white',
    'COLOR',
    'OBJECT',
    'Hold a white object up so it fills the guide.',
    { color: 'white', timeLimit: 20 },
  ),
  entry(
    'show-black',
    'Show something black',
    'COLOR',
    'OBJECT',
    'Hold a black object up so it fills the guide.',
    { color: 'black', timeLimit: 20 },
  ),
  entry(
    'show-yellow',
    'Show something yellow',
    'COLOR',
    'OBJECT',
    'Find something yellow and bring it to the camera.',
    { color: 'yellow', difficulty: 'medium', timeLimit: 25 },
  ),
  entry(
    'show-orange',
    'Show something orange',
    'COLOR',
    'OBJECT',
    'Find something orange and bring it to the camera.',
    { color: 'orange', difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'show-purple',
    'Show something purple',
    'COLOR',
    'OBJECT',
    'Purple is rarer than you think. Hunt fast.',
    { color: 'purple', difficulty: 'hard', timeLimit: 30 },
  ),
  entry(
    'show-pink',
    'Show something pink',
    'COLOR',
    'OBJECT',
    'Pink counts even if it is a label or a cover.',
    { color: 'pink', difficulty: 'hard', timeLimit: 30 },
  ),
  entry(
    'fill-red',
    'Fill the frame with red',
    'COLOR',
    'OBJECT',
    'Get a red object right up to the lens until it fills the guide.',
    { color: 'red', difficulty: 'medium', timeLimit: 20 },
  ),
  entry(
    'fill-blue',
    'Fill the frame with blue',
    'COLOR',
    'OBJECT',
    'Get a blue object right up to the lens until it fills the guide.',
    { color: 'blue', difficulty: 'medium', timeLimit: 20 },
  ),

  // Object + action — colour assistance plus an interaction only a person can confirm.
  entry(
    'blue-head',
    'Put something blue on your head',
    'OBJECT_ACTION',
    'OBJECT_ACTION',
    'Balance a small, soft blue object on your head. Nothing heavy or breakable.',
    { color: 'blue', difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'touch-green',
    'Touch something green',
    'OBJECT_ACTION',
    'OBJECT_ACTION',
    'Bring a small green object to the camera and visibly touch it.',
    { color: 'green', timeLimit: 25 },
  ),

  // Objects — a scavenger hunt your opponent judges.
  entry(
    'drinkable',
    'Show something you can drink',
    'OBJECT',
    'OBJECT',
    'Hold up a drink or an empty cup. Keep it upright and away from your keyboard.',
    { timeLimit: 20 },
  ),
  entry(
    'something-face',
    'Show something with a face',
    'OBJECT',
    'OBJECT',
    'A toy, a poster or a mug. Your own face does not count.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'round-object',
    'Show something perfectly round',
    'OBJECT',
    'OBJECT',
    'Hold up a small, safe round object, with its outline visible.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'battery-object',
    'Show something that needs a battery',
    'OBJECT',
    'OBJECT',
    'A remote, a mouse, a toy. Show the whole thing to the camera.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'soft-object',
    'Show the softest thing within reach',
    'OBJECT',
    'SUBJECTIVE',
    'Choose something nearby and give it a gentle squeeze on camera.',
    { timeLimit: 25 },
  ),
  entry(
    'smallest-thing',
    'Show the smallest thing you own',
    'OBJECT',
    'SUBJECTIVE',
    'Hold it close enough that your opponent can actually see it.',
    { difficulty: 'hard', timeLimit: 30 },
  ),
  entry(
    'handwriting',
    'Show something with your handwriting on it',
    'OBJECT',
    'SUBJECTIVE',
    'A note or a doodle is plenty. Keep private details out of shot.',
    { difficulty: 'hard', timeLimit: 35 },
  ),

  // Letters — quick word thinking under pressure.
  entry(
    'letter-a',
    'Show something starting with A',
    'LETTER',
    'OBJECT',
    'Pick a safe object with an English name starting with A.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'letter-b',
    'Show something starting with B',
    'LETTER',
    'OBJECT',
    'Grab a safe object whose English name starts with B. Show it clearly.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'letter-s',
    'Show something starting with S',
    'LETTER',
    'OBJECT',
    'Grab a safe object whose English name starts with S. Show it clearly.',
    { difficulty: 'medium', timeLimit: 30 },
  ),

  // Money — always a claim, so always a human call.
  entry(
    'under-five',
    'Show something that cost less than $5',
    'MONEY',
    'SUBJECTIVE',
    'Choose an inexpensive everyday object. No receipts or payment information.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'priciest-thing',
    'Show the priciest thing within reach',
    'MONEY',
    'SUBJECTIVE',
    'Keep it in your hands and keep it safe. Your opponent judges the claim.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'regret-buy',
    'Show a purchase you regret',
    'MONEY',
    'SUBJECTIVE',
    'Hold it up and make the case for why it was a mistake.',
    { difficulty: 'hard', timeLimit: 40 },
  ),

  // Personal — the reason people play this with a friend rather than a stranger.
  entry(
    'older-object',
    'Find something older than you',
    'PERSONAL',
    'SUBJECTIVE',
    'Show an object you believe is older than you. Your friend judges your explanation.',
    { difficulty: 'hard', timeLimit: 40 },
  ),
  entry(
    'friend-gift',
    'Show something a friend gave you',
    'PERSONAL',
    'SUBJECTIVE',
    'Hold up a gift and tell its story. A personal claim is judged by your friend.',
    { difficulty: 'hard', timeLimit: 40 },
  ),
  entry(
    'from-far-away',
    'Show something from another country',
    'PERSONAL',
    'SUBJECTIVE',
    'A souvenir, a label, a coin. Say where it came from.',
    { difficulty: 'hard', timeLimit: 40 },
  ),
  entry(
    'five-years',
    'Show something you have kept for five years',
    'PERSONAL',
    'SUBJECTIVE',
    'Hold it up and explain how it survived that long.',
    { difficulty: 'hard', timeLimit: 40 },
  ),

  // Funny — low stakes, high payoff.
  entry(
    'useless-object',
    'Show the most useless thing in your room',
    'FUNNY',
    'SUBJECTIVE',
    'Make your case! Your opponent decides if your object fits the challenge.',
    { timeLimit: 30 },
  ),
  entry(
    'funny-hat',
    'Wear something that is not a hat',
    'FUNNY',
    'SUBJECTIVE',
    'Use a small, soft item as a hat. Keep your eyes and breathing clear.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'hide-from-guest',
    'Show what you would hide from a guest',
    'FUNNY',
    'SUBJECTIVE',
    'Keep it light, and keep anything private out of frame.',
    { difficulty: 'medium', timeLimit: 35 },
  ),

  // Creative — a bit of staging.
  entry(
    'tiny-trophy',
    'Turn a safe object into a trophy',
    'CREATIVE',
    'SUBJECTIVE',
    'Hold up a small, unbreakable object and give your best victory pose.',
    { difficulty: 'medium', timeLimit: 30 },
  ),
  entry(
    'stack-three',
    'Stack three things on top of each other',
    'CREATIVE',
    'ACTION',
    'Build a small tower on your desk and keep it standing in frame.',
    { difficulty: 'hard', timeLimit: 40 },
  ),

  // Action — get people out of their chair, safely.
  entry(
    'both-hands',
    'Show both hands',
    'ACTION',
    'ACTION',
    'Hold both open hands beside your face. Keep them visible in your snapshot.',
    { timeLimit: 20 },
  ),
  entry(
    'thumbs-up',
    'Give a double thumbs-up',
    'ACTION',
    'ACTION',
    'Show both thumbs up beside your face. Keep your hands in the frame.',
    { timeLimit: 20 },
  ),
  entry(
    'show-behind',
    'Show what is behind you',
    'ACTION',
    'ACTION',
    'Turn your camera or yourself so your opponent sees the room behind you.',
    { timeLimit: 25 },
  ),

  // Reaction — instinct, not searching.
  entry(
    'freeze-pose',
    'Freeze in your best superhero pose',
    'REACTION',
    'ACTION',
    'Strike a standing or seated superhero pose. Keep both feet on the floor.',
    { timeLimit: 25 },
  ),
  entry(
    'opponent-impression',
    'Do an impression of your opponent',
    'REACTION',
    'SUBJECTIVE',
    'Thirty seconds of gentle mockery. They score it.',
    { difficulty: 'medium', timeLimit: 30 },
  ),

  // Chaos — rare, memorable, still safe.
  entry(
    'sock-puppet',
    'Give a sock a personality',
    'CHAOS',
    'SUBJECTIVE',
    'Put a clean sock on your hand and introduce your new rival.',
    { difficulty: 'medium', timeLimit: 35 },
  ),
  entry(
    'three-red-things',
    'Show three red things at once',
    'CHAOS',
    'SUBJECTIVE',
    'All three in the same shot, all at the same time.',
    { difficulty: 'hard', timeLimit: 35 },
  ),
];

const BY_ID: ReadonlyMap<string, Challenge> = new Map(CHALLENGES.map((c) => [c.id, c]));

/** Photo-observable prompts only; personal history, prices and spoken claims stay in peer mode. */
export const AI_CHALLENGES: readonly Challenge[] = CHALLENGES.filter(
  (c) =>
    (!c.subjective && ['COLOR', 'OBJECT', 'OBJECT_ACTION', 'LETTER'].includes(c.category)) ||
    [
      'funny-hat',
      'tiny-trophy',
      'stack-three',
      'both-hands',
      'thumbs-up',
      'freeze-pose',
      'three-red-things',
    ].includes(c.id),
).map((c) => ({ ...c, aiVerifiable: true }));

export function getChallenge(id: string): Challenge | undefined {
  return BY_ID.get(id);
}

/**
 * Structural invariants the catalogue must satisfy. Asserted by the tests rather
 * than at import time, so a bad entry fails the build instead of a live match.
 */
export function validateCatalog(challenges: readonly Challenge[] = CHALLENGES): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  for (const c of challenges) {
    if (ids.has(c.id)) problems.push(`duplicate id: ${c.id}`);
    ids.add(c.id);
    const key = c.prompt.trim().toLowerCase();
    if (prompts.has(key)) problems.push(`duplicate prompt: ${c.prompt}`);
    prompts.add(key);
    if (c.prompt.length > 48) problems.push(`${c.id}: prompt is too long to render large`);
    if (c.subjective !== (c.verificationType === 'SUBJECTIVE'))
      problems.push(`${c.id}: subjective flag disagrees with the verification type`);
    if (c.aiVerifiable) problems.push(`${c.id}: no challenge is decided automatically`);
    if (c.color && c.category !== 'COLOR' && c.category !== 'OBJECT_ACTION')
      problems.push(`${c.id}: colour assistance only applies to colour rounds`);
    if (c.color && c.subjective)
      problems.push(`${c.id}: a subjective round cannot claim colour evidence`);
    if (!c.safetyConstraints.length) problems.push(`${c.id}: needs a safety constraint`);
  }
  const assisted = challenges.filter((c) => c.color);
  if (assisted.length < 4) problems.push('too few colour-assisted rounds to open a match with one');
  return problems;
}

const RANK: Record<Challenge['difficulty'], number> = { easy: 0, medium: 1, hard: 2 };

function weightedPick(
  pool: readonly Challenge[],
  weights: number[],
  random: () => number,
): Challenge {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/**
 * Picks the next challenge, in order of importance:
 *  1. Never repeat a recent prompt.
 *  2. Round one is a colour round — it is the quickest way to teach the loop,
 *     and a new player should see a round resolve before they have to judge one.
 *  3. Never three opponent-judged rounds in a row; voting back to back drags.
 * Difficulty ramps with the round number as a preference, not a filter, so a
 * long match never runs out of options.
 */
export function selectChallenge(
  previous: readonly string[] = [],
  random: () => number = Math.random,
  roundNumber = 1,
  catalog: readonly Challenge[] = CHALLENGES,
): Challenge {
  const played = new Set(previous);
  let pool = catalog.filter((c) => !played.has(c.id));
  if (!pool.length) pool = catalog.filter((c) => c.id !== previous.at(-1));
  if (!pool.length) pool = [...catalog];

  const recent = previous.slice(-2).map(getChallenge);
  const judgedTwice = recent.length === 2 && recent.every((c) => c?.subjective);
  if (roundNumber <= 1 || judgedTwice) {
    const assisted = pool.filter((c) => c.color && !c.subjective);
    if (assisted.length) pool = assisted;
  }

  const target = roundNumber <= 1 ? 'easy' : roundNumber <= 3 ? 'medium' : 'hard';
  const weights = pool.map((c) => {
    const distance = Math.abs(RANK[c.difficulty] - RANK[target]);
    return distance === 0 ? 3 : distance === 1 ? 1.5 : 0.6;
  });
  return weightedPick(pool, weights, random);
}
