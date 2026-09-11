export type ColorKey =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'white'
  | 'black';

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

/**
 * WCAG relative luminance. Used wherever a detector has to reason about how
 * bright something is, because HSV "value" is just the brightest channel and
 * would call a saturated blue as light as white.
 */
export function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

interface ColorSpec {
  key: ColorKey;
  label: string;
  /** Display swatch, used by the UI so prompt and detector never drift apart. */
  swatch: string;
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
  red: { key: 'red', label: 'red', swatch: '#e23a3a', hue: [[0, 12], [344, 360]], minSat: 0.35, minVal: 0.2 },
  orange: { key: 'orange', label: 'orange', swatch: '#f0812a', hue: [[13, 40]], minSat: 0.4, minVal: 0.3 },
  yellow: { key: 'yellow', label: 'yellow', swatch: '#f2c13c', hue: [[41, 68]], minSat: 0.35, minVal: 0.35 },
  green: { key: 'green', label: 'green', swatch: '#3fb265', hue: [[69, 165]], minSat: 0.28, minVal: 0.18 },
  blue: { key: 'blue', label: 'blue', swatch: '#3a76e2', hue: [[166, 260]], minSat: 0.3, minVal: 0.15 },
  purple: { key: 'purple', label: 'purple', swatch: '#8a56d6', hue: [[261, 300]], minSat: 0.25, minVal: 0.15 },
  pink: { key: 'pink', label: 'pink', swatch: '#e264a8', hue: [[301, 343]], minSat: 0.2, minVal: 0.4 },
  white: { key: 'white', label: 'white', swatch: '#f2f2f0', maxSat: 0.16, minVal: 0.72 },
  black: { key: 'black', label: 'black', swatch: '#1a1a1c', maxVal: 0.2 },
};

export const COLOR_KEYS = Object.keys(SPECS) as ColorKey[];

export function colorSwatch(key: ColorKey): string {
  return SPECS[key].swatch;
}

export function colorLabel(key: ColorKey): string {
  return SPECS[key].label;
}

export function isColorKey(value: string): value is ColorKey {
  return Object.prototype.hasOwnProperty.call(SPECS, value);
}

export function matchesColor(key: ColorKey, hsv: Hsv): boolean {
  const spec = SPECS[key];
  if (spec.minSat !== undefined && hsv.s < spec.minSat) return false;
  if (spec.maxSat !== undefined && hsv.s > spec.maxSat) return false;
  if (spec.minVal !== undefined && hsv.v < spec.minVal) return false;
  if (spec.maxVal !== undefined && hsv.v > spec.maxVal) return false;
  if (!spec.hue) return true;
  return spec.hue.some(([lo, hi]) => hsv.h >= lo && hsv.h <= hi);
}

/** Best-effort naming of a single pixel, used for player-facing feedback. */
export function classifyColor(r: number, g: number, b: number): ColorKey | null {
  const hsv = rgbToHsv(r, g, b);
  for (const key of COLOR_KEYS) {
    if (matchesColor(key, hsv)) return key;
  }
  return null;
}
