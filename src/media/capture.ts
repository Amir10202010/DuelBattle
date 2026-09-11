import { ANALYSIS_HEIGHT, ANALYSIS_WIDTH, type Frame } from '../../shared/vision/frame';

/**
 * Every capture path crops to the same 4:3 window, so the frame the detector
 * scores, the frame the opponent sees and the snapshot kept as evidence all
 * show exactly the same field of view.
 */
export const EVIDENCE_WIDTH = 480;
export const EVIDENCE_HEIGHT = 360;

export const EVIDENCE_QUALITY = 0.65;

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The largest centred crop of a source frame that matches the target aspect
 * ratio. Shared by all three capture sizes, which is what guarantees the
 * detector, the opponent's view and the stored evidence all show the same thing.
 */
export function coverCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Crop {
  const targetAspect = targetWidth / targetHeight;
  const sourceAspect = sourceWidth / sourceHeight;

  const width = sourceAspect > targetAspect ? sourceHeight * targetAspect : sourceWidth;
  const height = sourceAspect > targetAspect ? sourceHeight : sourceWidth / targetAspect;
  return {
    x: (sourceWidth - width) / 2,
    y: (sourceHeight - height) / 2,
    width,
    height,
  };
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const crop = coverCrop(video.videoWidth, video.videoHeight, width, height);
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
}

function isVideoReady(video: HTMLVideoElement | null): video is HTMLVideoElement {
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

export const createEvidenceCapture = () => new FrameCapture(EVIDENCE_WIDTH, EVIDENCE_HEIGHT);
export const createAnalysisCapture = () => new FrameCapture(ANALYSIS_WIDTH, ANALYSIS_HEIGHT, true);
