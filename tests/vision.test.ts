import { describe, expect, it } from 'vitest';
import { createFrame, resizeFrame, type Frame } from '../shared/vision/frame.js';
import { matchesColor, rgbToHsv } from '../shared/vision/color.js';
import { detectColorObject, roiWeight } from '../shared/vision/detect.js';

const W = 64;
const H = 48;

function blank(r = 90, g = 92, b = 95): Frame {
  const frame = createFrame(W, H);
  for (let i = 0; i < frame.data.length; i += 4) {
    frame.data[i] = r;
    frame.data[i + 1] = g;
    frame.data[i + 2] = b;
    frame.data[i + 3] = 255;
  }
  return frame;
}

function clone(frame: Frame): Frame {
  return { width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data) };
}

function paint(
  frame: Frame,
  x0: number,
  y0: number,
  w: number,
  h: number,
  rgb: [number, number, number],
): Frame {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
      const i = (y * frame.width + x) * 4;
      frame.data[i] = rgb[0];
      frame.data[i + 1] = rgb[1];
      frame.data[i + 2] = rgb[2];
    }
  }
  return frame;
}

const RED: [number, number, number] = [205, 30, 30];
const BLUE: [number, number, number] = [30, 70, 205];
const GREEN: [number, number, number] = [40, 165, 70];

describe('rgbToHsv', () => {
  it('maps the primaries', () => {
    expect(rgbToHsv(255, 0, 0)).toMatchObject({ h: 0, s: 1, v: 1 });
    expect(rgbToHsv(0, 255, 0).h).toBeCloseTo(120);
    expect(rgbToHsv(0, 0, 255).h).toBeCloseTo(240);
    expect(rgbToHsv(0, 0, 0)).toMatchObject({ h: 0, s: 0, v: 0 });
    expect(rgbToHsv(255, 255, 255)).toMatchObject({ s: 0, v: 1 });
  });
});

describe('colour classification', () => {
  it('recognises obvious colours', () => {
    expect(matchesColor('red', rgbToHsv(220, 30, 30))).toBe(true);
    expect(matchesColor('blue', rgbToHsv(30, 60, 220))).toBe(true);
    expect(matchesColor('green', rgbToHsv(40, 180, 80))).toBe(true);
    expect(matchesColor('white', rgbToHsv(250, 250, 248))).toBe(true);
    expect(matchesColor('black', rgbToHsv(12, 12, 14))).toBe(true);
  });

  it('treats crimson at the top of the hue wheel as red', () => {
    expect(matchesColor('red', rgbToHsv(200, 20, 60))).toBe(true);
  });

  it('does not call a grey wall any chromatic colour', () => {
    const grey = rgbToHsv(128, 128, 130);
    for (const key of ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const)
      expect(matchesColor(key, grey)).toBe(false);
  });
});

describe('roiWeight', () => {
  it('favours the centre but never discards the edges', () => {
    const centre = roiWeight(W / 2, H / 2, W, H);
    const corner = roiWeight(0, 0, W, H);
    expect(centre).toBeGreaterThan(corner);
    expect(corner).toBeGreaterThan(0);
    expect(centre).toBeLessThanOrEqual(1);
  });
});

describe('detectColorObject', () => {
  it('accepts an object brought into frame', () => {
    const baseline = blank();
    const current = paint(clone(baseline), 20, 12, 24, 24, RED);
    const result = detectColorObject(baseline, current, { target: 'red' });
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('ignores a matching object that was already in the room', () => {
    // The whole left wall is red, and it never moves.
    const baseline = paint(blank(), 0, 0, 20, H, RED);
    const current = clone(baseline);
    const result = detectColorObject(baseline, current, { target: 'red' });
    expect(result.matched).toBe(false);
    expect(result.metrics.changeRatio).toBeLessThan(0.01);
  });

  it('does not let a static red wall rescue a wrong-coloured answer', () => {
    const baseline = paint(blank(), 0, 0, 20, H, RED);
    const current = paint(clone(baseline), 26, 12, 24, 24, BLUE);
    const result = detectColorObject(baseline, current, { target: 'red' });
    expect(result.matched).toBe(false);
    expect(result.reason).toContain('red');
  });

  it('rejects the right colour shown in the wrong round', () => {
    const baseline = blank();
    const current = paint(clone(baseline), 20, 12, 24, 24, GREEN);
    expect(detectColorObject(baseline, current, { target: 'blue' }).matched).toBe(false);
    expect(detectColorObject(baseline, current, { target: 'green' }).matched).toBe(true);
  });

  it('accepts a colour pressed right up to the lens', () => {
    const baseline = blank();
    const current = paint(clone(baseline), 0, 0, W, H, BLUE);
    const result = detectColorObject(baseline, current, { target: 'blue' });
    expect(result.matched).toBe(true);
    expect(result.metrics.share).toBeGreaterThan(0.95);
  });

  it('is not fooled by sensor noise', () => {
    const baseline = blank();
    const current = clone(baseline);
    for (let i = 0; i < current.data.length; i += 4) {
      const jitter = ((i * 37) % 11) - 5;
      current.data[i] = 90 + jitter;
      current.data[i + 1] = 92 + jitter;
      current.data[i + 2] = 95 + jitter;
    }
    const result = detectColorObject(baseline, current, { target: 'red' });
    expect(result.metrics.changeRatio).toBeLessThan(0.01);
    expect(result.matched).toBe(false);
  });

  it('needs a real amount of colour, not a stray pixel', () => {
    const baseline = blank();
    const current = paint(clone(baseline), 30, 22, 2, 2, RED);
    expect(detectColorObject(baseline, current, { target: 'red' }).matched).toBe(false);
  });

  it('refuses to compare mismatched frames rather than guessing', () => {
    const baseline = blank();
    const current = createFrame(32, 24);
    expect(() => detectColorObject(baseline, current, { target: 'red' })).toThrow(/size mismatch/);
  });
});

describe('resizeFrame', () => {
  it('returns the same object when no work is needed', () => {
    const frame = blank();
    expect(resizeFrame(frame, W, H)).toBe(frame);
  });

  it('averages rather than point-samples', () => {
    const src = createFrame(2, 1);
    src.data.set([0, 0, 0, 255, 200, 200, 200, 255]);
    const out = resizeFrame(src, 1, 1);
    expect(out.data[0]).toBe(100);
  });

  it('rejects a degenerate target size', () => {
    expect(() => resizeFrame(blank(), 0, 10)).toThrow(RangeError);
  });
});
