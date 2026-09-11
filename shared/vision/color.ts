export type ColorKey =
  'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink' | 'white' | 'black';

export interface Hsv {
  /** 0..360 */
  h: number;
  /** 0..1 */
  s: number;
  /** 0..1 */
  v: number;
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

interface ColorSpec {
  /** Inclusive hue windows in degrees; omitted for achromatic colors. */
  hue?: ReadonlyArray<readonly [number, number]>;
  minSat?: number;
  maxSat?: number;
  minVal?: number;
  maxVal?: number;
}

/**
 * Thresholds are deliberately forgiving on saturation and value: webcams are
 * dim, auto-white-balance drifts, and a player holding a red mug under a warm
 * bulb should still read as red. They are tight on hue, which is the part a
 * player actually reasons about.
 */
const SPECS: Record<ColorKey, ColorSpec> = {
  red: {
    hue: [
      [0, 12],
      [344, 360],
    ],
    minSat: 0.35,
    minVal: 0.2,
  },
  orange: { hue: [[13, 40]], minSat: 0.4, minVal: 0.3 },
  yellow: { hue: [[41, 68]], minSat: 0.35, minVal: 0.35 },
  green: { hue: [[69, 165]], minSat: 0.28, minVal: 0.18 },
  blue: { hue: [[166, 260]], minSat: 0.3, minVal: 0.15 },
  purple: { hue: [[261, 300]], minSat: 0.25, minVal: 0.15 },
  pink: { hue: [[301, 343]], minSat: 0.2, minVal: 0.4 },
  white: { maxSat: 0.16, minVal: 0.72 },
  black: { maxVal: 0.2 },
};

export function matchesColor(key: ColorKey, hsv: Hsv): boolean {
  const spec = SPECS[key];
  if (spec.minSat !== undefined && hsv.s < spec.minSat) return false;
  if (spec.maxSat !== undefined && hsv.s > spec.maxSat) return false;
  if (spec.minVal !== undefined && hsv.v < spec.minVal) return false;
  if (spec.maxVal !== undefined && hsv.v > spec.maxVal) return false;
  if (!spec.hue) return true;
  return spec.hue.some(([lo, hi]) => hsv.h >= lo && hsv.h <= hi);
}
