/**
 * What the on-device tracker sees, and the geometry that puts it back on screen.
 *
 * Two rules hold this file together. Every coordinate the worker produces is
 * normalised against the **whole camera frame**, never against whatever crop
 * happened to be handed to the model — a crop is a rendering decision, and
 * baking one into the numbers is how an overlay ends up drawing a skeleton
 * three inches to the left of the person. And nothing here ever crosses the
 * wire: the tracker looks at your own camera, on your own machine, and the
 * opponent's stage shows their video and nothing drawn over it.
 */

export interface Point {
  x: number;
  y: number;
  visibility?: number;
}
export type Box = [number, number, number, number];
export interface TrackedObject {
  label: string;
  confidence: number;
  box: Box;
  nearHand: boolean;
}

export interface Scene {
  pose: Point[];
  hands: Point[][];
  objects: TrackedObject[];
  /** `performance.now()` on the worker when this frame was analysed. */
  at: number;
}

export type VisionRequest =
  | { type: 'init'; base: string }
  | { type: 'frame'; bitmap: ImageBitmap; at: number; objects: boolean };

export type VisionResponse =
  | { type: 'ready'; backend: 'gpu' | 'cpu' }
  | { type: 'error' }
  /** One analysed frame, plus how long the models took, so the host can pace itself. */
  | { type: 'scene'; scene: Scene; costMs: number };

export const BODY_LINKS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32],
] as const;
export const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
] as const;

/** Wrist, thumb tip, and the four fingertips: the points worth drawing solid. */
export const HAND_TIPS = [0, 4, 8, 12, 16, 20] as const;

/** Geometric proximity is a hint, never proof that the object is being held. */
export function nearHand(box: Box, hands: Point[][]): boolean {
  return hands.some((hand) => hand.some((p) => p.x >= box[0] - 0.035 && p.x <= box[2] + 0.035 &&
    p.y >= box[1] - 0.035 && p.y <= box[3] + 0.035));
}

export function visible(point: Point | undefined): point is Point {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= -0.05 && point.x <= 1.05 && point.y >= -0.05 && point.y <= 1.05 &&
    (point.visibility ?? 1) >= 0.5);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface CoverMap {
  /** Multiply a full-frame normalised x by this, then add `offsetX`, for pixels. */
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Maps full-frame normalised coordinates onto a box that shows the frame
 * `object-fit: cover`.
 *
 * This is the whole fix for a misplaced overlay. The camera hands out, say, a
 * 1280x720 picture; the stage shows the largest 4:3 piece of it that fits;
 * the tracker looked at the entire 1280x720. Three coordinate spaces, and the
 * old overlay silently assumed they were one. Here the cover crop is computed
 * once, in exactly the terms the browser uses for the video element beside it,
 * so a landmark at the tip of somebody's finger is drawn at the tip of their
 * finger.
 */
export function coverMap(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
): CoverMap {
  if (!(sourceWidth > 0) || !(sourceHeight > 0) || !(boxWidth > 0) || !(boxHeight > 0)) {
    return { scaleX: boxWidth || 0, scaleY: boxHeight || 0, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    scaleX: width,
    scaleY: height,
    offsetX: (boxWidth - width) / 2,
    offsetY: (boxHeight - height) / 2,
  };
}

/** One normalised point, in pixels of the box, mirrored for a selfie view. */
export function project(
  point: { x: number; y: number },
  map: CoverMap,
  mirrored: boolean,
): { x: number; y: number } {
  const x = mirrored ? 1 - point.x : point.x;
  return { x: x * map.scaleX + map.offsetX, y: point.y * map.scaleY + map.offsetY };
}

// ---------------------------------------------------------------------------
// Smoothing
// ---------------------------------------------------------------------------

/**
 * A one-euro filter: still points stop shivering, fast points keep up.
 *
 * Inference lands somewhere between fifteen and thirty times a second and
 * always with a little noise on it. A plain low-pass makes a hand that is not
 * moving sit still, and a hand that *is* moving lag behind by a visible amount
 * — which reads as "the tracker is broken" even when every frame was correct.
 * This raises the cutoff with speed, so the two cases get different treatment
 * from the same three numbers.
 */
export class OneEuro {
  private value: number | null = null;
  private derivative = 0;
  private at = 0;

  constructor(
    private readonly minCutoff = 1.6,
    private readonly beta = 0.03,
    private readonly derivativeCutoff = 1,
  ) {}

  reset(): void {
    this.value = null;
    this.derivative = 0;
  }

  filter(value: number, at: number): number {
    if (!Number.isFinite(value)) return this.value ?? 0;
    if (this.value === null) {
      this.value = value;
      this.at = at;
      return value;
    }
    const elapsed = Math.max(1, at - this.at) / 1000;
    this.at = at;
    const rate = 1 / elapsed;

    const rawDerivative = (value - this.value) * rate;
    this.derivative += alpha(this.derivativeCutoff, rate) * (rawDerivative - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    this.value += alpha(cutoff, rate) * (value - this.value);
    return this.value;
  }
}

function alpha(cutoff: number, rate: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau * rate);
}
