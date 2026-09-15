import { findColorRegions, type ColorRegion } from './regions.js';
import type { Frame } from './frame.js';
import { sameSize } from './frame.js';
import { matchesColor, relativeLuminance, rgbToHsv, type ColorKey } from './color.js';

export interface DetectionResult {
  matched: boolean;
  region?: ColorRegion;
  score?: number;
  /**
   * Set when the conditions make this round impossible to settle either way —
   * asking for something darker than a room that is already almost black, say.
   * The server skips these rounds without assigning a winner.
   */
  undecidable?: true;
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

/**
 * The weight map depends only on the frame size, which never changes at run
 * time, so it is computed once instead of a sqrt and a pow per pixel per
 * sample. On this machine that is most of the detector's cost; on a phone
 * running it five times a second alongside JPEG encoding, it is worth more.
 */
const weightMaps = new Map<string, Float32Array>();

function weightMapFor(width: number, height: number): Float32Array {
  const key = `${width}x${height}`;
  const cached = weightMaps.get(key);
  if (cached) return cached;

  const map = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) map[y * width + x] = roiWeight(x, y, width, height);
  }
  // Only ever one size in practice; the bound is here so a resize storm cannot
  // grow this without limit.
  if (weightMaps.size > 4) weightMaps.clear();
  weightMaps.set(key, map);
  return map;
}

/**
 * How much a pixel must differ from the baseline to count as changed, as a
 * fraction of how bright the room is.
 *
 * A fixed number cannot work. Measured across simulated cameras, a green object
 * held against a grey wall produces a per-pixel delta around 38 in a well-lit
 * room and around 20 in a dim one, while sensor noise runs at 4 and 9
 * respectively. One threshold that clears the noise in a bright room sits above
 * the *signal* in a dark one — which is exactly what happened: in an evening
 * room the game could not see a green object at all.
 *
 * 0.35 of the room's mean level clears the noise and stays under the signal in
 * every room measured, down to the point where a camera genuinely cannot tell
 * the two apart. In a normally-lit room it works out at about 32, which is
 * where this started.
 */
export const CHANGE_THRESHOLD_RATIO = 0.35;
/** Floors and ceilings, so a black or blown-out frame still behaves. */
export const MIN_CHANGE_THRESHOLD = 10;
export const MAX_CHANGE_THRESHOLD = 48;

/**
 * Mean channel level a "normally exposed" room sits at, and the range the
 * correction towards it is allowed to span.
 *
 * Hue survives exposure — scaling every channel by the same factor leaves both
 * hue and saturation untouched — which is why a green mug is still green in a
 * dim room. White and black are the exceptions: they are defined by how bright
 * a pixel is, so in an evening room a white mug reads as mid-grey and the game
 * would tell someone holding one up that it does not count. Correcting the
 * frame towards a reference exposure first makes white and black mean the same
 * thing in every room, and changes nothing for the colours that already did.
 */
const REFERENCE_LEVEL = 100;
const MIN_EXPOSURE_GAIN = 0.6;
const MAX_EXPOSURE_GAIN = 2.5;
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
  /**
   * Mean per-channel delta (0..255) above which a pixel counts as changed.
   * Derived from the baseline's brightness when not given, which is almost
   * always what you want.
   */
  changeThreshold?: number;
  /** Colours to measure. Left empty, no colour work is done at all. */
  colors?: readonly ColorKey[];
  /** Luminance below which a pixel counts towards `darkShare`. */
  darkBelow?: number;
}

/** Mean channel level, sampled. A quarter of the pixels is plenty for a mean. */
function meanLevel(frame: Frame): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < frame.data.length; i += 16) {
    sum += (frame.data[i]! + frame.data[i + 1]! + frame.data[i + 2]!) / 3;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/** The change threshold this room's lighting calls for. */
export function changeThresholdFor(baseline: Frame): number {
  const scaled = meanLevel(baseline) * CHANGE_THRESHOLD_RATIO;
  return Math.min(MAX_CHANGE_THRESHOLD, Math.max(MIN_CHANGE_THRESHOLD, scaled));
}

/** How far this room's exposure has to be corrected to read colours from it. */
export function exposureGainFor(baseline: Frame): number {
  const level = meanLevel(baseline);
  if (level <= 0) return MAX_EXPOSURE_GAIN;
  return Math.min(MAX_EXPOSURE_GAIN, Math.max(MIN_EXPOSURE_GAIN, REFERENCE_LEVEL / level));
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
  const threshold = opts.changeThreshold ?? changeThresholdFor(baseline);
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
  const weights = weightMapFor(width, height);
  const gain = colors.length > 0 ? exposureGainFor(baseline) : 1;

  for (let p = 0, i = 0; p < weights.length; p++, i += 4) {
    const w = weights[p]!;
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
      // Read the colour from an exposure-corrected pixel, so "white" means the
      // same thing in an evening room as it does by a window.
      const hsv = rgbToHsv(
        Math.min(255, r * gain),
        Math.min(255, g * gain),
        Math.min(255, b * gain),
      );
      for (let c = 0; c < colors.length; c++) {
        if (matchesColor(colors[c]!, hsv)) colorWeights[c]! += w;
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
  assertComparable(baseline, current);
  const regions = findColorRegions(baseline, current, opts.target,
    opts.changeThreshold ?? changeThresholdFor(baseline), exposureGainFor(baseline));
  const region = regions[0];
  const required = opts.minChange ?? 0.0012;
  const coverage = region?.coverage ?? 0;
  const matched = Boolean(region && coverage >= required);
  return {
    matched,
    confidence: matched ? 0.85 + 0.15 * Math.min(1, coverage / 0.015) : 0,
    progress: matched ? 1 : Math.min(0.9, coverage / required),
    score: matched ? region!.score : 0,
    ...(region ? { region } : {}),
    reason: matched ? 'Colour found.' : 'Bring the coloured object closer to the camera.',
    metrics: { coverage, changeRatio: coverage, share: region ? 1 : 0, colorFit: region?.score ?? 0 },
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

  // Whether any object could pass at all in this light, measured against what
  // is physically achievable rather than against the ratio. The darkest thing
  // in the world is luminance zero, so the largest gap a dark object can open
  // up is the room's own brightness; the brightest is one, and nothing can be
  // 2.2 times brighter than a room already past half of it.
  const reachable =
    opts.mode === 'darker'
      ? before >= MIN_LUMINANCE_DELTA
      : target <= 1 && 1 - before >= MIN_LUMINANCE_DELTA;
  if (analysis.changeRatio >= minChange && !reachable) {
    return {
      matched: false,
      undecidable: true,
      confidence: 0,
      progress: 0,
      reason: 'Too little light in here to call this one.',
      metrics,
    };
  }

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
