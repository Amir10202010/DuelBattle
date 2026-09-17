import { getPreferences } from '../i18n/preferences.js';
import {
  PROTOCOL_VERSION,
  type Avatar,
  type LeaderboardEntry,
  type MatchRewards,
  type PublicMatchState,
  type PublicProfile,
  type RatingDelta,
  type ServerMessage,
} from '@battle/shared';
import { Connection, type ConnectionStatus, type GameConnection } from './connection.js';

export interface Toast {
  id: number;
  kind: 'info' | 'warn' | 'error';
  message: string;
}

export type Screen = 'home' | 'room';

/** Where the search for an opponent has got to. */
export interface QueueState {
  mode?: 'ranked' | 'casual';
  position: number;
  waiting: number;
  since: number;
}

export interface BoardState {
  offset?: number;
  kind: string;
  entries: LeaderboardEntry[];
  total: number;
  you: LeaderboardEntry | null;
}

export interface StoreSnapshot {
  boardError?: string | null;
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
  /** Your own card, known as soon as the server recognises this browser. */
  profile: PublicProfile | null;
  /** Ratings for the people in this room, once the server has said. */
  standings: Record<string, PublicProfile>;
  /** What the match just finished did to those ratings. Null until one does. */
  lastRatings: Record<string, RatingDelta> | null;
  /** XP, levels and badges from the match just finished. Yours only. */
  rewards: MatchRewards | null;
  /** Set while waiting for the server to find an opponent. */
  queue: QueueState | null;
  /** The leaderboard, once it has been asked for. */
  board: BoardState | null;
  /** True between asking for a board and being sent one. */
  boardLoading: boolean;
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
const IDENTITY_KEY = 'battle.identity.v1';
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

/**
 * The signed token that says which player this browser is.
 *
 * localStorage rather than sessionStorage, because the whole point is that it
 * outlives the tab — a rating that resets when you close the window is not a
 * rating. It is only ever a name: the server mints it, and it unlocks nothing
 * but the row it belongs to.
 */
export function storedIdentity(): string | undefined {
  try {
    return localStorage.getItem(IDENTITY_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function rememberIdentity(token: string): void {
  try {
    localStorage.setItem(IDENTITY_KEY, token);
  } catch {
    /* A browser that will not store it just gets a new one next visit. */
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
  profile: null,
  standings: {},
  lastRatings: null,
  rewards: null,
  queue: null,
  board: null,
  boardLoading: false,
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

  setLanguage(language: 'en' | 'ru'): void {
    if (this.snapshot.status === 'open')
      this.connection.send({
        t: 'hello',
        protocol: PROTOCOL_VERSION,
        language,
        ...(storedIdentity() ? { identity: storedIdentity()! } : {}),
      });
  }

  stop(): void {
    for (const timer of this.toastTimers) window.clearTimeout(timer);
    this.toastTimers.clear();
    this.connection.close();
  }

  refreshAccount(profile: PublicProfile | null): void {
    this.intent = null;
    this.connection.close();
    this.patch({ ...EMPTY, profile });
    this.connection.connect();
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

  /**
   * Asks the server to find somebody.
   *
   * Queueing is not an intent that survives a reconnect, deliberately: a socket
   * that dropped has already been taken out of the queue server-side, and
   * replaying the request would silently re-queue somebody who has since walked
   * away from the page. They press the button again, which is one click and no
   * surprises.
   */
  findMatch(name: string, mode?: 'ranked' | 'casual'): void {
    rememberName(name);
    this.patch({
      joinError: null,
      queue: { position: 0, waiting: 0, since: Date.now(), ...(mode ? { mode } : {}) },
    });
    this.connection.send({ t: 'findMatch', name, ...(mode ? { mode } : {}) });
  }

  cancelFind(): void {
    this.patch({ queue: null });
    this.connection.send({ t: 'cancelFind' });
  }

  /** The name and avatar this browser plays under, kept by the server. */
  saveProfile(changes: { name?: string; avatar?: Avatar }): void {
    if (changes.name) rememberName(changes.name);
    this.connection.send({ t: 'setProfile', ...changes });
  }

  requestBoard(kind: string, offset = 0): void {
    this.patch({ boardLoading: true, boardError: null });
    this.connection.send({ t: 'leaderboard', board: kind, offset });
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

  /** Unsent bytes on the socket, so the camera stream can back off when it matters. */
  outboundBacklog(): number {
    return this.connection.bufferedBytes;
  }

  submit(roundId: string, image: string): void {
    this.connection.send({ t: 'submit', roundId, image });
  }

  pass(roundId: string): void {
    this.connection.send({ t: 'pass', roundId });
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

  setWinTarget(winTarget: number): void {
    this.connection.send({ t: 'setWinTarget', winTarget });
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
      rewards: null,
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
    const identity = storedIdentity();
    this.connection.send({
      t: 'hello',
      protocol: PROTOCOL_VERSION,
      ...(getPreferences().locale === 'ru' ? { language: 'ru' as const } : {}),
      ...(identity ? { identity } : {}),
    });
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
      case 'identity':
        rememberIdentity(message.token);
        return;
      case 'profile':
        this.patch({ profile: message.profile });
        return;
      case 'standings':
        this.patch({
          ...(this.snapshot.you && message.players[this.snapshot.you]
            ? { profile: message.players[this.snapshot.you] }
            : {}),
          standings: message.players,
          lastRatings: message.lastMatch,
          rewards: message.rewards ?? null,
        });
        return;
      case 'queued':
        this.patch({
          queue: {
            ...(this.snapshot.queue?.mode ? { mode: this.snapshot.queue.mode } : {}),
            position: message.position,
            waiting: message.waiting,
            since: this.snapshot.queue?.since ?? Date.now(),
          },
        });
        return;
      case 'unqueued':
        this.patch({ queue: null });
        return;
      case 'leaderboard':
        this.patch({
          boardLoading: false,
          board: {
            kind: message.board,
            offset: message.offset ?? 0,
            entries: message.entries,
            total: message.total,
            you: message.you,
          },
        });
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
          // Being seated is how a search ends well.
          queue: null,
        });
        return;
      }
      case 'state':
        if (!this.snapshot.you) return;
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
    if (this.snapshot.boardLoading)
      this.patch({ boardLoading: false, boardError: message.message });
    // A search that was refused is a search that is over. Leaving the spinner
    // up would have somebody waiting for an opponent the server is not looking
    // for.
    if (this.snapshot.queue) this.patch({ queue: null });

    const joinFailure =
      message.code === 'room-not-found' ||
      message.code === 'room-full' ||
      message.code === 'name-taken';

    if (message.code === 'session-expired') {
      // The seat is gone: forget it so we do not retry in a loop.
      const code = this.intent && 'code' in this.intent ? this.intent.code : this.snapshot.roomCode;
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
