import {
  PROTOCOL_VERSION,
  type PublicMatchState,
  type ServerMessage,
} from '@battle/shared';
import { Connection, type ConnectionStatus, type GameConnection } from './connection.js';

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
  token: string;
  name: string;
  at: number;
}

const SESSION_KEY = 'battle.sessions.v2';
const NAME_KEY = 'battle.name.v1';
const TOAST_MS = 4_000;
/**
 * Snapshots the client keeps, for the end-of-match recap.
 *
 * Two per round and nine rounds to a match, with room for a rematch or two
 * before the oldest start falling off. The server keeps only the round being
 * judged; this copy is what makes the recap possible at all.
 */
const MAX_EVIDENCE_KEPT = 40;
/** Enough to walk back into a room you were in a moment ago, not a history. */
const MAX_REMEMBERED_ROOMS = 4;

/**
 * A seat belongs to a tab, so the token that proves it lives in sessionStorage:
 * two tabs on one machine are two players, and one must never inherit the
 * other's seat by opening the same link.
 *
 * A copy also goes to localStorage, but only as an offer. If you close the tab
 * by accident the seat is still held server-side, and the room link can hand it
 * back — but that has to be a deliberate "continue as Ada", never an automatic
 * takeover of a seat this tab never held.
 */
function readSessions(store: Storage): Record<string, StoredSession> {
  try {
    const raw = store.getItem(SESSION_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, StoredSession>;
  } catch {
    return {};
  }
}

function storage(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? sessionStorage : localStorage;
  } catch {
    // Some privacy modes throw on access, not just on write.
    return null;
  }
}

function storages(): Storage[] {
  return [storage('session'), storage('local')].filter((s): s is Storage => s !== null);
}

function sessionFrom(kind: 'session' | 'local', code: string): StoredSession | null {
  const store = storage(kind);
  if (!store) return null;
  const found = readSessions(store)[code];
  return found && typeof found.token === 'string' ? found : null;
}

/**
 * A seat this browser held but this tab does not, i.e. the tab was closed and
 * the room link reopened. Offered to the player rather than used silently.
 */
export function recoverableSession(code: string): { name: string } | null {
  if (sessionFrom('session', code)) return null;
  const stored = sessionFrom('local', code);
  return stored ? { name: stored.name } : null;
}

function writeSession(code: string, session: StoredSession | null): void {
  for (const store of storages()) {
    try {
      const all = readSessions(store);
      if (session) all[code] = session;
      else delete all[code];

      const trimmed = Object.entries(all)
        .sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0))
        .slice(0, MAX_REMEMBERED_ROOMS);
      store.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(trimmed)));
    } catch {
      // Private browsing throws on write; sessions are a convenience only.
    }
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
  private readonly connection: GameConnection;
  private intent: Intent | null = null;
  private nextToastId = 1;
  private toastTimers = new Set<number>();

  constructor(connection: GameConnection = new Connection()) {
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

  /** Re-enters a room this tab was already seated in. Never another tab's. */
  resumeSession(code: string): boolean {
    return this.rejoinWith(sessionFrom('session', code), code);
  }

  /** Takes back a seat held by a tab that was closed. Always player-initiated. */
  recoverSession(code: string): boolean {
    return this.rejoinWith(sessionFrom('local', code), code);
  }

  private rejoinWith(session: StoredSession | null, code: string): boolean {
    if (!session) return false;
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

  addChallenge(prompt: string): void {
    this.connection.send({ t: 'addChallenge', prompt });
  }

  removeChallenge(id: string): void {
    this.connection.send({ t: 'removeChallenge', id });
  }

  leave(): void {
    this.connection.send({ t: 'leave' });
    const code = this.snapshot.roomCode;
    this.intent = null;
    if (code) writeSession(code, null);
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
    const code = this.snapshot.roomCode;
    this.intent = null;
    if (code) writeSession(code, null);
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
        writeSession(message.roomCode, { token: message.token, name, at: Date.now() });
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
      case 'evidence': {
        const evidence = {
          ...this.snapshot.evidence,
          [`${message.roundId}:${message.playerId}`]: message.image,
        };
        const keys = Object.keys(evidence);
        // Insertion order is round order, so the oldest go first.
        for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_EVIDENCE_KEPT))) {
          delete evidence[stale];
        }
        this.patch({ evidence });
        return;
      }
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
      const code =
        this.intent && 'code' in this.intent ? this.intent.code : this.snapshot.roomCode;
      if (code) writeSession(code, null);
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
      // Being refused while we believe we are seated means the seat is gone —
      // the usual cause is the room outliving neither a restart nor a deploy.
      // Leaving the stale lobby on screen would strand the player in a room
      // that no longer exists.
      const wasSeated = this.snapshot.screen === 'room';
      if (wasSeated && this.snapshot.roomCode) writeSession(this.snapshot.roomCode, null);
      this.patch({
        joining: false,
        joinError: message.message,
        ...(wasSeated
          ? { screen: 'home' as const, match: null, you: null, roomCode: null, evidence: {} }
          : {}),
      });
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
