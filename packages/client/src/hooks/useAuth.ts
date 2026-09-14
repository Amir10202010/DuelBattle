import { useCallback, useEffect, useState } from 'react';
import type { PublicProfile } from '@battle/shared';

export interface AuthState {
  account: { username: string; onboarded: boolean } | null;
  profile: PublicProfile | null;
  serverTime?: number;
  recovery?: string;
}

export async function authRequest(action: string, data?: unknown): Promise<AuthState> {
  const response = await fetch(`/api/auth/${action}`, {
    method: data === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15_000),
    ...(data === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json', 'x-battle-request': '1' },
          body: JSON.stringify(data),
        }),
  });
  const result = (await response.json()) as AuthState & { error?: string };
  if (!response.ok) throw new Error(result.error ?? 'We could not connect. Try again.');
  return result;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({ account: null, profile: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await authRequest('session'));
    } catch {
      setError('We could not restore your session. Check your connection and retry.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { ...state, loading, error, refresh, setState };
}
