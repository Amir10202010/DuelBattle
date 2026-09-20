import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EconomyView } from '@battle/shared';
import { sound } from '../media/sound.js';

type Action = 'buy' | 'equip' | 'unequip' | 'daily';
type Feedback = { id: number; kind: Action; amount: number; itemId?: string };
interface EconomyState {
  data: EconomyView | null;
  loading: boolean;
  busy: boolean;
  error: string;
  feedback: Feedback | null;
  refresh: () => void;
  act: (action: Action, itemId?: string) => Promise<boolean>;
}
const Context = createContext<EconomyState | null>(null);
export function EconomyProvider({
  accountKey,
  revision,
  authToken,
  children,
}: {
  accountKey: string | null;
  revision: string;
  /** Telegram's embedded browser authenticates with a bearer session. */
  authToken?: string | null;
  children: ReactNode;
}) {
  const [data, setData] = useState<EconomyView | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const current = useRef(data);
  current.current = data;
  const generation = useRef(0);
  const pending = useRef(false);
  const account = useRef(accountKey);
  account.current = accountKey;
  const request = useCallback(
    async (action?: Action, itemId?: string) => {
      if (!accountKey || (action && pending.current)) return false;
      const sequence = ++generation.current;
      if (action) {
        pending.current = true;
        setBusy(true);
      } else setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/economy${action ? `/${action}` : ''}`, {
          credentials: 'same-origin',
          signal: AbortSignal.timeout(12000),
          headers: { ...(authToken ? { authorization: `Bearer ${authToken}` } : {}), ...(action ? { 'content-type': 'application/json', 'x-battle-request': '1' } : {}) },
          ...(action
            ? {
                method: 'POST',
                body: JSON.stringify(
                  itemId ? (action === 'unequip' ? { slot: itemId } : { itemId }) : {},
                ),
              }
            : {}),
        });
        const result = (await response.json()) as EconomyView & { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Could not load your items. Try again.');
        if (account.current !== accountKey) return false;
        if (sequence === generation.current || action) {
          const amount = result.coins - (current.current?.coins ?? result.coins);
          setData(result);
          if ((action && (action !== 'daily' || amount > 0)) || amount > 0) {
            setFeedback({
              id: Date.now(),
              kind: action ?? 'daily',
              amount,
              ...(itemId ? { itemId } : {}),
            });
            sound.play(
              action === 'buy'
                ? 'purchase'
                : action === 'equip' || action === 'unequip'
                  ? 'equip'
                  : 'reward',
            );
          }
        }
        return true;
      } catch (err) {
        if (sequence === generation.current)
          setError(err instanceof Error ? err.message : 'Could not load your items. Try again.');
        return false;
      } finally {
        if (action && account.current === accountKey) {
          pending.current = false;
          setBusy(false);
        }
        if (sequence === generation.current) setLoading(false);
      }
    },
    [accountKey, authToken],
  );
  const refresh = useCallback(() => {
    if (!pending.current) void request();
  }, [request]);
  useEffect(() => {
    ++generation.current;
    current.current = null;
    pending.current = false;
    setData(null);
    setFeedback(null);
    setError('');
    setBusy(false);
    setLoading(false);
  }, [accountKey]);
  useEffect(refresh, [refresh, revision]);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [refresh]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 2400);
    return () => clearTimeout(timeout);
  }, [feedback]);
  return (
    <Context.Provider value={{ data, loading, busy, error, feedback, refresh, act: request }}>
      {children}
    </Context.Provider>
  );
}
export function useEconomy() {
  const context = useContext(Context);
  if (!context) throw new Error('EconomyProvider is required');
  return context;
}
