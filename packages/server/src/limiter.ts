export interface LimiterOptions {
  /** How many are allowed back to back. */
  burst: number;
  /** How quickly the allowance comes back. */
  refillPerSec: number;
  /** A key with a full allowance is indistinguishable from one never seen. */
  forgetAfterMs?: number;
}

interface Bucket {
  tokens: number;
  seenAt: number;
}

/**
 * A token bucket per key, for things that should be rare per client rather
 * than merely rare per connection.
 *
 * Per-connection limits do not help against anything an attacker can do by
 * opening another connection, which is why these are keyed by address.
 */
export class TokenBuckets {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = 0;
  private readonly forgetAfterMs: number;

  constructor(private readonly options: LimiterOptions) {
    this.forgetAfterMs = options.forgetAfterMs ?? (options.burst / options.refillPerSec) * 1000 * 2;
  }

  /** True when the request may proceed. */
  take(key: string, now: number): boolean {
    this.sweep(now);
    const bucket = this.buckets.get(key) ?? { tokens: this.options.burst, seenAt: now };
    bucket.tokens = Math.min(
      this.options.burst,
      bucket.tokens + ((now - bucket.seenAt) / 1000) * this.options.refillPerSec,
    );
    bucket.seenAt = now;
    this.buckets.set(key, bucket);

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  get size(): number {
    return this.buckets.size;
  }

  private sweep(now: number): void {
    if (now - this.lastSweep < this.forgetAfterMs) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.seenAt > this.forgetAfterMs) this.buckets.delete(key);
    }
  }
}
