import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { isSpectacular, totals, type Granted, type MetaActionResult, type MetaView } from '@battle/shared';
import { sound } from '../media/sound.js';
import { track } from '../analytics.js';
import { useEconomy } from './useEconomy.js';

/** Something just landed and deserves its moment on screen. */
export interface Reveal {
  id: number;
  title: string;
  granted: Granted[];
}

interface MetaState {
  view: MetaView | null;
  loading: boolean;
  error: string;
  /** Which action is in flight, so exactly that button can show it. */
  busy: string | null;
  refresh: () => void;
  claimQuest: (questId: string) => Promise<boolean>;
  claimTier: (tier: number, track: 'free' | 'premium') => Promise<boolean>;
  claimAll: () => Promise<boolean>;
  claimDaily: () => Promise<boolean>;
  buy: (offerId: string) => Promise<boolean>;
  buyDeal: (itemId: string) => Promise<boolean>;
  checkout: (offerId: string) => Promise<boolean>;
  /**
   * How real money is taken here, if at all: a card on the web, Stars inside
   * Telegram (where digital goods must be sold in Stars), or not at all.
   */
  rail: 'card' | 'stars' | null;
  reveal: Reveal | null;
  dismissReveal: () => void;
}

const Context = createContext<MetaState | null>(null);

async function request<T>(path: string, body?: unknown, authToken?: string | null): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15_000),
    headers: {
      ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
      ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-battle-request': '1' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'That did not go through. Try again.');
  return result;
}

const REVEAL_TITLES: Record<string, string> = {
  quest: 'Quest complete',
  tier: 'Season reward',
  all: 'Season rewards',
  daily: 'Daily reward',
  buy: 'Yours now',
  deal: 'Yours now',
  order: 'Thank you!',
};

/**
 * The lobby's state: quests, the season, the calendar and the shop.
 *
 * One fetch fills everything, and every action answers with the whole view
 * again, so nothing on screen can disagree with anything else after a claim.
 * What an action paid is queued as a reveal — a chest, an item or a real
 * haul gets the full moment; a few coins get a counter tick and a sound.
 */
export function MetaProvider({
  accountKey,
  revision,
  authToken,
  payWithStars,
  children,
}: {
  accountKey: string | null;
  /** Changes whenever something outside the lobby may have moved it, like a finished match. */
  revision: string;
  authToken?: string | null;
  /**
   * Opens a Stars invoice for an offer and says how it ended. Supplied only by
   * the Telegram shell; its presence is what switches the rail to Stars.
   */
  payWithStars?: (offerId: string) => Promise<{ status: 'paid' | 'cancelled' | 'failed'; orderId?: string }>;
  children: ReactNode;
}) {
  const economy = useEconomy();
  const [view, setView] = useState<MetaView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const revealId = useRef(0);
  // Object identity also rejects responses from an earlier login to the same account.
  const scope = useRef({ accountKey, authToken });
  if (scope.current.accountKey !== accountKey || scope.current.authToken !== authToken)
    scope.current = { accountKey, authToken };
  const generation = useRef(0);
  const pending = useRef<object | null>(null);
  const refreshAfterAction = useRef(false);
  const economyRefresh = economy.refresh;

  useEffect(() => {
    pending.current = null;
    refreshAfterAction.current = false;
    ++generation.current;
    setView(null);
    setReveals([]);
    setError('');
    setLoadError('');
    setBusy(null);
    setLoading(false);
    return () => {
      scope.current = { ...scope.current };
      ++generation.current;
    };
  }, [accountKey, authToken]);

  const refresh = useCallback(() => {
    if (!accountKey) return;
    if (pending.current) { refreshAfterAction.current = true; return; }
    const owner = scope.current;
    const sequence = ++generation.current;
    setLoading(true);
    request<MetaView>('/api/meta', undefined, authToken)
      .then((next) => {
        if (sequence === generation.current && scope.current === owner) {
          setView(next);
          setLoadError('');
        }
      })
      .catch((failure: unknown) => {
        if (sequence === generation.current && scope.current === owner) setLoadError(failure instanceof Error ? failure.message : 'Could not load.');
      })
      .finally(() => {
        if (sequence === generation.current) setLoading(false);
      });
  }, [accountKey, authToken]);

  useEffect(refresh, [refresh, revision]);
  // The coin shop and locker use the existing economy API. Keep both wallets,
  // ownership and the equip quest in sync after those actions too.
  const economyState = economy.data ? JSON.stringify(economy.data) : '';
  useEffect(() => { if (economyState) refresh(); }, [economyState, refresh]);
  useEffect(() => {
    if (!view) return;
    const reset = Math.min(view.calendar.resetsAt, view.quests.dailyResetsAt, view.quests.weeklyResetsAt, view.season.endsAt);
    const timer = window.setTimeout(refresh, Math.max(1000, reset - view.serverTime + 100));
    return () => window.clearTimeout(timer);
  }, [view, refresh]);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refresh]);

  const land = useCallback(
    (kind: string, granted: Granted[]) => {
      if (!granted.length) return;
      const sum = totals(granted);
      if (isSpectacular(granted)) setReveals((queue) => [...queue, { id: ++revealId.current, title: REVEAL_TITLES[kind] ?? 'Reward', granted }]);
      else sound.play(sum.gems ? 'gem' : 'coin');
    },
    [],
  );

  const act = useCallback(
    async (kind: string, path: string, body: unknown = {}): Promise<boolean> => {
      if (!accountKey || pending.current) return false;
      const owner = scope.current;
      const operation = {};
      pending.current = operation;
      ++generation.current;
      setLoading(false);
      setBusy(`${kind}:${JSON.stringify(body)}`);
      setError('');
      try {
        const result = await request<MetaActionResult>(path, body, authToken);
        if (scope.current !== owner) return false;
        setView(result.view);
        land(kind, result.granted);
        economyRefresh();
        return true;
      } catch (failure) {
        if (scope.current === owner) {
          setError(failure instanceof Error ? failure.message : 'That did not go through.');
          sound.play('error');
        }
        return false;
      } finally {
        if (pending.current === operation && scope.current === owner) {
          pending.current = null;
          setBusy(null);
          if (refreshAfterAction.current) { refreshAfterAction.current = false; refresh(); }
        }
      }
    },
    [accountKey, authToken, land, economyRefresh, refresh],
  );

  /**
   * After a Stars payment the bot delivers the order, not this page, so the
   * page waits for this invoice's order, never another purchase of the same pack.
   */
  const awaitStarsDelivery = useCallback(
    async (orderId: string, owner: object) => {
      for (let attempt = 0; attempt < 20; attempt++) {
        if (scope.current !== owner) return;
        try {
          const order = await request<{ status: string; granted: Granted[] }>(`/api/meta/orders/${orderId}`, undefined, authToken);
          if (scope.current !== owner) return;
          if (order.status === 'paid') {
            land('order', order.granted);
            economyRefresh();
            refresh();
            return;
          }
          if (order.status === 'failed' || order.status === 'refunded') {
            setError('This payment was cancelled or refunded.');
            return;
          }
        } catch {
          // A transient connection failure may recover before the next poll.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (scope.current !== owner) return;
      setError('Payment confirmation is taking longer than expected. Your rewards will arrive after confirmation.');
      refresh();
    },
    [authToken, land, refresh, economyRefresh],
  );

  const checkout = useCallback(
    async (offerId: string) => {
      if (!accountKey || pending.current) return false;
      const owner = scope.current;
      const operation = {};
      pending.current = operation;
      setBusy(`checkout:${offerId}`);
      setError('');
      if (payWithStars) {
        try {
          const outcome = await payWithStars(offerId);
          if (scope.current !== owner) return false;
          if (outcome.status === 'paid' && outcome.orderId) await awaitStarsDelivery(outcome.orderId, owner);
          else if (outcome.status === 'failed') setError('The payment could not be confirmed. Check your payment history before trying again.');
          return outcome.status === 'paid';
        } catch (failure) {
          if (scope.current === owner) setError(failure instanceof Error ? failure.message : 'Checkout could not open.');
          return false;
        } finally {
          if (pending.current === operation && scope.current === owner) {
            pending.current = null;
            setBusy(null);
            refresh();
          }
        }
      }
      try {
        const { url } = await request<{ url: string; orderId: string }>('/api/meta/checkout', { offerId }, authToken);
        if (scope.current !== owner) return false;
        window.location.assign(url);
        return true;
      } catch (failure) {
        if (pending.current === operation && scope.current === owner) {
          setError(failure instanceof Error ? failure.message : 'Checkout could not open.');
          pending.current = null;
          setBusy(null);
        }
        return false;
      }
    },
    [accountKey, authToken, payWithStars, awaitStarsDelivery, refresh],
  );

  // Back from a card payment: the webhook, not the redirect, delivers the order,
  // so the page waits for the server to say it is paid.
  useEffect(() => {
    if (!accountKey) return;
    const params = new URLSearchParams(window.location.search);
    const order = params.get('order');
    if (!order || !/^[a-f0-9]{24}$/.test(order)) return;
    track('checkout_returned', { status: 'returned' });
    let stopped = false;
    const owner = scope.current;
    let timer: number | undefined;
    let attempts = 0;
    const poll = async () => {
      if (stopped) return;
      try {
        const status = await request<{ status: string; granted: Granted[] }>(`/api/meta/orders/${order}`, undefined, authToken);
        if (stopped || scope.current !== owner) return;
        if (status.status === 'paid') {
          history.replaceState(null, '', window.location.pathname);
          land('order', status.granted);
          economyRefresh();
          refresh();
          return;
        }
        if (status.status === 'failed' || status.status === 'refunded') {
          setError('This payment was cancelled or refunded.');
          return;
        }
      } catch {
        /* keep waiting; the webhook may simply be a few seconds behind */
      }
      if (stopped || scope.current !== owner) return;
      if (++attempts < 20) timer = window.setTimeout(() => void poll(), 1500);
      else setError('Payment confirmation is taking longer than expected. Your rewards will arrive after confirmation.');
    };
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [accountKey, authToken, land, refresh, economyRefresh]);

  const value: MetaState = {
    view,
    loading,
    error: error || loadError,
    busy,
    refresh: () => { setError(''); refresh(); },
    claimQuest: (questId) => act('quest', '/api/meta/quests/claim', { questId }),
    claimTier: (tier, trackName) => act('tier', '/api/meta/season/claim', { tier, track: trackName }),
    claimAll: () => act('all', '/api/meta/season/claim', { all: true }),
    claimDaily: () => act('daily', '/api/meta/daily', {}),
    buy: (offerId) => act('buy', '/api/meta/buy', { offerId }),
    buyDeal: (itemId) => act('deal', '/api/meta/deal', { itemId }),
    checkout,
    rail: payWithStars ? (view?.store.payments.stars ? 'stars' : null) : view?.store.payments.card ? 'card' : null,
    reveal: reveals[0] ?? null,
    dismissReveal: () => setReveals((queue) => queue.slice(1)),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMeta(): MetaState {
  const context = useContext(Context);
  if (!context) throw new Error('MetaProvider is required');
  return context;
}

/** For components that may render outside the lobby, such as the Telegram shell. */
export function useOptionalMeta(): MetaState | null {
  return useContext(Context);
}
