import type { Frame } from './frame.js';
import type { ColorKey } from './color.js';
import {
  detectColorObject,
  detectColorPair,
  detectCoverage,
  detectDarkness,
  detectLuminance,
  type DetectionResult,
} from './detect.js';

/**
 * What a challenge declares about how a camera can decide it.
 *
 * Every kind here has to be decidable by a pure function over two frames, and
 * therefore re-runnable by the server on the frame the player actually sent.
 * A challenge that needs more than that is `peer`-judged instead — see
 * `challenges.ts`.
 */
export type DetectorSpec =
  | { kind: 'color'; target: ColorKey; minShare?: number; minChange?: number }
  | { kind: 'colorPair'; targets: readonly [ColorKey, ColorKey]; minShare?: number }
  | { kind: 'coverage'; minChange: number }
  | { kind: 'luminance'; mode: 'darker' | 'brighter'; ratio: number }
  | { kind: 'darkness'; maxLuminance: number };

/**
 * The single place a detector spec turns into a verdict.
 *
 * The client calls it several times a second to drive the on-screen meter; the
 * server calls it once, on the submitted frame, to decide the round. Both run
 * exactly the same code, which is what makes the preview honest and the score
 * impossible to fake from a modified client.
 */
export function runDetector(
  spec: DetectorSpec,
  baseline: Frame,
  current: Frame,
): DetectionResult {
  switch (spec.kind) {
    case 'color':
      return detectColorObject(baseline, current, {
        target: spec.target,
        ...(spec.minShare !== undefined ? { minShare: spec.minShare } : {}),
        ...(spec.minChange !== undefined ? { minChange: spec.minChange } : {}),
      });
    case 'colorPair':
      return detectColorPair(baseline, current, {
        targets: spec.targets,
        ...(spec.minShare !== undefined ? { minShare: spec.minShare } : {}),
      });
    case 'coverage':
      return detectCoverage(baseline, current, { minChange: spec.minChange });
    case 'luminance':
      return detectLuminance(baseline, current, { mode: spec.mode, ratio: spec.ratio });
    case 'darkness':
      return detectDarkness(baseline, current, { maxLuminance: spec.maxLuminance });
  }
}

/** Colours a spec is about, for the UI to show as swatches. Empty for the rest. */
export function detectorColors(spec: DetectorSpec): readonly ColorKey[] {
  switch (spec.kind) {
    case 'color':
      return [spec.target];
    case 'colorPair':
      return spec.targets;
    default:
      return [];
  }
}
