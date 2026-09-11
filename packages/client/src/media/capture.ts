import { ANALYSIS_HEIGHT, ANALYSIS_WIDTH, type Frame } from '@battle/shared';

/**
 * Every capture path crops to the same 4:3 window, so the frame the detector
 * scores, the frame the opponent sees and the snapshot kept as evidence all
 * show exactly the same field of view.
 */
export const LIVE_FRAME_WIDTH = 240;
export const LIVE_FRAME_HEIGHT = 180;
export const EVIDENCE_WIDTH = 480;
export const EVIDENCE_HEIGHT = 360;

export const LIVE_FRAME_QUALITY = 0.6;
export const EVIDENCE_QUALITY = 0.78;

/** Draws the largest centred 4:3 crop of the source into the whole canvas. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const sw = video.videoWidth;
  const sh = video.videoHeight;
  const targetAspect = width / height;
  const sourceAspect = sw / sh;

  let cropW = sw;
  let cropH = sh;
  if (sourceAspect > targetAspect) cropW = sh * targetAspect;
  else cropH = sw / targetAspect;

  ctx.drawImage(video, (sw - cropW) / 2, (sh - cropH) / 2, cropW, cropH, 0, 0, width, height);
}

export function isVideoReady(video: HTMLVideoElement | null): video is HTMLVideoElement {
  return Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);
}

export class FrameCapture {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D | null;

  constructor(
    private readonly width: number,
    private readonly height: number,
    readFrequently = false,
  ) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      ...(readFrequently ? { willReadFrequently: true } : {}),
    });
  }

  /** Returns a JPEG data URL, or null if the video has no frame to give yet. */
  toDataUrl(video: HTMLVideoElement | null, quality: number): string | null {
    if (!this.ctx || !isVideoReady(video)) return null;
    drawCover(this.ctx, video, this.width, this.height);
    return this.canvas.toDataURL('image/jpeg', quality);
  }

  /** Returns raw pixels for the detectors, or null if no frame is available. */
  toFrame(video: HTMLVideoElement | null): Frame | null {
    if (!this.ctx || !isVideoReady(video)) return null;
    drawCover(this.ctx, video, this.width, this.height);
    const image = this.ctx.getImageData(0, 0, this.width, this.height);
    return { width: image.width, height: image.height, data: image.data };
  }
}

export const createLiveCapture = () => new FrameCapture(LIVE_FRAME_WIDTH, LIVE_FRAME_HEIGHT);
export const createEvidenceCapture = () => new FrameCapture(EVIDENCE_WIDTH, EVIDENCE_HEIGHT);
export const createAnalysisCapture = () => new FrameCapture(ANALYSIS_WIDTH, ANALYSIS_HEIGHT, true);
