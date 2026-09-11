import { z } from 'zod';
import { categories } from './challenges';
import { PLAYER_NAME_PATTERN, ROOM_CODE_PATTERN } from './identity';

export const roomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(PLAYER_NAME_PATTERN, 'Use letters, numbers, spaces, or a dash.');

export const baseAction = z.object({ roomCode: roomCodeSchema }).strict();
export const imageSchema = z
  .string()
  .max(110_000)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/);
export const actionSchemas = {
  find: z.object({ name: nameSchema }).strict(),
  create: z.object({ name: nameSchema }).strict(),
  join: z.object({ roomCode: roomCodeSchema, name: nameSchema }).strict(),
  ready: baseAction.extend({ ready: z.boolean() }),
  media: baseAction.extend({ camera: z.boolean(), microphone: z.boolean() }),
  baseline: baseAction.extend({ roundId: z.uuid(), image: imageSchema }),
  submit: baseAction.extend({
    roundId: z.uuid(),
    nonce: z.uuid(),
    image: imageSchema,
    contextImages: z.array(imageSchema).max(2),
  }),
  review: baseAction.extend({ roundId: z.uuid(), attemptId: z.uuid(), accept: z.boolean() }),
  rematch: baseAction,
  leave: baseAction,
  signal: baseAction
    .extend({
      description: z
        .object({ type: z.enum(['offer', 'answer']), sdp: z.string().max(24_000) })
        .strict()
        .optional(),
      candidate: z
        .object({
          candidate: z.string().max(2000),
          sdpMid: z.string().max(64).nullable().optional(),
          sdpMLineIndex: z.number().int().min(0).max(20).nullable().optional(),
          usernameFragment: z.string().max(256).nullable().optional(),
        })
        .strict()
        .optional(),
    })
    .refine((v) => !!v.description !== !!v.candidate),
};

export const challengeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{3,60}$/),
    prompt: z.string().trim().min(8).max(120),
    category: z.enum(categories),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    verificationType: z.enum(['OBJECT', 'ACTION', 'OBJECT_ACTION', 'SUBJECTIVE']),
    timeLimit: z.number().int().min(15).max(60),
    aiVerifiable: z.boolean(),
    subjective: z.boolean(),
    language: z.literal('en'),
    safetyConstraints: z.array(z.string().min(3).max(120)).min(1).max(8),
    version: z.number().int().positive(),
    color: z
      .enum(['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'white', 'black'])
      .optional(),
    instructions: z.string().min(8).max(200),
  })
  .strict();
