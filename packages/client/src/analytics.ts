import type { ClientEvent, EventProps } from '@battle/shared';

/**
 * What the browser tells the server about how the game is being used.
 *
 * Only the names in the shared allow-list, only small token-shaped properties,
 * and only to our own server — there is no third-party script on the page and
 * there never will be. Events are batched and sent every few seconds, and
 * whatever is left goes out with `sendBeacon` when the page is hidden, which is
 * the one moment a browser reliably lets a request finish.
 *
 * The session id is random, lives for one tab session, and exists so the
 * dashboard can tell one long evening from ten short visits. It identifies a
 * visit, never a person.
 */

const ENDPOINT = '/api/analytics';
const FLUSH_MS = 5_000;
const PING_MS = 60_000;
const MAX_QUEUE = 25;

interface Queued {
  name: ClientEvent;
  props: EventProps;
}

const queue: Queued[] = [];
let timer: number | null = null;
let started = false;
let authToken: string | null = null;
let memorySession: string | null = null;

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem('battle.session');
    if (existing && /^[a-z0-9]{8,32}$/.test(existing)) return existing;
    const fresh = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
    sessionStorage.setItem('battle.session', fresh);
    return fresh;
  } catch {
    // Private browsing still gets a distinct session instead of merging every
    // storage-blocked player into one dashboard visit.
    memorySession ??= crypto.randomUUID().replace(/-/g, '');
    return memorySession;
  }
}

function payload(events: Queued[]): string {
  return JSON.stringify({ session: sessionId(), events });
}

function flush(useBeacon = false): void {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!queue.length) return;
  const events = queue.splice(0, MAX_QUEUE);
  const body = payload(events);
  try {
    // sendBeacon cannot carry the Mini App's bearer authentication.
    if (useBeacon && !authToken && navigator.sendBeacon) {
      if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    }
    void fetch(ENDPOINT, { method: 'POST', body, credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'text/plain', ...(authToken ? { authorization: `Bearer ${authToken}` } : {}) } }).catch(() => undefined);
  } catch {
    /* A lost analytics batch is a slightly wrong chart, never an error. */
  }
}

/** Records one event. Safe to call anywhere, including before the app has started. */
export function track(name: ClientEvent, props: EventProps = {}): void {
  if (typeof window === 'undefined') return;
  queue.push({ name, props });
  if (queue.length >= MAX_QUEUE) flush();
  else if (timer === null) timer = window.setTimeout(() => flush(), FLUSH_MS);
}

/** Starts the session clock. Called once, by the app root. */
export function startAnalytics(token: string | null = null): () => void {
  if (started || typeof window === 'undefined') return () => {};
  started = true;
  authToken = token;
  let firstVisit = false;
  try {
    firstVisit = !localStorage.getItem('battle.seen');
    localStorage.setItem('battle.seen', '1');
  } catch {
    /* Private mode: every visit is a first one, which is honest enough. */
  }
  track('session_start', { first: firstVisit, touch: window.matchMedia?.('(pointer: coarse)').matches ?? false, width: window.innerWidth });
  const ping = window.setInterval(() => {
    if (!document.hidden) track('session_ping');
  }, PING_MS);
  const hidden = () => {
    if (document.hidden) flush(true);
  };
  const pagehide = () => flush(true);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', pagehide);
  return () => {
    window.clearInterval(ping);
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', pagehide);
    flush(true);
    started = false;
    authToken = null;
  };
}
