import type { z } from 'zod';
import type { actionSchemas } from './validation';
import type { Challenge } from './challenges';
import type { Judgement } from './judging';

export const PROTOCOL_VERSION = 3;

export const states = [
  'WAITING_FOR_PLAYER',
  'READY',
  'COUNTDOWN',
  'CHALLENGE_ACTIVE',
  'JUDGING',
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
  CHALLENGE_ACTIVE: ['JUDGING', 'ROUND_RESULT', 'RECONNECTING', 'CANCELLED'],
  JUDGING: ['ROUND_RESULT', 'RECONNECTING', 'CANCELLED'],
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
  status: 'checking' | 'pending' | 'submitted' | 'accepted' | 'rejected' | 'expired';
  image: string;
  contextImages: string[];
  observation?: string;
}
export interface Round {
  judgement?: Judgement;
  id: string;
  number: number;
  /** Withheld by the server until the countdown finishes. */
  challenge: Challenge | null;
  startsAt: number;
  endsAt: number;
  attempts: Attempt[];
  winnerId: string | null;
  reason: string | null;
}
export interface RoundSummary {
  judgement?: Judgement;
  number: number;
  prompt: string;
  winnerId: string | null;
  reason: string;
  elapsedMs: Record<string, number | null>;
}
export interface RoomSnapshot {
  mode: 'private' | 'random';
  judgeMode: 'ai' | 'peer';
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
  judgeMode?: 'ai' | 'peer';
  id: string;
  csrf: string;
  plan: 'free' | 'premium';
  remaining: number | null;
  resetAt: number;
  nextBattleAt: number | null;
}
export type Reply<T = void> = { ok: true; data: T } | { ok: false; error: string; code: string };
export type Ack<T = void> = (reply: Reply<T>) => void;
export type Signal = z.infer<typeof actionSchemas.signal>;
export interface ServerEvents {
  snapshot: (room: RoomSnapshot) => void;
  signal: (data: Signal) => void;
  notice: (message: string) => void;
}
export interface ClientEvents {
  find: (data: z.infer<typeof actionSchemas.find>, ack: Ack<{ code: string }>) => void;
  create: (data: z.infer<typeof actionSchemas.create>, ack: Ack<{ code: string }>) => void;
  join: (data: z.infer<typeof actionSchemas.join>, ack: Ack<RoomSnapshot>) => void;
  ready: (data: z.infer<typeof actionSchemas.ready>, ack: Ack) => void;
  media: (data: z.infer<typeof actionSchemas.media>, ack: Ack) => void;
  baseline: (data: z.infer<typeof actionSchemas.baseline>, ack: Ack) => void;
  submit: (data: z.infer<typeof actionSchemas.submit>, ack: Ack) => void;
  review: (data: z.infer<typeof actionSchemas.review>, ack: Ack) => void;
  rematch: (data: z.infer<typeof actionSchemas.rematch>, ack: Ack) => void;
  leave: (data: z.infer<typeof actionSchemas.leave>, ack: Ack) => void;
  signal: (data: Signal, ack?: Ack) => void;
  clock: (ack: (serverNow: number) => void) => void;
}
