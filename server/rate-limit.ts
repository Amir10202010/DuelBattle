import { GameError } from './errors';
export class RateLimiter {
  private entries = new Map<string, { count: number; until: number }>();
  take(key: string, max: number, windowMs: number, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry || now >= entry.until) {
      if (this.entries.size > 20_000) this.cleanup(now);
      if (this.entries.size > 20_000)
        throw new GameError('BUSY', 'The arena is busy. Try again shortly.');
      this.entries.set(key, { count: 1, until: now + windowMs });
    } else {
      if (++entry.count > max)
        throw new GameError('RATE_LIMIT', 'A little too fast. Try again in a moment.');
    }
  }
  cleanup(now = Date.now()) {
    for (const [key, value] of this.entries) if (value.until <= now) this.entries.delete(key);
  }
}
