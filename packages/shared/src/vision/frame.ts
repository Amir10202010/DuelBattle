/**
 * A decoded RGBA image. Deliberately structural so that the same code runs on
 * a browser `ImageData` and on a server-side decoded JPEG.
 */
export interface Frame {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  readonly data: Uint8ClampedArray;
}

/** Working resolution every detector runs at, on both client and server. */
export const ANALYSIS_WIDTH = 160;
export const ANALYSIS_HEIGHT = 120;

export function createFrame(width: number, height: number, fill = 0): Frame {
  const data = new Uint8ClampedArray(width * height * 4);
  if (fill !== 0) data.fill(fill);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}

export function sameSize(a: Frame, b: Frame): boolean {
  return a.width === b.width && a.height === b.height;
}

/**
 * Box-filtered downscale to an exact target size. Averaging (rather than
 * nearest-neighbour) matters here: detectors threshold on per-pixel change, and
 * nearest-neighbour sampling turns camera sensor noise into phantom motion.
 */
export function resizeFrame(src: Frame, width: number, height: number): Frame {
  if (src.width === width && src.height === height) return src;
  if (width <= 0 || height <= 0) throw new RangeError('resizeFrame: target size must be positive');
  const out = new Uint8ClampedArray(width * height * 4);
  const xRatio = src.width / width;
  const yRatio = src.height / height;

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * yRatio);
    const y1 = Math.max(y0 + 1, Math.min(src.height, Math.ceil((y + 1) * yRatio)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * xRatio);
      const x1 = Math.max(x0 + 1, Math.min(src.width, Math.ceil((x + 1) * xRatio)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        let idx = (sy * src.width + x0) * 4;
        for (let sx = x0; sx < x1; sx++) {
          r += src.data[idx]!;
          g += src.data[idx + 1]!;
          b += src.data[idx + 2]!;
          idx += 4;
          n++;
        }
      }
      const o = (y * width + x) * 4;
      out[o] = n ? r / n : 0;
      out[o + 1] = n ? g / n : 0;
      out[o + 2] = n ? b / n : 0;
      out[o + 3] = 255;
    }
  }
  return { width, height, data: out };
}
