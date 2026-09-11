import { z } from 'zod';
import type { Challenge } from './challenges';

export const roomCodeSchema = z.string().regex(/^[A-F0-9]{10}$/);
export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Use letters, numbers, spaces, or a dash.');
export const states = [
  'WAITING_FOR_PLAYER',
  'READY',
  'COUNTDOWN',
  'CHALLENGE_ACTIVE',
  'ROUND_RESULT',
  'NEXT_ROUND',
  'MATCH_RESULT',
  'RECONNECTING',
  'CANCELLED',
] as const;
export type GameState = (typeof states)[number];
export const transitions: Record<GameState, readonly GameState[]> = {
  WAITING_FOR_PLAYER: ['READY', 'RECONNECTING', 'CANCELLED'],
  READY: ['COUNTDOWN', 'WAITING_FOR_PLAYER', 'RECONNECTING', 'CANCELLED'],
  COUNTDOWN: ['CHALLENGE_ACTIVE', 'RECONNECTING', 'CANCELLED'],
  CHALLENGE_ACTIVE: ['ROUND_RESULT', 'RECONNECTING', 'CANCELLED'],
  ROUND_RESULT: ['NEXT_ROUND', 'MATCH_RESULT', 'RECONNECTING', 'CANCELLED'],
  NEXT_ROUND: ['COUNTDOWN', 'RECONNECTING', 'CANCELLED'],
  MATCH_RESULT: ['COUNTDOWN', 'RECONNECTING', 'CANCELLED'],
  RECONNECTING: [
    'WAITING_FOR_PLAYER',
    'READY',
    'COUNTDOWN',
    'ROUND_RESULT',
    'NEXT_ROUND',
    'MATCH_RESULT',
    'CANCELLED',
  ],
  CANCELLED: [],
};
export function canTransition(from: GameState, to: GameState) {
  return transitions[from].includes(to);
}

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  ready: boolean;
  camera: boolean;
  microphone: boolean;
  rematch: boolean;
  score: number;
}
export interface Attempt {
  id: string;
  playerId: string;
  receivedAt: number;
  expiresAt: number;
  status: 'pending' | 'accepted' | 'rejected' | 'expired';
  image: string;
}
export interface Round {
  id: string;
  number: number;
  challenge: Challenge;
  startsAt: number;
  endsAt: number;
  attempts: Attempt[];
  winnerId: string | null;
  reason: string | null;
}
export interface RoundSummary {
  number: number;
  prompt: string;
  winnerId: string | null;
  reason: string;
}
export interface RoomSnapshot {
  code: string;
  hostId: string;
  state: GameState;
  players: Player[];
  bestOf: number;
  matchId: string | null;
  round: Round | null;
  history: RoundSummary[];
  deadline: number | null;
  winnerId: string | null;
  message: string | null;
  revision: number;
  serverNow: number;
}
export interface Profile {
  id: string;
  csrf: string;
  plan: 'free' | 'premium';
  remaining: number | null;
  resetAt: number;
  nextBattleAt: number | null;
}
export type Reply<T = void> = { ok: true; data: T } | { ok: false; error: string; code: string };
export type Ack<T = void> = (reply: Reply<T>) => void;
export const baseAction = z.object({ roomCode: roomCodeSchema }).strict();
export const actionSchemas = {
  create: z.object({ name: nameSchema }).strict(),
  join: z.object({ roomCode: roomCodeSchema, name: nameSchema }).strict(),
  ready: baseAction.extend({ ready: z.boolean() }),
  media: baseAction.extend({ camera: z.boolean(), microphone: z.boolean() }),
  submit: baseAction.extend({
    roundId: z.uuid(),
    nonce: z.uuid(),
    image: z
      .string()
      .max(110_000)
      .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
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
export type Signal = z.infer<typeof actionSchemas.signal>;
export interface ServerEvents {
  snapshot: (room: RoomSnapshot) => void;
  signal: (data: Signal) => void;
  notice: (message: string) => void;
}
export interface ClientEvents {
  create: (data: z.infer<typeof actionSchemas.create>, ack: Ack<{ code: string }>) => void;
  join: (data: z.infer<typeof actionSchemas.join>, ack: Ack<RoomSnapshot>) => void;
  ready: (data: z.infer<typeof actionSchemas.ready>, ack: Ack) => void;
  media: (data: z.infer<typeof actionSchemas.media>, ack: Ack) => void;
  submit: (data: z.infer<typeof actionSchemas.submit>, ack: Ack) => void;
  review: (data: z.infer<typeof actionSchemas.review>, ack: Ack) => void;
  rematch: (data: z.infer<typeof actionSchemas.rematch>, ack: Ack) => void;
  leave: (data: z.infer<typeof actionSchemas.leave>, ack: Ack) => void;
  signal: (data: Signal, ack?: Ack) => void;
  clock: (ack: (serverNow: number) => void) => void;
}
