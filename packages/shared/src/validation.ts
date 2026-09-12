import { z } from 'zod';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './ids.js';
import type { ClientMessage } from './protocol.js';
import type { Detection, PhotoAssessment } from './judging.js';
import { MAX_FRAME_BYTES, MAX_IMAGE_BYTES, MAX_NAME_LENGTH } from './protocol.js';

/**
 * Wire validation, kept out of the main entry point on purpose.
 *
 * Only the server parses untrusted messages, and zod is a third of the client
 * bundle if it comes along for the ride. The client imports the types and the
 * limits from `@battle/shared`; the schemas that enforce them live here.
 */
/**
 * Control characters, zero-width marks and bidi overrides are the cheap way to
 * grief a scoreboard; reject them at the edge rather than defending at every
 * render site.
 */
const UNSAFE_NAME_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  '[\\u0000-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069]',
);

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Pick a name')
  .max(MAX_NAME_LENGTH, `Keep it under ${MAX_NAME_LENGTH} characters`)
  .refine((v) => !UNSAFE_NAME_CHARS.test(v), 'Unsupported characters');

export const roomCodeSchema = z
  .string()
  .regex(new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`), 'That room code looks wrong');

/**
 * Evidence is JPEG-only because the server decodes it to re-run the detector
 * itself. Allowing a format the verifier cannot read would mean silently
 * trusting the client's own verdict.
 */
const evidenceImageSchema = z
  .string()
  .max(MAX_IMAGE_BYTES, 'Snapshot too large')
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Unsupported snapshot format');

/**
 * Live camera frames. These are relayed to the opponent, and the last one that
 * lands before a prompt is revealed becomes that round's baseline, so they are
 * held to the same JPEG-only rule as evidence.
 */
const frameImageSchema = z
  .string()
  .max(MAX_FRAME_BYTES, 'Frame too large')
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Unsupported frame format');

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    protocol: z.number().int(),
    // Bounded before it is verified: an oversized token should be refused, not
    // hashed.
    identity: z.string().max(128).optional(),
  }),
  z.object({ t: z.literal('createRoom'), name: nameSchema }),
  z.object({ t: z.literal('joinRoom'), code: roomCodeSchema, name: nameSchema }),
  z.object({ t: z.literal('rejoin'), code: roomCodeSchema, token: z.string().min(8).max(128) }),
  z.object({ t: z.literal('cameraReady'), ready: z.boolean() }),
  z.object({ t: z.literal('ready'), ready: z.boolean() }),
  z.object({ t: z.literal('submit'), roundId: z.string().min(1).max(64), image: evidenceImageSchema }),
  z.object({
    t: z.literal('vote'),
    roundId: z.string().min(1).max(64),
    targetId: z.string().min(1).max(64),
    approve: z.boolean(),
  }),
  z.object({ t: z.literal('rematch') }),
  z.object({
    t: z.literal('addChallenge'),
    // Generous here so the server can normalise and explain; the real rules
    // live in validateCustomPrompt, which both sides share.
    prompt: z.string().min(1).max(200),
  }),
  z.object({ t: z.literal('removeChallenge'), id: z.string().min(1).max(64) }),
  z.object({ t: z.literal('setWinTarget'), winTarget: z.number().int().min(1).max(20) }),
  z.object({ t: z.literal('pass'), roundId: z.string().min(1).max(64) }),
  z.object({ t: z.literal('leave') }),
  z.object({ t: z.literal('ping'), id: z.number().int() }),
  z.object({ t: z.literal('frame'), image: frameImageSchema, seq: z.number().int().nonnegative() }),
]);




/**
 * Compile-time proof that the hand-written `ClientMessage` union and the schema
 * that guards the socket have not drifted apart.
 */
type SchemaMatchesType = z.infer<typeof clientMessageSchema> extends ClientMessage
  ? ClientMessage extends z.infer<typeof clientMessageSchema>
    ? true
    : never
  : never;
export const PROTOCOL_TYPES_AGREE: SchemaMatchesType = true;

/* -------------------------------------------------------------------------
 * The AI referee's reply
 *
 * A model's output is untrusted input like any other. It arrives as text over
 * HTTP, so it is parsed here rather than cast, and the schema is handed to the
 * API as the required response shape so the model is constrained at both ends.
 * ---------------------------------------------------------------------- */

export const detectionSchema = z
  .object({
    label: z.string().min(1).max(60),
    confidence: z.number().min(0).max(1),
    box: z.tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ]),
  })
  .strict();

export const photoAssessmentSchema = z
  .object({
    slot: z.enum(['A', 'B']),
    valid: z.boolean(),
    confidence: z.number().min(0).max(1),
    fulfillment: z.number().int().min(0).max(70),
    presentation: z.number().int().min(0).max(30),
    objects: z.array(z.string().min(1).max(60)).max(8),
    reason: z.string().min(1).max(300),
  })
  .strict();

export const judgeResponseSchema = z
  .object({
    assessments: z.array(photoAssessmentSchema).min(1).max(2),
  })
  .strict();

/**
 * The same contract again, in the shape Google's API wants.
 *
 * Written out rather than generated from the zod schema above: it is what the
 * model is *required* to return, so it is worth being able to read. A test
 * holds the two in step — the schema and its twin cannot drift without the
 * suite noticing.
 */
export const JUDGE_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assessments'],
  properties: {
    assessments: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'slot',
          'valid',
          'confidence',
          'fulfillment',
          'presentation',
          'objects',
          'reason',
        ],
        properties: {
          slot: { type: 'string', enum: ['A', 'B'] },
          valid: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          fulfillment: { type: 'integer', minimum: 0, maximum: 70 },
          presentation: { type: 'integer', minimum: 0, maximum: 30 },
          objects: {
            type: 'array',
            maxItems: 8,
            items: { type: 'string', minLength: 1, maxLength: 60 },
          },
          reason: { type: 'string', minLength: 1, maxLength: 300 },
        },
      },
    },
  },
} as const;

/**
 * The same compile-time proof the wire protocol gets: the hand-written types in
 * `judging.ts` and the schemas that parse the model's reply cannot drift apart
 * without the build saying so.
 */
type AssessmentSchemaMatchesType = z.infer<typeof photoAssessmentSchema> extends PhotoAssessment
  ? PhotoAssessment extends z.infer<typeof photoAssessmentSchema>
    ? true
    : never
  : never;
export const ASSESSMENT_TYPES_AGREE: AssessmentSchemaMatchesType = true;

type DetectionSchemaMatchesType = z.infer<typeof detectionSchema> extends Detection
  ? Detection extends z.infer<typeof detectionSchema>
    ? true
    : never
  : never;
export const DETECTION_TYPES_AGREE: DetectionSchemaMatchesType = true;
