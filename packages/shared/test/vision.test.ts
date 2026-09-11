import { describe, expect, it } from 'vitest';
import { createFrame, resizeFrame, type Frame } from '../src/vision/frame.js';
import { classifyColor, matchesColor, rgbToHsv } from '../src/vision/color.js';
import {
  detectChange,
  detectColorObject,
  detectColorPair,
  detectCoverage,
  detectDarkness,
  detectLuminance,
  roiWeight,
} from '../src/vision/detect.js';
import { runDetector, detectorColors } from '../src/vision/run.js';

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

function paint(frame: Frame, x0: number, y0: number, w: number, h: number, rgb: [number, number, number]): Frame {
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
  it('names obvious colours', () => {
    expect(classifyColor(220, 30, 30)).toBe('red');
    expect(classifyColor(30, 60, 220)).toBe('blue');
    expect(classifyColor(40, 180, 80)).toBe('green');
    expect(classifyColor(250, 250, 248)).toBe('white');
    expect(classifyColor(12, 12, 14)).toBe('black');
  });

  it('treats crimson at the top of the hue wheel as red', () => {
    expect(matchesColor('red', rgbToHsv(200, 20, 60))).toBe(true);
  });

  it('does not call a grey wall any chromatic colour', () => {
    expect(classifyColor(128, 128, 130)).toBe(null);
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
    expect(detectChange(baseline, current)).toBeLessThan(0.01);
    expect(detectColorObject(baseline, current, { target: 'red' }).matched).toBe(false);
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


const WHITE: [number, number, number] = [246, 246, 242];
const NEAR_BLACK: [number, number, number] = [10, 10, 12];

function room(level: number): Frame {
  return blank(level, level + 2, level + 4);
}

describe('detectCoverage', () => {
  it('passes only when the new thing fills the view', () => {
    const baseline = blank();
    const small = paint(clone(baseline), 20, 12, 24, 24, RED);
    const whole = paint(clone(baseline), 0, 0, W, H, RED);

    expect(detectCoverage(baseline, small, { minChange: 0.82 }).matched).toBe(false);
    expect(detectCoverage(baseline, whole, { minChange: 0.82 }).matched).toBe(true);
  });

  it('reports progress so the meter can climb towards it', () => {
    const baseline = blank();
    const half = paint(clone(baseline), 0, 0, W, H / 2, RED);
    const result = detectCoverage(baseline, half, { minChange: 0.82 });
    expect(result.matched).toBe(false);
    expect(result.progress).toBeGreaterThan(0.2);
    expect(result.progress).toBeLessThan(1);
  });
});

describe('detectDarkness', () => {
  it('passes when the lens is covered', () => {
    const baseline = blank();
    const covered = paint(clone(baseline), 0, 0, W, H, NEAR_BLACK);
    expect(detectDarkness(baseline, covered, { maxLuminance: 0.05 }).matched).toBe(true);
  });

  it('does not pass for a merely dim room that nobody touched', () => {
    // A player who simply sits in the dark has changed nothing.
    const dim = room(24);
    expect(detectDarkness(dim, clone(dim), { maxLuminance: 0.05 }).matched).toBe(false);
  });

  it('does not pass while light still gets in', () => {
    const baseline = blank();
    const partial = paint(clone(baseline), 0, 0, W, Math.floor(H * 0.7), NEAR_BLACK);
    expect(detectDarkness(baseline, partial, { maxLuminance: 0.05 }).matched).toBe(false);
  });
});

describe('detectLuminance', () => {
  /**
   * The reason this detector compares a ratio rather than a fixed offset: a
   * gap big enough to mean something in a bright room does not exist at all in
   * a dim one, and both rooms are ordinary.
   */
  it('judges "darker than your room" the same way in a dim room and a bright one', () => {
    for (const level of [70, 140, 210]) {
      const baseline = room(level);
      const held = paint(clone(baseline), 16, 10, 32, 28, NEAR_BLACK);
      const result = detectLuminance(baseline, held, { mode: 'darker', ratio: 0.45 });
      expect(result.matched, `room level ${level}: ${result.reason}`).toBe(true);
    }
  });

  it('judges "brighter than your room" the same way at any room brightness', () => {
    for (const level of [30, 80, 130]) {
      const baseline = room(level);
      const held = paint(clone(baseline), 16, 10, 32, 28, WHITE);
      const result = detectLuminance(baseline, held, { mode: 'brighter', ratio: 2.2 });
      expect(result.matched, `room level ${level}: ${result.reason}`).toBe(true);
    }
  });

  it('rejects something the same brightness as the room', () => {
    const baseline = room(120);
    const held = paint(clone(baseline), 16, 10, 32, 28, [124, 124, 126]);
    expect(detectLuminance(baseline, held, { mode: 'darker', ratio: 0.45 }).matched).toBe(false);
    expect(detectLuminance(baseline, held, { mode: 'brighter', ratio: 2.2 }).matched).toBe(false);
  });

  it('will not call noise in a near-black room a darker object', () => {
    const baseline = room(6);
    const held = paint(clone(baseline), 16, 10, 32, 28, [1, 1, 2]);
    // The ratio is satisfied, but the absolute gap is meaningless.
    expect(detectLuminance(baseline, held, { mode: 'darker', ratio: 0.45 }).matched).toBe(false);
  });
});

describe('detectColorPair', () => {
  const targets = ['red', 'white'] as const;

  it('needs both colours in shot', () => {
    const baseline = blank();
    const both = paint(paint(clone(baseline), 16, 12, 24, 26, RED), 40, 12, 24, 26, WHITE);
    const onlyRed = paint(clone(baseline), 16, 12, 48, 26, RED);

    expect(detectColorPair(baseline, both, { targets }).matched).toBe(true);
    expect(detectColorPair(baseline, onlyRed, { targets }).matched).toBe(false);
  });

  it('names the colour that is missing', () => {
    const baseline = blank();
    const onlyRed = paint(clone(baseline), 16, 12, 48, 26, RED);
    expect(detectColorPair(baseline, onlyRed, { targets }).reason).toContain('white');
  });
});

describe('runDetector', () => {
  it('dispatches every kind the catalogue can declare', () => {
    const baseline = blank();
    const current = paint(clone(baseline), 20, 12, 24, 24, RED);
    const specs = [
      { kind: 'color', target: 'red' },
      { kind: 'colorPair', targets: ['red', 'white'] },
      { kind: 'coverage', minChange: 0.8 },
      { kind: 'luminance', mode: 'darker', ratio: 0.45 },
      { kind: 'darkness', maxLuminance: 0.05 },
    ] as const;

    for (const spec of specs) {
      const result = runDetector(spec, baseline, current);
      expect(typeof result.matched, spec.kind).toBe('boolean');
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(1);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it('reports which colours a round is about, for the swatches', () => {
    expect(detectorColors({ kind: 'color', target: 'red' })).toEqual(['red']);
    expect(detectorColors({ kind: 'colorPair', targets: ['red', 'white'] })).toEqual(['red', 'white']);
    expect(detectorColors({ kind: 'coverage', minChange: 0.8 })).toEqual([]);
  });
});
