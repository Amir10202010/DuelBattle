import { useCallback, useEffect, useState } from 'react';
import { extractRoomCode } from '@battle/shared';

/**
 * The pages outside a match.
 *
 * A room is not one of them: `/r/CODE` is a *seat*, and everything about it —
 * the camera, the socket, the fullscreen layout — is different enough that it
 * gets its own branch rather than a slot in this list.
 */
export const PAGES = [
  'home',
  'dashboard',
  'login',
  'register',
  'onboarding',
  'recover',
  'play',
  'leaderboard',
  'profile',
  'ranks',
  'awards',
  'settings',
  'store',
  'pass',
  'admin',
] as const;

export type Page = (typeof PAGES)[number];

const PATHS: Record<Page, string> = {
  home: '/',
  dashboard: '/home',
  login: '/login',
  register: '/register',
  onboarding: '/onboarding',
  recover: '/recover',
  play: '/play',
  leaderboard: '/leaderboard',
  profile: '/profile',
  ranks: '/ranks',
  awards: '/awards',
  settings: '/settings',
  store: '/store',
  pass: '/pass',
  admin: '/admin',
};

export function pagePath(page: Page): string {
  return PATHS[page];
}

export interface Route {
  /** Room code from the URL, if this is a shareable room link. */
  code: string | null;
  /** Which page the address bar is on. `home` is also the fallback. */
  page: Page;
}

function parse(pathname: string): Route {
  const room = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (room) {
    let segment: string;
    try {
      segment = decodeURIComponent(room[1] ?? '');
    } catch {
      return { code: null, page: 'home' };
    }
    return { code: extractRoomCode(segment), page: 'home' };
  }

  const trimmed = pathname.replace(/\/+$/, '') || '/';
  const found = PAGES.find((page) => PATHS[page] === trimmed);
  return { code: null, page: found ?? 'home' };
}

/**
 * Eight routes still do not justify a router.
 *
 * What a router would add here is nested layouts, loaders and a matching
 * algorithm, none of which this has any use for: every page is a component,
 * the data all arrives over one socket, and the only dynamic segment in the
 * whole app is a five-character room code. What it costs is a dependency in the
 * bundle of a game that is trying to load before somebody's friend gets bored.
 */
export function useRoute(): Route & { go: (path: string) => void } {
  const [route, setRoute] = useState<Route>(() => parse(location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parse(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((path: string) => {
    if (path === location.pathname) return;
    history.pushState(null, '', path);
    setRoute(parse(path));
    // A new page starts at the top. Browsers restore a scroll position on
    // popstate, which is right, but a pushed navigation is a new document as
    // far as the reader is concerned.
    window.scrollTo(0, 0);
    document.querySelector('.shell')?.scrollTo(0, 0);
  }, []);

  return { ...route, go };
}

export function roomPath(code: string): string {
  return `/r/${code}`;
}

export function roomUrl(code: string): string {
  return `${location.origin}${roomPath(code)}`;
}
