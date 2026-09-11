/**
 * A rotation of operator-supplied API keys.
 *
 * Nothing here is clever: a key that hits its quota is put to one side until it
 * is worth trying again, a key the provider rejects outright is not tried
 * again at all, and a round-robin cursor keeps one key from carrying the whole
 * room. Keys are never logged, and no failure path retries in a loop.
 */
export class GeminiKeyPool {
  private cursor = 0;
  private readonly keys: { value: string; availableAt: number }[];

  constructor(
    keys: string | string[],
    private readonly now = Date.now,
  ) {
    const values = [
      ...new Set(
        (Array.isArray(keys) ? keys : keys.split(',')).map((k) => k.trim()).filter(Boolean),
      ),
    ];
    if (!values.length) throw new Error('Set GEMINI_API_KEYS or GEMINI_API_KEY to enable AI.');
    if (values.length > 32) throw new Error('At most 32 Gemini API keys may be configured.');
    this.keys = values.map((value) => ({ value, availableAt: 0 }));
  }

  /** The next key worth trying, skipping any already tried for this request. */
  take(excluded: ReadonlySet<string>): string | null {
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.cursor + i) % this.keys.length;
      const key = this.keys[index]!;
      if (!excluded.has(key.value) && key.availableAt <= this.now()) {
        this.cursor = (index + 1) % this.keys.length;
        return key.value;
      }
    }
    return null;
  }

  cooldown(value: string, ms: number): void {
    const key = this.keys.find((k) => k.value === value);
    if (key) key.availableAt = this.now() + ms;
  }

  disable(value: string): void {
    const key = this.keys.find((k) => k.value === value);
    if (key) key.availableAt = Number.POSITIVE_INFINITY;
  }
}

/**
 * How long to rest a key that came back 429.
 *
 * Honours `Retry-After` and Google's `RetryInfo`, and tells a daily quota apart
 * from a momentary throttle — resting a key for a minute when it is actually
 * out for the day just burns the next request on it too.
 */
export async function quotaCooldown(response: Response): Promise<number> {
  const DAY_MS = 86_400_000;
  let ms = 60_000;

  const header = response.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (Number.isFinite(duration)) ms = Math.max(ms, duration);
  }

  try {
    const body = (await response.json()) as {
      error?: { details?: { retryDelay?: string; violations?: { quotaId?: string }[] }[] };
    };
    for (const detail of body.error?.details ?? []) {
      if (detail.violations?.some((v) => /perday|daily/i.test(v.quotaId ?? ''))) {
        ms = Math.max(ms, DAY_MS);
      }
      if (detail.retryDelay && /^\d+(\.\d+)?s$/.test(detail.retryDelay)) {
        ms = Math.max(ms, Number.parseFloat(detail.retryDelay) * 1000);
      }
    }
  } catch {
    // The upstream body is never logged or forwarded: it can carry both the
    // operator's key material and a player's photograph.
  }

  return Math.min(ms, DAY_MS);
}
