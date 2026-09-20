/**
 * Where the Mini App is.
 *
 * Five tabs are roots; everything else is pushed on top of one and comes off
 * again with Telegram's own back button. That shape is the whole navigation
 * model, and it is deliberately not a URL router: a Mini App has no address bar
 * to read, and the thing that has to be right is which way "back" goes.
 *
 * The path is still kept in sync with `history`, for two reasons that matter —
 * a reload inside Telegram Desktop lands on the same screen, and the bot's
 * `web_app` buttons can deep-link straight to `/tg/duel`.
 */

export const TABS = ['home', 'duel', 'rank', 'social', 'profile'] as const;
export type Tab = (typeof TABS)[number];

export type View =
  | { k: Tab }
  | { k: 'quests' }
  | { k: 'store' }
  | { k: 'ranks' }
  | { k: 'awards' }
  | { k: 'matches' }
  | { k: 'match'; index: number }
  | { k: 'player'; ref: string }
  | { k: 'challenge'; code: string }
  | { k: 'premium' }
  | { k: 'settings' };

export function isTab(view: View): view is { k: Tab } {
  return (TABS as readonly string[]).includes(view.k);
}

/** The path a view lives at, so a reload comes back to it. */
export function pathOf(view: View): string {
  switch (view.k) {
    case 'home':
      return '/tg';
    case 'match':
      return `/tg/matches/${view.index}`;
    case 'player':
      return `/tg/players/${view.ref}`;
    case 'challenge':
      return `/tg/duel/${view.code}`;
    default:
      return `/tg/${view.k}`;
  }
}

/**
 * The view a path names.
 *
 * Unknown paths fall back to the home tab rather than erroring: a Mini App
 * opened at a stale link should show the game, not a 404.
 */
export function viewFrom(pathname: string): View {
  const rest = pathname.replace(/^\/tg\/?/, '').replace(/\/+$/, '');
  if (!rest) return { k: 'home' };

  const match = /^matches\/(\d{1,3})$/.exec(rest);
  if (match) return { k: 'match', index: Number(match[1]) };

  const player = /^players\/(u[A-Za-z0-9_-]{12})$/.exec(rest);
  if (player) return { k: 'player', ref: player[1]! };

  const challenge = /^duel\/([A-Za-z0-9_-]{16,32})$/.exec(rest);
  if (challenge) return { k: 'challenge', code: challenge[1]! };

  const known: View['k'][] = [
    ...TABS,
    'quests',
    'store',
    'ranks',
    'awards',
    'matches',
    'premium',
    'settings',
  ];
  return known.includes(rest as View['k']) ? ({ k: rest } as View) : { k: 'home' };
}

/** Which tab a pushed view belongs under, so the bar keeps its place. */
export function tabFor(view: View): Tab {
  switch (view.k) {
    case 'ranks':
      return 'rank';
    case 'store':
      return 'profile';
    case 'quests':
    case 'challenge':
      return 'duel';
    case 'awards':
    case 'matches':
    case 'match':
    case 'premium':
    case 'settings':
      return 'profile';
    case 'player':
      return 'social';
    default:
      return view.k;
  }
}
