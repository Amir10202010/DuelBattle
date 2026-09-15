import { describe, expect, it } from 'vitest';
import { nearHand, visible } from '../src/vision/types.js';

describe('tracking geometry', () => {
  it('marks proximity only when a hand reaches an object box', () => {
    expect(nearHand([0.2, 0.2, 0.4, 0.4], [[{ x: 0.3, y: 0.42 }]])).toBe(true);
    expect(nearHand([0.2, 0.2, 0.4, 0.4], [[{ x: 0.8, y: 0.8 }]])).toBe(false);
    expect(nearHand([0.2, 0.2, 0.4, 0.4], [])).toBe(false);
  });
  it('hides uncertain, offscreen and nonfinite body landmarks', () => {
    expect(visible({ x: 0.5, y: 0.5, visibility: 0.9 })).toBe(true);
    expect(visible({ x: 0.5, y: 0.5, visibility: 0.3 })).toBe(false);
    expect(visible({ x: -0.5, y: 0.5 })).toBe(false);
    expect(visible({ x: NaN, y: 0.5 })).toBe(false);
    expect(visible(undefined)).toBe(false);
  });
});
