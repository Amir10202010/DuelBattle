import type { Attempt } from './protocol';

/** Earlier unresolved evidence blocks later accepted evidence in server receipt order. */
export function firstConfirmed(attempts: readonly Attempt[], now: number): Attempt | null {
  for (const attempt of attempts) {
    if (attempt.status === 'accepted') return attempt;
    if (['checking', 'pending'].includes(attempt.status) && now < attempt.expiresAt) return null;
  }
  return null;
}
