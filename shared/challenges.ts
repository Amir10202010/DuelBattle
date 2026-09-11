import { z } from 'zod';

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
export const challengeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,60}$/),
    prompt: z.string().trim().min(8).max(120),
    category: z.enum(categories),
    difficulty: z.enum(['easy', 'medium']),
    verificationType: z.enum(['OBJECT', 'ACTION', 'OBJECT_ACTION', 'SUBJECTIVE']),
    timeLimit: z.number().int().min(15).max(60),
    aiVerifiable: z.boolean(),
    subjective: z.boolean(),
    language: z.literal('en'),
    safetyConstraints: z.array(z.string().min(3).max(120)).min(1).max(8),
    version: z.number().int().positive(),
    color: z.enum(['red', 'blue', 'green']).optional(),
    instructions: z.string().min(8).max(200),
  })
  .strict();
export type Challenge = z.infer<typeof challengeSchema>;

const safety = [
  'Stay in your room. Walk, never run.',
  'Use small, safe objects. Keep private information off camera.',
];
function entry(
  id: string,
  prompt: string,
  category: Challenge['category'],
  verificationType: Challenge['verificationType'],
  instructions: string,
  color?: Challenge['color'],
): Challenge {
  return challengeSchema.parse({
    id,
    prompt,
    category,
    verificationType,
    instructions,
    color,
    difficulty: 'easy',
    timeLimit: 30,
    aiVerifiable: false,
    subjective: verificationType === 'SUBJECTIVE',
    language: 'en',
    safetyConstraints: safety,
    version: 1,
  });
}

// Reviewed first-party catalog. Unreviewed text never enters this list at runtime.
export const CHALLENGES: readonly Challenge[] = [
  entry(
    'show-red',
    'Show something red',
    'COLOR',
    'OBJECT',
    'Hold a red object close to the camera, inside the guide.',
    'red',
  ),
  entry(
    'show-blue',
    'Show something blue',
    'COLOR',
    'OBJECT',
    'Pick up a blue object and show it inside the guide.',
    'blue',
  ),
  entry(
    'show-green',
    'Show something green',
    'COLOR',
    'OBJECT',
    'Hold something green in your hand, close to the camera.',
    'green',
  ),
  entry(
    'both-hands',
    'Show both hands',
    'ACTION',
    'ACTION',
    'Hold both open hands beside your face. Keep them visible in your snapshot.',
  ),
  entry(
    'something-face',
    'Show something with a face',
    'OBJECT',
    'OBJECT',
    'Show a small object with a printed or drawn face. Your own face does not count.',
  ),
  entry(
    'blue-head',
    'Put something blue on your head',
    'OBJECT_ACTION',
    'OBJECT_ACTION',
    'Balance a small, soft blue object on your head. Nothing heavy or breakable.',
    'blue',
  ),
  entry(
    'letter-b',
    'Show something starting with B',
    'LETTER',
    'OBJECT',
    'Grab a safe object whose English name starts with B. Show it clearly.',
  ),
  entry(
    'useless-object',
    'Show the most useless thing in your room',
    'FUNNY',
    'SUBJECTIVE',
    'Make your case! Your opponent decides if your object fits the challenge.',
  ),
  entry(
    'friend-gift',
    'Show something a friend gave you',
    'PERSONAL',
    'SUBJECTIVE',
    'Hold up a gift and tell its story. A personal claim is judged by your friend.',
  ),
  entry(
    'under-five',
    'Show something that cost less than $5',
    'MONEY',
    'SUBJECTIVE',
    'Choose an inexpensive everyday object. No receipts or payment information.',
  ),
  entry(
    'tiny-trophy',
    'Turn a safe object into a trophy',
    'CREATIVE',
    'SUBJECTIVE',
    'Hold up a small, unbreakable object and give your best victory pose.',
  ),
  entry(
    'freeze-pose',
    'Freeze in your best superhero pose',
    'REACTION',
    'ACTION',
    'Strike a standing or seated superhero pose. No jumping or climbing.',
  ),
  entry(
    'sock-puppet',
    'Give a sock a personality',
    'CHAOS',
    'SUBJECTIVE',
    'Put a clean sock on your hand and introduce your new rival.',
  ),
  entry(
    'older-object',
    'Find something older than you',
    'PERSONAL',
    'SUBJECTIVE',
    'Show an object you believe is older than you. Your friend judges your explanation.',
  ),
  entry(
    'touch-green',
    'Touch something green',
    'OBJECT_ACTION',
    'OBJECT_ACTION',
    'Bring a small green object to the camera and visibly touch it.',
    'green',
  ),
  entry(
    'round-object',
    'Show something perfectly round',
    'OBJECT',
    'OBJECT',
    'Hold up a small, safe round object, with its outline visible.',
  ),
  entry(
    'letter-a',
    'Show something starting with A',
    'LETTER',
    'OBJECT',
    'Pick a safe object with an English name starting with A.',
  ),
  entry(
    'thumbs-up',
    'Give a double thumbs-up',
    'ACTION',
    'ACTION',
    'Show both thumbs up beside your face. Keep your hands in the frame.',
  ),
  entry(
    'soft-object',
    'Show the softest thing within reach',
    'OBJECT',
    'SUBJECTIVE',
    'Choose something nearby and give it a gentle squeeze on camera.',
  ),
  entry(
    'funny-hat',
    'Wear something that is not a hat',
    'FUNNY',
    'SUBJECTIVE',
    'Use a small, soft item as a hat. Keep your eyes and breathing clear.',
  ),
];

export interface ChallengeProposal {
  challenge: Challenge;
  status: 'PENDING_REVIEW';
}
export function validateProposal(
  input: unknown,
  supported: Challenge['verificationType'][],
): ChallengeProposal {
  const challenge = challengeSchema.parse(input);
  if (
    /[<>\n\r]|https?:|www\.|\b(knife|blade|fire|burn|weapon|gun|drug|alcohol|naked|nude|password|address|credit card|jump|climb|outside|swallow|choke|outlet|electric|suicide|kill|hate|blood)\b/i.test(
      challenge.prompt + ' ' + challenge.instructions,
    )
  ) {
    throw new Error('This challenge needs a safer idea.');
  }
  if (!supported.includes(challenge.verificationType))
    throw new Error('This verification method is unavailable.');
  if (challenge.subjective !== (challenge.verificationType === 'SUBJECTIVE'))
    throw new Error('Subjective challenges require human review.');
  if (challenge.aiVerifiable)
    throw new Error('Automatic verification is not available for custom challenges.');
  // Schema/rules cannot prove arbitrary text is safe or feasible: quarantine until human review.
  return { challenge, status: 'PENDING_REVIEW' };
}

export interface ChallengeGenerator {
  generate(context: {
    category: Challenge['category'];
    difficulty: Challenge['difficulty'];
    language: 'en';
    previousIds: string[];
    supported: Challenge['verificationType'][];
  }): Promise<unknown>;
}
export async function generateProposal(
  provider: ChallengeGenerator,
  context: Parameters<ChallengeGenerator['generate']>[0],
) {
  return validateProposal(await provider.generate(context), context.supported);
}

export function selectChallenge(previous: string[], random: () => number = Math.random): Challenge {
  const unused = CHALLENGES.filter((c) => !previous.includes(c.id));
  const pool = unused.length ? unused : CHALLENGES.filter((c) => c.id !== previous.at(-1));
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
