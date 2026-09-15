import { describe, expect, it } from 'vitest';
import { urgentSecond } from '../src/components/DeadlineCue.js';

describe('last-second cue', () => {
  it('only appears during the last five playable seconds', () => {
    expect(urgentSecond(10000, 4999, true)).toBeNull();
    expect(urgentSecond(10000, 5000, true)).toBe(5);
    expect(urgentSecond(10000, 9999, true)).toBe(1);
    expect(urgentSecond(10000, 10000, true)).toBeNull();
    expect(urgentSecond(10000, 6000, false)).toBeNull();
    expect(urgentSecond(null, 6000, true)).toBeNull();
  });
});
