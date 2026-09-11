import { describe, expect, it } from 'vitest';
import { TokenBuckets } from '../src/limiter.js';

describe('TokenBuckets', () => {
  it('allows a burst, then refuses', () => {
    const limiter = new TokenBuckets({ burst: 3, refillPerSec: 1 });
    expect([0, 0, 0, 0].map((_, i) => limiter.take('a', i))).toEqual([true, true, true, false]);
  });

  it('gives the allowance back over time', () => {
    const limiter = new TokenBuckets({ burst: 2, refillPerSec: 1 });
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    // One second, one token.
    expect(limiter.take('a', 1_000)).toBe(true);
    expect(limiter.take('a', 1_000)).toBe(false);
  });

  it('never hands back more than the burst', () => {
    const limiter = new TokenBuckets({ burst: 2, refillPerSec: 1 });
    limiter.take('a', 0);
    // An hour later the allowance is still two, not three thousand.
    expect(limiter.take('a', 3_600_000)).toBe(true);
    expect(limiter.take('a', 3_600_000)).toBe(true);
    expect(limiter.take('a', 3_600_000)).toBe(false);
  });

  it('keeps callers apart', () => {
    const limiter = new TokenBuckets({ burst: 1, refillPerSec: 1 });
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    // One noisy address must not spend anybody else's allowance.
    expect(limiter.take('b', 0)).toBe(true);
  });

  it('forgets callers it can no longer be holding anything against', () => {
    const limiter = new TokenBuckets({ burst: 2, refillPerSec: 1, forgetAfterMs: 1_000 });
    for (let i = 0; i < 50; i++) limiter.take(`ip-${i}`, 0);
    expect(limiter.size).toBe(50);

    // A key with a full allowance is indistinguishable from one never seen, so
    // holding onto it is just a slow memory leak keyed by whoever visits.
    limiter.take('late', 10_000);
    expect(limiter.size).toBe(1);
  });
});
