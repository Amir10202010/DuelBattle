export type ColorTarget = 'red' | 'green' | 'blue';
export function colorFraction(rgba: ArrayLike<number>, target: ColorTarget): number {
  let hits = 0;
  let pixels = 0;
  for (let i = 0; i < rgba.length; i += 16) {
    const r = rgba[i] / 255,
      g = rgba[i + 1] / 255,
      b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      delta = max - min;
    pixels++;
    if (max < 0.18 || (max > 0.98 && delta < 0.2) || delta < 0.15 || delta / max < 0.38) continue;
    let hue =
      max === r
        ? 60 * (((g - b) / delta) % 6)
        : max === g
          ? 60 * ((b - r) / delta + 2)
          : 60 * ((r - g) / delta + 4);
    if (hue < 0) hue += 360;
    if (
      target === 'red'
        ? hue < 18 || hue > 342
        : target === 'green'
          ? hue > 72 && hue < 165
          : hue > 190 && hue < 255
    )
      hits++;
  }
  return pixels ? hits / pixels : 0;
}
export class TemporalColorGuide {
  private stable = 0;
  update(fraction: number) {
    this.stable = fraction >= 0.12 ? this.stable + 1 : 0;
    return this.stable >= 3;
  }
  reset() {
    this.stable = 0;
  }
}
