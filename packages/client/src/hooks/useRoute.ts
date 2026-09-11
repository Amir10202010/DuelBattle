import { useCallback, useEffect, useState } from 'react';
import { isValidRoomCode, normalizeRoomCode } from '@battle/shared';

export interface Route {
  /** Room code from the URL, if this is a shareable room link. */
  code: string | null;
  path: string;
}

function parse(pathname: string): Route {
  const match = /^\/r\/([^/]+)\/?$/.exec(pathname);
  if (!match) return { code: null, path: pathname };
  const code = normalizeRoomCode(decodeURIComponent(match[1] ?? ''));
  return { code: isValidRoomCode(code) ? code : null, path: pathname };
}

/**
 * Two routes do not justify a router. This keeps `/r/CODE` shareable and the
 * back button working, and nothing else.
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
  }, []);

  return { ...route, go };
}

export function roomPath(code: string): string {
  return `/r/${code}`;
}

export function roomUrl(code: string): string {
  return `${location.origin}${roomPath(code)}`;
}
