import { describe, expect, it } from 'vitest';
import { createFrame, type Frame } from '../src/vision/frame.js';
import { detectColorObject } from '../src/vision/detect.js';

function room(): Frame {
  const frame = createFrame(160, 120);
  for (let i = 0; i < frame.data.length; i += 4) frame.data.set([90, 92, 95, 255], i);
  return frame;
}
function rect(frame: Frame, x: number, y: number, w: number, h: number, rgb: number[]) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    frame.data.set([...rgb, 255], (yy * frame.width + xx) * 4);
  }
  return frame;
}

describe('foreground colour regions', () => {
  it('sees a thin red pen even when a much larger blue sleeve moves', () => {
    const current = rect(room(), 20, 25, 100, 85, [30, 65, 210]);
    rect(current, 92, 32, 3, 31, [220, 25, 30]);
    const result = detectColorObject(room(), current, { target: 'red' });
    expect(result.matched).toBe(true);
    expect(result.region?.box).toEqual([92 / 160, 32 / 120, 95 / 160, 63 / 120]);
    expect(result.score).toBeGreaterThan(85);
  });
  it('does not mistake isolated sensor noise or a static red wall for a presented object', () => {
    const baseline = rect(room(), 0, 0, 70, 120, [220, 20, 30]);
    const current = { ...baseline, data: new Uint8ClampedArray(baseline.data) };
    for (let y = 5; y < 120; y += 8) rect(current, 100, y, 1, 1, [240, 10, 20]);
    expect(detectColorObject(baseline, current, { target: 'red' }).matched).toBe(false);
  });
  it('compares colour fit, not object size', () => {
    const small = detectColorObject(room(), rect(room(), 50, 30, 3, 30, [220, 10, 10]), { target: 'red' });
    const large = detectColorObject(room(), rect(room(), 30, 20, 100, 80, [220, 10, 10]), { target: 'red' });
    const orangeRed = detectColorObject(room(), rect(room(), 30, 20, 100, 80, [220, 50, 10]), { target: 'red' });
    expect(small.score).toBe(large.score);
    expect(small.score! - orangeRed.score!).toBeGreaterThan(3);
  });
  it('keeps an explicit screen-filling requirement', () => {
    const tiny = rect(room(), 50, 30, 3, 30, [220, 10, 10]);
    expect(detectColorObject(room(), tiny, { target: 'red', minChange: 0.35 }).matched).toBe(false);
  });
  it('rejects a wrong colour and incompatible frame sizes', () => {
    expect(detectColorObject(room(), rect(room(), 50, 30, 40, 30, [20, 30, 210]), { target: 'red' }).matched).toBe(false);
    expect(() => detectColorObject(room(), createFrame(10, 10), { target: 'red' })).toThrow();
  });
});
