import type { Frame } from './frame.js';
import { sameSize } from './frame.js';
import { matchesColor, relativeLuminance, rgbToHsv, type ColorKey } from './color.js';

export interface DetectionResult {
  matched: boolean;
  /** 0..1, monotonic in "how clearly this passed". Never used as a threshold. */
  confidence: number;
  /**
   * 0..1, how close the player is to passing. Every detector reports it on the
   * same scale so one meter can render any round without knowing the kind.
   */
  progress: number;
  /** Short player-facing explanation of the verdict. */
  reason: string;
  metrics: Readonly<Record<string, number>>;
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

export const DEFAULT_CHANGE_THRESHOLD = 32;
export const DEFAULT_MIN_SHARE = 0.32;
export const DEFAULT_MIN_CHANGE = 0.035;

export interface ChangeAnalysis {
  /** Weighted fraction of the frame that differs from the baseline. */
  changeRatio: number;
  /** Mean luminance of the changed pixels, as they are now. */
  changedLuminance: number;
  /** Mean luminance of those same pixels before they changed. */
  baselineLuminance: number;
  /** Mean luminance of the whole current frame. */
  frameLuminance: number;
  /**
   * Weighted fraction of the current frame below `AnalyseOptions.darkBelow`.
   * A share, not a mean, because a mean lets a half-covered lens average its
   * way to "dark".
   */
  darkShare: number;
  /** Share of the changed region matching each requested colour, 0..1. */
  colorShare: ReadonlyMap<ColorKey, number>;
}

export interface AnalyseOptions {
  /** Mean per-channel delta (0..255) above which a pixel counts as changed. */
  changeThreshold?: number;
  /** Colours to measure. Left empty, no colour work is done at all. */
  colors?: readonly ColorKey[];
  /** Luminance below which a pixel counts towards `darkShare`. */
  darkBelow?: number;
}

function assertComparable(baseline: Frame, current: Frame): void {
  if (!sameSize(baseline, current)) {
    throw new Error(
      `detector: frame size mismatch (${baseline.width}x${baseline.height} vs ${current.width}x${current.height})`,
    );
  }
}

/**
 * One pass over the frame pair producing everything any detector needs.
 *
 * All of it is measured against the baseline captured the instant the prompt
 * appeared, which is the whole point: a red sofa that was already in shot is
 * part of the baseline and earns nothing, while a red mug lifted into view is
 * scored on its own merits.
 */
export function analyseChange(
  baseline: Frame,
  current: Frame,
  opts: AnalyseOptions = {},
): ChangeAnalysis {
  assertComparable(baseline, current);
  const threshold = opts.changeThreshold ?? DEFAULT_CHANGE_THRESHOLD;
  const colors = opts.colors ?? [];
  const { width, height } = current;

  let totalWeight = 0;
  let changedWeight = 0;
  let changedLuma = 0;
  let baselineLuma = 0;
  let frameLuma = 0;
  let darkWeight = 0;
  const darkBelow = opts.darkBelow ?? -1;
  const colorWeights = colors.map(() => 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const w = roiWeight(x, y, width, height);
      totalWeight += w;

      const r = current.data[i]!;
      const g = current.data[i + 1]!;
      const b = current.data[i + 2]!;
      const luma = relativeLuminance(r, g, b);
      frameLuma += luma * w;
      if (luma <= darkBelow) darkWeight += w;

      const br = baseline.data[i]!;
      const bg = baseline.data[i + 1]!;
      const bb = baseline.data[i + 2]!;
      const delta = (Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb)) / 3;
      if (delta <= threshold) continue;

      changedWeight += w;
      changedLuma += luma * w;
      baselineLuma += relativeLuminance(br, bg, bb) * w;

      if (colors.length > 0) {
        const hsv = rgbToHsv(r, g, b);
        for (let c = 0; c < colors.length; c++) {
          if (matchesColor(colors[c]!, hsv)) colorWeights[c]! += w;
        }
      }
    }
  }

  const colorShare = new Map<ColorKey, number>();
  for (let c = 0; c < colors.length; c++) {
    colorShare.set(colors[c]!, changedWeight === 0 ? 0 : colorWeights[c]! / changedWeight);
  }

  return {
    changeRatio: totalWeight === 0 ? 0 : changedWeight / totalWeight,
    changedLuminance: changedWeight === 0 ? 0 : changedLuma / changedWeight,
    baselineLuminance: changedWeight === 0 ? 0 : baselineLuma / changedWeight,
    frameLuminance: totalWeight === 0 ? 0 : frameLuma / totalWeight,
    darkShare: totalWeight === 0 ? 0 : darkWeight / totalWeight,
    colorShare,
  };
}

/** "Did anything meaningfully enter or move in the frame?" */
export function detectChange(baseline: Frame, current: Frame, opts: AnalyseOptions = {}): number {
  return analyseChange(baseline, current, { ...opts, colors: [] }).changeRatio;
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

export interface ColorDetectorOptions extends AnalyseOptions {
  target: ColorKey;
  /** Share of the changed region that must be the target colour. */
  minShare?: number;
  /** Weighted fraction of the frame that must have changed at all. */
  minChange?: number;
}

/** Verifies "show me something <colour>". */
export function detectColorObject(
  baseline: Frame,
  current: Frame,
  opts: ColorDetectorOptions,
): DetectionResult {
  const minShare = opts.minShare ?? DEFAULT_MIN_SHARE;
  const minChange = opts.minChange ?? DEFAULT_MIN_CHANGE;
  const analysis = analyseChange(baseline, current, { ...opts, colors: [opts.target] });
  const share = analysis.colorShare.get(opts.target) ?? 0;
  const metrics = {
    changeRatio: analysis.changeRatio,
    share,
    coverage: share * analysis.changeRatio,
  };

  if (analysis.changeRatio < minChange) {
    return {
      matched: false,
      confidence: 0,
      progress: clamp01(analysis.changeRatio / minChange) * 0.3,
      reason: 'Hold the object up so the camera can see it change.',
      metrics,
    };
  }
  if (share < minShare) {
    return {
      matched: false,
      confidence: clamp01(share / minShare) * 0.5,
      progress: 0.3 + 0.7 * clamp01(share / minShare) * 0.9,
      reason: `That does not read as ${opts.target} — try filling more of the frame.`,
      metrics,
    };
  }

  const shareScore = clamp01((share - minShare) / (1 - minShare));
  const sizeScore = clamp01(analysis.changeRatio / 0.25);
  return {
    matched: true,
    confidence: clamp01(0.5 + 0.35 * shareScore + 0.15 * sizeScore),
    progress: 1,
    reason: `Locked on — ${Math.round(share * 100)}% of what you showed is ${opts.target}.`,
    metrics,
  };
}

export interface ColorPairDetectorOptions extends AnalyseOptions {
  targets: readonly [ColorKey, ColorKey];
  /** Share each colour must reach on its own. */
  minShare?: number;
  minChange?: number;
}

/** Verifies "show me one thing with both of these colours on it". */
export function detectColorPair(
  baseline: Frame,
  current: Frame,
  opts: ColorPairDetectorOptions,
): DetectionResult {
  const minShare = opts.minShare ?? 0.14;
  const minChange = opts.minChange ?? DEFAULT_MIN_CHANGE;
  const [first, second] = opts.targets;
  const analysis = analyseChange(baseline, current, { ...opts, colors: opts.targets });
  const a = analysis.colorShare.get(first) ?? 0;
  const b = analysis.colorShare.get(second) ?? 0;
  const metrics = { changeRatio: analysis.changeRatio, [`${first}Share`]: a, [`${second}Share`]: b };

  if (analysis.changeRatio < minChange) {
    return {
      matched: false,
      confidence: 0,
      progress: clamp01(analysis.changeRatio / minChange) * 0.3,
      reason: 'Hold it up so the camera can see it.',
      metrics,
    };
  }

  const weakest = Math.min(a, b);
  if (weakest < minShare) {
    const missing = a < b ? first : second;
    return {
      matched: false,
      confidence: clamp01(weakest / minShare) * 0.5,
      progress: 0.3 + 0.6 * clamp01(weakest / minShare),
      reason: `Not enough ${missing} in shot.`,
      metrics,
    };
  }
  return {
    matched: true,
    confidence: clamp01(0.55 + 0.45 * clamp01((weakest - minShare) / 0.3)),
    progress: 1,
    reason: `Both ${first} and ${second} — that counts.`,
    metrics,
  };
}

export interface CoverageDetectorOptions extends AnalyseOptions {
  /** Weighted fraction of the frame the new thing must occupy. */
  minChange: number;
}

/** Verifies "get it right up to the lens" — something must fill the view. */
export function detectCoverage(
  baseline: Frame,
  current: Frame,
  opts: CoverageDetectorOptions,
): DetectionResult {
  const analysis = analyseChange(baseline, current, { ...opts, colors: [] });
  const metrics = { changeRatio: analysis.changeRatio };
  const progress = clamp01(analysis.changeRatio / opts.minChange);

  if (analysis.changeRatio < opts.minChange) {
    return {
      matched: false,
      confidence: 0,
      progress,
      reason: `Closer — it is covering ${Math.round(analysis.changeRatio * 100)}% of the frame.`,
      metrics,
    };
  }
  return {
    matched: true,
    confidence: clamp01(0.6 + 0.4 * (analysis.changeRatio - opts.minChange) / (1 - opts.minChange)),
    progress: 1,
    reason: 'That is the whole screen. Counted.',
    metrics,
  };
}

export interface LuminanceDetectorOptions extends AnalyseOptions {
  mode: 'darker' | 'brighter';
  /**
   * How many times the baseline's brightness the new thing must reach: below
   * `ratio` for darker, above it for brighter.
   */
  ratio: number;
  minChange?: number;
}

/**
 * Smallest absolute luminance gap that still counts, so sensor noise in a very
 * dim room cannot satisfy the ratio on its own.
 */
const MIN_LUMINANCE_DELTA = 0.02;

/**
 * Verifies "show me something darker / brighter than what is behind you".
 *
 * The comparison is a *ratio* against the same pixels in the baseline, not a
 * fixed offset. Relative luminance is heavily non-linear and most rooms sit
 * between 0.05 and 0.25, so a fixed offset large enough to mean anything in a
 * bright room is unreachable in a dim one — you cannot be 0.12 darker than a
 * room that is only 0.10 above black. A ratio behaves the same in both.
 */
export function detectLuminance(
  baseline: Frame,
  current: Frame,
  opts: LuminanceDetectorOptions,
): DetectionResult {
  const minChange = opts.minChange ?? 0.06;
  const analysis = analyseChange(baseline, current, { ...opts, colors: [] });
  const before = analysis.baselineLuminance;
  const after = analysis.changedLuminance;
  const delta = opts.mode === 'darker' ? before - after : after - before;
  const target = before * opts.ratio;
  const metrics = { changeRatio: analysis.changeRatio, before, after, delta };

  if (analysis.changeRatio < minChange) {
    return {
      matched: false,
      confidence: 0,
      progress: clamp01(analysis.changeRatio / minChange) * 0.3,
      reason: 'Hold it up so it fills more of the frame.',
      metrics,
    };
  }

  // How far the gap has closed towards the ratio the round asks for.
  const needed = Math.abs(before - target);
  const progress = 0.3 + 0.7 * clamp01(needed === 0 ? 0 : delta / needed);
  const withinRatio = opts.mode === 'darker' ? after <= target : after >= target;
  const meets = withinRatio && delta >= MIN_LUMINANCE_DELTA;

  if (!meets) {
    return {
      matched: false,
      confidence: clamp01(delta / Math.max(needed, 0.001)) * 0.5,
      progress,
      reason:
        opts.mode === 'darker'
          ? 'Not dark enough against your room.'
          : 'Not bright enough against your room.',
      metrics,
    };
  }
  return {
    matched: true,
    confidence: clamp01(0.55 + 0.45 * clamp01((delta - needed) / Math.max(needed, 0.05))),
    progress: 1,
    reason: opts.mode === 'darker' ? 'Properly dark. Counted.' : 'Properly bright. Counted.',
    metrics,
  };
}

export interface DarknessDetectorOptions extends AnalyseOptions {
  /** Luminance, 0..1, at or below which a pixel counts as blacked out. */
  maxLuminance: number;
  /** Fraction of the frame that must be that dark. */
  minDarkShare?: number;
  minChange?: number;
}

/**
 * Verifies "black out your camera".
 *
 * The criterion is the *share* of the frame that is dark, not its average
 * brightness. A mean would let a book held over two thirds of the lens average
 * its way to a pass while the rest of the room is still plainly visible.
 */
export function detectDarkness(
  baseline: Frame,
  current: Frame,
  opts: DarknessDetectorOptions,
): DetectionResult {
  const minChange = opts.minChange ?? 0.25;
  const minDarkShare = opts.minDarkShare ?? 0.94;
  const analysis = analyseChange(baseline, current, {
    ...opts,
    colors: [],
    darkBelow: opts.maxLuminance,
  });
  const metrics = {
    changeRatio: analysis.changeRatio,
    darkShare: analysis.darkShare,
    luminance: analysis.frameLuminance,
  };
  const progress = clamp01(
    Math.min(analysis.changeRatio / minChange, analysis.darkShare / minDarkShare),
  );

  if (analysis.changeRatio < minChange) {
    return {
      matched: false,
      confidence: 0,
      progress,
      reason: 'Cover the lens — the camera can still see your room.',
      metrics,
    };
  }
  if (analysis.darkShare < minDarkShare) {
    return {
      matched: false,
      confidence: clamp01(analysis.darkShare) * 0.5,
      progress,
      reason: `Still some light getting through — ${Math.round(analysis.darkShare * 100)}% covered.`,
      metrics,
    };
  }
  return {
    matched: true,
    confidence: clamp01(0.6 + 0.4 * (analysis.darkShare - minDarkShare) / (1 - minDarkShare)),
    progress: 1,
    reason: 'Lights out. Counted.',
    metrics,
  };
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}
