import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_HEIGHT,
  ANALYSIS_WIDTH,
} from '@battle/shared';
import {
  EVIDENCE_HEIGHT,
  EVIDENCE_WIDTH,
  LIVE_FRAME_FALLBACK_QUALITY,
  LIVE_FRAME_HEIGHT,
  LIVE_FRAME_QUALITY,
  LIVE_FRAME_WIDTH,
  coverCrop,
} from '../src/media/capture.js';

describe('coverCrop', () => {
  it('takes the whole frame when the aspect ratios already match', () => {
    expect(coverCrop(640, 480, 240, 180)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });

  it('trims the sides of a widescreen camera', () => {
    const crop = coverCrop(1280, 720, 240, 180);
    expect(crop.height).toBe(720);
    expect(crop.width).toBe(960);
    expect(crop.x).toBe(160);
    expect(crop.y).toBe(0);
  });

  it('trims the top and bottom of a tall camera', () => {
    const crop = coverCrop(480, 640, 240, 180);
    expect(crop.width).toBe(480);
    expect(crop.height).toBe(360);
    expect(crop.y).toBe(140);
  });

  it('stays inside the source frame', () => {
    for (const [w, h] of [
      [1920, 1080],
      [640, 480],
      [320, 568],
      [1440, 1440],
    ] as const) {
      const crop = coverCrop(w, h, 240, 180);
      expect(crop.x).toBeGreaterThanOrEqual(0);
      expect(crop.y).toBeGreaterThanOrEqual(0);
      expect(crop.x + crop.width).toBeLessThanOrEqual(w + 1e-9);
      expect(crop.y + crop.height).toBeLessThanOrEqual(h + 1e-9);
    }
  });

  /**
   * The three capture sizes must agree on what part of the camera they are
   * looking at, or the detector would score a different picture than the one
   * the opponent judges.
   */
  it('produces the same window for every capture size', () => {
    const sizes = [
      [LIVE_FRAME_WIDTH, LIVE_FRAME_HEIGHT],
      [EVIDENCE_WIDTH, EVIDENCE_HEIGHT],
      [ANALYSIS_WIDTH, ANALYSIS_HEIGHT],
    ] as const;
    for (const [w, h] of [
      [1280, 720],
      [640, 480],
      [1080, 1920],
    ] as const) {
      const crops = sizes.map(([tw, th]) => coverCrop(w, h, tw, th));
      for (const crop of crops) expect(crop).toEqual(crops[0]);
    }
  });
});

describe('frame size budget', () => {
  /**
   * A frame the server refuses is worse than no frame: it costs a round trip
   * and, before this, put an error on screen several times a second.
   */
  it('is documented by the constants the sender actually uses', () => {
    expect(LIVE_FRAME_FALLBACK_QUALITY).toBeLessThan(LIVE_FRAME_QUALITY);
    expect(LIVE_FRAME_QUALITY).toBeGreaterThan(0);
    expect(LIVE_FRAME_QUALITY).toBeLessThan(1);
  });

  it('captures live frames at a lower resolution than evidence', () => {
    // Evidence is looked at; live frames are glanced at and thrown away.
    expect(LIVE_FRAME_WIDTH).toBeLessThan(EVIDENCE_WIDTH);
    expect(LIVE_FRAME_WIDTH / LIVE_FRAME_HEIGHT).toBeCloseTo(EVIDENCE_WIDTH / EVIDENCE_HEIGHT, 5);
  });
});
