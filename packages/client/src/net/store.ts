import {
  PROTOCOL_VERSION,
  type PublicMatchState,
  type ServerMessage,
} from '@battle/shared';
import { Connection, type ConnectionStatus } from './connection.js';

export interface Toast {
  id: number;
  kind: 'info' | 'warn' | 'error';
  message: string;
}

export type Screen = 'home' | 'room';

export interface StoreSnapshot {
  status: ConnectionStatus;
  screen: Screen;
  /** True between asking to join and being seated. */
  joining: boolean;
  match: PublicMatchState | null;
  you: string | null;
  roomCode: string | null;
  /** `${roundId}:${playerId}` -> JPEG data URL. */
  evidence: Record<string, string>;
  toasts: Toast[];
  /** Blocks the UI; only set for problems a retry cannot fix. */
  fatalError: string | null;
  /** Shown inline on the home screen, e.g. a bad room code. */
  joinError: string | null;
  latencyMs: number | null;
}

type Intent =
  | { kind: 'create'; name: string }
  | { kind: 'join'; code: string; name: string }
  | { kind: 'rejoin'; code: string; token: string };

interface StoredSession {
  code: string;
  token: string;
  name: string;
}

const SESSION_KEY = 'battle.session.v1';
const NAME_KEY = 'battle.name.v1';
const TOAST_MS = 4_000;

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.code !== 'string' || typeof parsed.token !== 'string') return null;
    return { code: parsed.code, token: parsed.token, name: parsed.name ?? '' };
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Private browsing modes throw on write; the session is a convenience only.
  }
}

export function rememberedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}

const EMPTY: StoreSnapshot = {
  status: 'connecting',
  screen: 'home',
  joining: false,
  match: null,
  you: null,
  roomCode: null,
  evidence: {},
  toasts: [],
  fatalError: null,
  joinError: null,
  latencyMs: null,
};

/**
 * Single source of client-side truth. The server owns the match; this owns the
 * connection, the session and everything the UI needs that is not in the match
 * state itself.
 *
 * Live opponent frames deliberately bypass this store — they arrive several
 * times a second and go straight to the element that draws them, so they never
 * re-render the rest of the app.
 */
export class MatchStore {
  private snapshot: StoreSnapshot = EMPTY;
  private readonly listeners = new Set<() => void>();
  private readonly frameListeners = new Set<(image: string, playerId: string) => void>();
  private readonly connection: Connection;
  private intent: Intent | null = null;
  private nextToastId = 1;
  private toastTimers = new Set<number>();

  constructor(connection = new Connection()) {
    this.connection = connection;
    connection.on('status', (status) => {
      this.patch({ status, latencyMs: connection.latencyMs });
    });
    connection.on('ready', () => this.onReady());
    connection.on('message', (message) => this.onMessage(message));
  }

  start(): void {
    this.connection.connect();
  }

  stop(): void {
    for (const timer of this.toastTimers) window.clearTimeout(timer);
    this.toastTimers.clear();
    this.connection.close();
  }

  // -- React bindings -------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StoreSnapshot => this.snapshot;

  /** Live opponent frames, delivered outside React's render cycle. */
  onPeerFrame(listener: (image: string, playerId: string) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  serverNow(): number {
    return this.connection.serverNow();
  }

  // -- Intents --------------------------------------------------------------

  createRoom(name: string): void {
    rememberName(name);
    this.intent = { kind: 'create', name };
    this.patch({ joining: true, joinError: null });
    this.connection.send({ t: 'createRoom', name });
  }

  joinRoom(code: string, name: string): void {
    rememberName(name);
    this.intent = { kind: 'join', code, name };
    this.patch({ joining: true, joinError: null });
    this.connection.send({ t: 'joinRoom', code, name });
  }

  /** Attempts to re-enter a room this browser was already seated in. */
  resumeSession(code: string): boolean {
    const session = readSession();
    if (!session || session.code !== code) return false;
    this.intent = { kind: 'rejoin', code, token: session.token };
    this.patch({ joining: true, joinError: null });
    this.connection.send({ t: 'rejoin', code, token: session.token });
    return true;
  }

  setCameraReady(ready: boolean): void {
    this.connection.send({ t: 'cameraReady', ready });
  }

  setReady(ready: boolean): void {
    this.connection.send({ t: 'ready', ready });
  }

  sendFrame(image: string, seq: number): void {
    this.connection.send({ t: 'frame', image, seq });
  }

  submit(roundId: string, image: string): void {
    this.connection.send({ t: 'submit', roundId, image });
  }

  vote(roundId: string, targetId: string, approve: boolean): void {
    this.connection.send({ t: 'vote', roundId, targetId, approve });
  }

  rematch(): void {
    this.connection.send({ t: 'rematch' });
  }

  leave(): void {
    this.connection.send({ t: 'leave' });
    this.intent = null;
    writeSession(null);
    this.patch({
      screen: 'home',
      match: null,
      you: null,
      roomCode: null,
      evidence: {},
      joining: false,
      fatalError: null,
    });
  }

  dismissFatal(): void {
    this.intent = null;
    writeSession(null);
    this.patch({ fatalError: null, screen: 'home', match: null, you: null, roomCode: null });
  }

  clearJoinError(): void {
    if (this.snapshot.joinError) this.patch({ joinError: null });
  }

  // -- Wire handling --------------------------------------------------------

  private onReady(): void {
    this.connection.send({ t: 'hello', protocol: PROTOCOL_VERSION });
    const intent = this.intent;
    if (!intent) return;
    // Replay whatever we were doing so a dropped socket is invisible to the player.
    if (intent.kind === 'create') this.connection.send({ t: 'createRoom', name: intent.name });
    else if (intent.kind === 'join')
      this.connection.send({ t: 'joinRoom', code: intent.code, name: intent.name });
    else this.connection.send({ t: 'rejoin', code: intent.code, token: intent.token });
  }

  private onMessage(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        return;
      case 'joined': {
        const name = this.intent && 'name' in this.intent ? this.intent.name : rememberedName();
        writeSession({ code: message.roomCode, token: message.token, name });
        // From here on, any reconnect re-enters the same seat.
        this.intent = { kind: 'rejoin', code: message.roomCode, token: message.token };
        this.patch({
          screen: 'room',
          joining: false,
          joinError: null,
          you: message.playerId,
          roomCode: message.roomCode,
          fatalError: null,
        });
        return;
      }
      case 'state':
        this.patch({
          match: message.state,
          latencyMs: this.connection.latencyMs,
          // A match state always implies we are seated.
          screen: 'room',
          joining: false,
        });
        return;
      case 'evidence':
        this.patch({
          evidence: {
            ...this.snapshot.evidence,
            [`${message.roundId}:${message.playerId}`]: message.image,
          },
        });
        return;
      case 'peerFrame':
        for (const listener of this.frameListeners) listener(message.image, message.playerId);
        return;
      case 'toast':
        this.pushToast(message.kind, message.message);
        return;
      case 'error':
        this.onError(message);
        return;
      case 'pong':
        return;
    }
  }

  private onError(message: Extract<ServerMessage, { t: 'error' }>): void {
    const joinFailure =
      message.code === 'room-not-found' ||
      message.code === 'room-full' ||
      message.code === 'name-taken';

    if (message.code === 'session-expired') {
      // The seat is gone: forget it so we do not retry in a loop.
      writeSession(null);
      this.intent = null;
      this.patch({
        joining: false,
        screen: 'home',
        match: null,
        you: null,
        roomCode: null,
        joinError: message.message,
      });
      return;
    }

    if (joinFailure) {
      this.intent = null;
      this.patch({ joining: false, joinError: message.message });
      return;
    }

    if (message.fatal) {
      this.intent = null;
      this.patch({ fatalError: message.message, joining: false });
      return;
    }

    this.pushToast('error', message.message);
  }

  private pushToast(kind: Toast['kind'], message: string): void {
    const id = this.nextToastId++;
    this.patch({ toasts: [...this.snapshot.toasts.slice(-2), { id, kind, message }] });
    const timer = window.setTimeout(() => {
      this.toastTimers.delete(timer);
      this.patch({ toasts: this.snapshot.toasts.filter((t) => t.id !== id) });
    }, TOAST_MS);
    this.toastTimers.add(timer);
  }

  private patch(changes: Partial<StoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    for (const listener of this.listeners) listener();
  }
}
