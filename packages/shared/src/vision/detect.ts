import type { Frame } from './frame.js';
import { sameSize } from './frame.js';
import { matchesColor, rgbToHsv, type ColorKey } from './color.js';

export interface DetectionResult {
  matched: boolean;
  /** 0..1, monotonic in "how clearly this passed". Never used as a threshold. */
  confidence: number;
  /** Short player-facing explanation of the verdict. */
  reason: string;
  metrics: {
    /** Weighted fraction of the frame that differs from the baseline. */
    changeRatio: number;
    /** Fraction of the changed region that matches the target colour. */
    share: number;
    /** Weighted fraction of the whole frame that is new *and* on target. */
    coverage: number;
  };
}

/**
 * Radial weight applied to every pixel. Detectors care about what the player
 * deliberately holds up — which lands near the middle of the frame — far more
 * than about the edges of the room, so the border contributes at a discount
 * rather than not at all.
 */
export function roiWeight(x: number, y: number, width: number, height: number): number {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const nx = (x - cx) / (cx || 1);
  const ny = (y - cy) / (cy || 1);
  const r = Math.min(1, Math.sqrt(nx * nx + ny * ny) / Math.SQRT2);
  return EDGE_WEIGHT + (1 - EDGE_WEIGHT) * Math.pow(1 - r, 1.5);
}

const EDGE_WEIGHT = 0.35;

export interface ChangeOptions {
  /** Mean per-channel delta (0..255) above which a pixel counts as changed. */
  changeThreshold?: number;
}

export interface ColorDetectorOptions extends ChangeOptions {
  target: ColorKey;
  /** Share of the changed region that must be the target colour. */
  minShare?: number;
  /** Weighted fraction of the frame that must have changed at all. */
  minChange?: number;
}

export const DEFAULT_CHANGE_THRESHOLD = 32;
export const DEFAULT_MIN_SHARE = 0.32;
export const DEFAULT_MIN_CHANGE = 0.035;

function assertComparable(baseline: Frame, current: Frame): void {
  if (!sameSize(baseline, current)) {
    throw new Error(
      `detector: frame size mismatch (${baseline.width}x${baseline.height} vs ${current.width}x${current.height})`,
    );
  }
}

interface Accumulated {
  totalWeight: number;
  changedWeight: number;
  matchWeight: number;
}

function accumulate(
  baseline: Frame,
  current: Frame,
  changeThreshold: number,
  isMatch: ((r: number, g: number, b: number) => boolean) | null,
): Accumulated {
  const { width, height } = current;
  let totalWeight = 0;
  let changedWeight = 0;
  let matchWeight = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const w = roiWeight(x, y, width, height);
      totalWeight += w;

      const r = current.data[i]!;
      const g = current.data[i + 1]!;
      const b = current.data[i + 2]!;
      const delta =
        (Math.abs(r - baseline.data[i]!) +
          Math.abs(g - baseline.data[i + 1]!) +
          Math.abs(b - baseline.data[i + 2]!)) /
        3;

      if (delta <= changeThreshold) continue;
      changedWeight += w;
      if (isMatch && isMatch(r, g, b)) matchWeight += w;
    }
  }
  return { totalWeight, changedWeight, matchWeight };
}

/**
 * "Did anything meaningfully enter or move in the frame?" — used to reject
 * submissions where the player did not actually do anything.
 */
export function detectChange(baseline: Frame, current: Frame, opts: ChangeOptions = {}): number {
  assertComparable(baseline, current);
  const { totalWeight, changedWeight } = accumulate(
    baseline,
    current,
    opts.changeThreshold ?? DEFAULT_CHANGE_THRESHOLD,
    null,
  );
  return totalWeight === 0 ? 0 : changedWeight / totalWeight;
}

/**
 * Verifies "show me something <colour>".
 *
 * The verdict is computed over the region that changed since the baseline
 * frame, which is captured the instant the prompt is revealed. That is the
 * whole point: a red sofa that was already in shot is part of the baseline and
 * earns nothing, while a red mug lifted into view is scored on its own merits.
 */
export function detectColorObject(
  baseline: Frame,
  current: Frame,
  opts: ColorDetectorOptions,
): DetectionResult {
  assertComparable(baseline, current);
  const minShare = opts.minShare ?? DEFAULT_MIN_SHARE;
  const minChange = opts.minChange ?? DEFAULT_MIN_CHANGE;

  const { totalWeight, changedWeight, matchWeight } = accumulate(
    baseline,
    current,
    opts.changeThreshold ?? DEFAULT_CHANGE_THRESHOLD,
    (r, g, b) => matchesColor(opts.target, rgbToHsv(r, g, b)),
  );

  const changeRatio = totalWeight === 0 ? 0 : changedWeight / totalWeight;
  const share = changedWeight === 0 ? 0 : matchWeight / changedWeight;
  const coverage = totalWeight === 0 ? 0 : matchWeight / totalWeight;
  const metrics = { changeRatio, share, coverage };

  if (changeRatio < minChange) {
    return {
      matched: false,
      confidence: 0,
      reason: 'Hold the object up so the camera can see it change.',
      metrics,
    };
  }
  if (share < minShare) {
    return {
      matched: false,
      confidence: clamp01(share / minShare) * 0.5,
      reason: `That does not read as ${opts.target} — try filling more of the frame.`,
      metrics,
    };
  }

  const shareScore = clamp01((share - minShare) / (1 - minShare));
  const sizeScore = clamp01(changeRatio / 0.25);
  return {
    matched: true,
    confidence: clamp01(0.5 + 0.35 * shareScore + 0.15 * sizeScore),
    reason: `Locked on — ${Math.round(share * 100)}% of what you showed is ${opts.target}.`,
    metrics,
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
