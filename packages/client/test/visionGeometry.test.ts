import { describe, expect, it } from 'vitest';
import { OneEuro, coverMap, nearHand, project, visible } from '../src/vision/types.js';

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

describe('cover mapping', () => {
  it('fills a box of the same shape exactly', () => {
    const map = coverMap(640, 480, 320, 240);
    expect(project({ x: 0, y: 0 }, map, false)).toEqual({ x: 0, y: 0 });
    expect(project({ x: 1, y: 1 }, map, false)).toEqual({ x: 320, y: 240 });
  });

  it('crops the long axis of a wide camera shown in a 4:3 window', () => {
    // 16:9 into 4:3: the sides are cut, the full height is kept, and the
    // horizontal centre of the frame stays the horizontal centre of the box.
    const map = coverMap(1280, 720, 400, 300);
    const middle = project({ x: 0.5, y: 0.5 }, map, false);
    expect(middle.x).toBeCloseTo(200);
    expect(middle.y).toBeCloseTo(150);
    expect(project({ x: 0, y: 0 }, map, false).x).toBeCloseTo(-66.666, 2);
    expect(project({ x: 0, y: 0 }, map, false).y).toBeCloseTo(0);
  });

  it('crops the tall axis of a portrait camera', () => {
    const map = coverMap(720, 1280, 400, 300);
    expect(project({ x: 0, y: 0 }, map, false).x).toBeCloseTo(0);
    expect(project({ x: 0.5, y: 0.5 }, map, false).y).toBeCloseTo(150);
    expect(project({ x: 0, y: 0 }, map, false).y).toBeLessThan(0);
  });

  it('mirrors horizontally only, so a selfie view still reads top to bottom', () => {
    const map = coverMap(640, 480, 320, 240);
    expect(project({ x: 0.25, y: 0.3 }, map, true)).toEqual({ x: 240, y: 72 });
  });

  it('survives a camera that has not reported a size yet', () => {
    const map = coverMap(0, 0, 320, 240);
    expect(Number.isFinite(project({ x: 0.5, y: 0.5 }, map, false).x)).toBe(true);
  });
});

describe('one-euro smoothing', () => {
  it('passes the first sample straight through', () => {
    expect(new OneEuro().filter(0.4, 0)).toBe(0.4);
  });

  it('damps jitter around a still point', () => {
    const filter = new OneEuro();
    filter.filter(0.5, 0);
    let last = 0.5;
    for (let i = 1; i <= 20; i++) last = filter.filter(i % 2 ? 0.52 : 0.48, i * 33);
    expect(Math.abs(last - 0.5)).toBeLessThan(0.012);
  });

  it('still follows a fast, sustained move', () => {
    const filter = new OneEuro();
    filter.filter(0, 0);
    let last = 0;
    for (let i = 1; i <= 20; i++) last = filter.filter(i * 0.05, i * 33);
    expect(last).toBeGreaterThan(0.85);
  });

  it('ignores a nonfinite sample rather than poisoning the state', () => {
    const filter = new OneEuro();
    filter.filter(0.3, 0);
    expect(filter.filter(NaN, 33)).toBe(0.3);
  });
});
