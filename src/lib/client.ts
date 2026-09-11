import type { Socket } from 'socket.io-client';
import type { z } from 'zod';
import type { actionSchemas } from '../../shared/validation';
import type {
  ClientEvents,
  Profile,
  Reply,
  RoomSnapshot,
  ServerEvents,
} from '../../shared/protocol';

export type GameSocket = Socket<ServerEvents, ClientEvents>;
type Action = keyof typeof actionSchemas;
type Result<E extends Action> = E extends 'create'
  ? { code: string }
  : E extends 'join'
    ? RoomSnapshot
    : void;
export async function request<E extends Action>(
  socket: GameSocket,
  event: E,
  data: z.infer<(typeof actionSchemas)[E]>,
): Promise<Result<E>> {
  if (!socket.connected) throw new Error('Connection lost. We are reconnecting.');
  // One typed transport boundary: every payload is validated again by the server.
  const emit = socket.timeout(7000).emitWithAck.bind(socket) as unknown as (
    event: E,
    data: z.infer<(typeof actionSchemas)[E]>,
  ) => Promise<Reply<Result<E>>>;
  let reply: Reply<Result<E>>;
  try {
    reply = await emit(event, data);
  } catch {
    throw new Error('The server did not respond. Check the battle state before trying again.');
  }
  if (!reply.ok) throw new Error(reply.error);
  return reply.data;
}
export async function fetchProfile(signal?: AbortSignal): Promise<Profile> {
  const response = await fetch('/api/session', { signal, credentials: 'same-origin' });
  if (!response.ok) throw new Error('The arena is taking a breather. Please try again shortly.');
  return response.json() as Promise<Profile>;
}
export function navigate(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo(0, 0);
}
export function getName() {
  try {
    return localStorage.getItem('duelbattle-name') ?? '';
  } catch {
    return '';
  }
}
export function saveName(name: string) {
  try {
    localStorage.setItem('duelbattle-name', name);
  } catch {
    /* Preferences are optional. */
  }
}
export async function copyText(text: string) {
  if (!navigator.clipboard)
    throw new Error('Copy is unavailable here. Select and copy the link below.');
  await navigator.clipboard.writeText(text);
}
