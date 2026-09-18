import type {
  TelegramAchievementView,
  TelegramAuthResult,
  TelegramChallengeView,
  TelegramHome,
  TelegramLeaderboardView,
  TelegramMatchRow,
  TelegramMe,
  TelegramNotificationPrefs,
  TelegramPlayerCard,
  TelegramPremiumOffer,
  TelegramQuestBoard,
  TelegramResultCard,
  TelegramSocialView,
} from '@battle/shared';

/**
 * The Mini App's side of the API.
 *
 * The session is a **bearer token held in memory**, not a cookie. Inside
 * Telegram Desktop and Telegram Web the Mini App is an iframe on somebody
 * else's origin, where a `SameSite=Strict` cookie is never sent — so a
 * cookie-based session works on a phone, fails on a laptop, and fails in the
 * way that takes a day to find. The token is minted fresh from `initData` on
 * every launch, so nothing depends on storage surviving either.
 */

let token: string | null = null;

export function setSessionToken(value: string | null): void {
  token = value;
}

export function sessionToken(): string | null {
  return token;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** Whether trying the same thing again could plausibly work. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

async function call<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const method = init.method ?? (init.body === undefined ? 'GET' : 'POST');
  let response: Response;
  try {
    response = await fetch(`/api/telegram/${path}`, {
      method,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.body === undefined
          ? {}
          : { 'content-type': 'application/json', 'x-battle-request': '1' }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    // A dropped connection and a timeout are the same thing to a player.
    throw new ApiError(0, 'No connection. Check your signal and try again.');
  }
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!response.ok)
    throw new ApiError(response.status, parsed.error ?? 'Something went wrong. Try again.');
  return parsed;
}

export const api = {
  /** The one call that does not need a session, because it creates one. */
  authenticate: (initData: string) =>
    call<TelegramAuthResult>('auth', { body: { initData } }),

  home: () => call<TelegramHome>('home'),
  me: () => call<TelegramMe>('me'),

  leaderboard: (board: 'rating' | 'wins' | 'streak', scope: 'global' | 'friends', offset = 0) =>
    call<TelegramLeaderboardView>(
      `leaderboard?board=${board}&scope=${scope}&offset=${offset}`,
    ),

  matches: (offset = 0) => call<{ matches: TelegramMatchRow[]; offset: number }>(`matches?offset=${offset}`),
  match: (index: number) => call<TelegramMatchRow>(`matches/${index}`),
  shareCard: (index: number) => call<TelegramResultCard>(`share/${index}`),

  achievements: () => call<{ achievements: TelegramAchievementView[] }>('achievements'),

  quests: () => call<TelegramQuestBoard>('quests'),
  claimQuest: (questId: string) =>
    call<{ coins: number; board: TelegramQuestBoard }>('quests/claim', { body: { questId } }),

  social: () => call<TelegramSocialView>('social'),
  friend: (ref: string, action: 'add' | 'remove') =>
    call<TelegramSocialView>('social/friend', { body: { ref, action } }),
  block: (ref: string, action: 'block' | 'unblock') =>
    call<TelegramSocialView>('social/block', { body: { ref, action } }),
  report: (ref: string, reason: string, note?: string) =>
    call<{ filed: boolean; duplicate: boolean }>('social/report', {
      body: { ref, reason, ...(note ? { note } : {}) },
    }),

  player: (ref: string) =>
    call<{ player: TelegramPlayerCard; friend: boolean; blocked: boolean; you: boolean }>(
      `players/${ref}`,
    ),

  createChallenge: () => call<TelegramChallengeView>('challenges', { body: {} }),
  challenge: (code: string) => call<TelegramChallengeView>(`challenges/${code}`),
  acceptChallenge: (code: string) =>
    call<TelegramChallengeView>(`challenges/${code}/accept`, { body: {} }),
  declineChallenge: (code: string) =>
    call<{ declined: boolean }>(`challenges/${code}/decline`, { body: {} }),
  cancelChallenge: (code: string) =>
    call<{ cancelled: boolean }>(`challenges/${code}/cancel`, { body: {} }),
  challengeRoom: (code: string) =>
    call<{ roomCode: string }>(`challenges/${code}/room`, { body: {} }),

  premium: () =>
    call<TelegramPremiumOffer & { premium: TelegramMe['premium'] }>('premium'),
  premiumInvoice: () => call<{ link: string }>('premium/invoice', { body: {} }),

  saveProfile: (changes: { name?: string; avatar?: { shape: number; color: number } }) =>
    call<TelegramMe>('profile', { body: changes }),
  saveNotifications: (prefs: TelegramNotificationPrefs) =>
    call<{ notifications: TelegramNotificationPrefs }>('notifications', { body: prefs }),
  unlink: () => call<{ unlinked: boolean }>('unlink', { body: {} }),
};
