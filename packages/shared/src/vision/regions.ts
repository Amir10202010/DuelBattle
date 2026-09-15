import type { Frame } from './frame.js';
import { matchesColor, rgbToHsv, type ColorKey, type Hsv } from './color.js';

export interface ColorRegion {
  /** Normalized, unmirrored [left, top, right, bottom] in the evidence frame. */
  box: [number, number, number, number];
  pixels: number;
  coverage: number;
  /** Colour fit inside this connected region; area is not a quality bonus. */
  score: number;
}

const HUE: Record<Exclude<ColorKey, 'white' | 'black'>, number> = {
  red: 0, orange: 26, yellow: 55, green: 120, blue: 220, purple: 280, pink: 322,
};
const SPREAD = { red: 16, orange: 15, yellow: 14, green: 52, blue: 56, purple: 22, pink: 24 };

function colorFit(target: ColorKey, hsv: Hsv): number {
  if (target === 'white') return 0.65 * hsv.v + 0.35 * (1 - hsv.s);
  if (target === 'black') return 1 - hsv.v;
  const distance = Math.abs(hsv.h - HUE[target]);
  const hueFit = 1 - Math.min(1, Math.min(distance, 360 - distance) / SPREAD[target]);
  // Accepted edge hues still qualify; the centre of the colour range scores higher.
  return 0.5 + 0.3 * hueFit + 0.2 * hsv.s;
}

/** Connected foreground colour regions, independent of how much the player's body moved. */
export function findColorRegions(
  baseline: Frame,
  current: Frame,
  target: ColorKey,
  threshold: number,
  exposure: number,
): ColorRegion[] {
  const { width, height } = current;
  const count = width * height;
  const mask = new Uint8Array(count);
  const quality = new Float32Array(count);
  // Robust exposure correction: a lamp switching on changes most pixels by
  // the same factor. A held object changes only its own region.
  const ratios: number[] = [];
  for (let p = 0; p < count; p += 16) {
    const i = p * 4;
    const before = baseline.data[i]! + baseline.data[i + 1]! + baseline.data[i + 2]!;
    if (before > 45) ratios.push((current.data[i]! + current.data[i + 1]! + current.data[i + 2]!) / before);
  }
  ratios.sort((a, b) => a - b);
  const gain = Math.max(0.4, Math.min(2.5, ratios[Math.floor(ratios.length / 2)] ?? 1));
  // A summed-area mask suppresses old colour regions, including a few pixels
  // around their edges when the camera is nudged. It doesn't suppress a small
  // NEW object elsewhere in the shot.
  const stride = width + 1;
  const oldColor = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const hsv = rgbToHsv(baseline.data[i]!, baseline.data[i + 1]!, baseline.data[i + 2]!);
    hsv.v = Math.min(1, hsv.v * exposure);
    const at = (y + 1) * stride + x + 1;
    oldColor[at] = (matchesColor(target, hsv) ? 1 : 0) + oldColor[at - 1]! + oldColor[at - stride]! - oldColor[at - stride - 1]!;
  }
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    const r = current.data[i]!, g = current.data[i + 1]!, b = current.data[i + 2]!;
    const delta = (Math.abs(r - baseline.data[i]! * gain) + Math.abs(g - baseline.data[i + 1]! * gain) +
      Math.abs(b - baseline.data[i + 2]! * gain)) / 3;
    if (delta < threshold) continue;
    const hsv = rgbToHsv(r, g, b);
    hsv.v = Math.min(1, hsv.v * exposure / gain);
    if (!matchesColor(target, hsv)) continue;
    const x = p % width, y = Math.floor(p / width);
    const x0 = Math.max(0, x - 3), y0 = Math.max(0, y - 3);
    const x1 = Math.min(width, x + 4), y1 = Math.min(height, y + 4);
    if (oldColor[y1 * stride + x1]! - oldColor[y0 * stride + x1]! -
      oldColor[y1 * stride + x0]! + oldColor[y0 * stride + x0]! > 0) continue;
    mask[p] = 1;
    quality[p] = colorFit(target, hsv);
  }
  const queue = new Int32Array(count);
  const regions: ColorRegion[] = [];
  const minimum = Math.max(12, Math.ceil(count * 0.0012));
  for (let p = 0; p < count; p++) {
    if (!mask[p]) continue;
    let head = 0, tail = 1, total = 0;
    let left = width, top = height, right = 0, bottom = 0;
    queue[0] = p;
    mask[p] = 0;
    while (head < tail) {
      const at = queue[head++]!;
      const x = at % width, y = Math.floor(at / width);
      total += quality[at]!;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (!mask[next]) continue;
        mask[next] = 0;
        queue[tail++] = next;
      }
    }
    // Reject sensor speckles; thin objects such as pens can still pass.
    if (tail < minimum || right - left < 1 || bottom - top < 1) continue;
    regions.push({
      box: [left / width, top / height, (right + 1) / width, (bottom + 1) / height],
      pixels: tail, coverage: tail / count, score: Math.round(100 * total / tail),
    });
  }
  return regions.sort((a, b) => b.pixels - a.pixels).slice(0, 8);
}
