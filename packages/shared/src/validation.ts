import { z } from 'zod';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './ids.js';
import type { ClientMessage } from './protocol.js';
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
  z.object({ t: z.literal('hello'), protocol: z.number().int() }),
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
