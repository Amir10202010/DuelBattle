/** Only operator-supplied keys. Each exhausted key cools down; no retry loops or key logging. */
export class GeminiKeyPool {
  private cursor = 0;
  private keys: { value: string; availableAt: number }[];
  constructor(
    keys: string | string[],
    private now = Date.now,
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
  take(excluded: Set<string>): string | null {
    for (let i = 0; i < this.keys.length; i++) {
      const index = (this.cursor + i) % this.keys.length;
      const key = this.keys[index];
      if (!excluded.has(key.value) && key.availableAt <= this.now()) {
        this.cursor = (index + 1) % this.keys.length;
        return key.value;
      }
    }
    return null;
  }
  cooldown(value: string, ms: number) {
    const key = this.keys.find((k) => k.value === value);
    if (key) key.availableAt = this.now() + ms;
  }
  disable(value: string) {
    const key = this.keys.find((k) => k.value === value);
    if (key) key.availableAt = Infinity;
  }
}

/** Respect provider Retry-After / RetryInfo, and distinguish a daily quota from a brief throttle. */
export async function quotaCooldown(response: Response): Promise<number> {
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
      if (detail.violations?.some((v) => /perday|daily/i.test(v.quotaId ?? '')))
        ms = Math.max(ms, 86_400_000);
      if (detail.retryDelay && /^\d+(\.\d+)?s$/.test(detail.retryDelay))
        ms = Math.max(ms, Number.parseFloat(detail.retryDelay) * 1000);
    }
  } catch {
    /* No upstream content is logged or exposed. */
  }
  return Math.min(ms, 86_400_000);
}
