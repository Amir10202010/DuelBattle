import jpeg from 'jpeg-js';

export const FRAME_W = 240;
export const FRAME_H = 180;

export type Rgb = [number, number, number];

export const GREY: Rgb = [92, 94, 98];
export const RED: Rgb = [206, 32, 32];
export const BLUE: Rgb = [30, 70, 208];
export const GREEN: Rgb = [40, 168, 72];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: Rgb;
}

/** Builds a raw RGBA scene at webcam-ish dimensions. */
export function scene(background: Rgb, rects: Rect[] = [], width = FRAME_W, height = FRAME_H): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = background[0];
    data[i * 4 + 1] = background[1];
    data[i * 4 + 2] = background[2];
    data[i * 4 + 3] = 255;
  }
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const i = (y * width + x) * 4;
        data[i] = rect.color[0];
        data[i + 1] = rect.color[1];
        data[i + 2] = rect.color[2];
        data[i + 3] = 255;
      }
    }
  }
  return data;
}

export function jpegDataUrl(
  rgba: Buffer,
  quality = 70,
  width = FRAME_W,
  height = FRAME_H,
): string {
  const encoded = jpeg.encode({ data: rgba, width, height }, quality);
  return `data:image/jpeg;base64,${encoded.data.toString('base64')}`;
}

/** An empty room shot: the "before" frame for a round. */
export function emptyRoomFrame(quality = 60): string {
  return jpegDataUrl(
    scene(GREY, [
      // Some static furniture, including something red that never moves.
      { x: 0, y: 120, w: 60, h: 60, color: RED },
      { x: 190, y: 0, w: 50, h: 180, color: [140, 120, 100] },
    ]),
    quality,
  );
}

/** The same room with an object held up in the middle of frame. */
export function heldObjectFrame(color: Rgb, quality = 75): string {
  return jpegDataUrl(
    scene(GREY, [
      { x: 0, y: 120, w: 60, h: 60, color: RED },
      { x: 190, y: 0, w: 50, h: 180, color: [140, 120, 100] },
      { x: 80, y: 50, w: 80, h: 80, color },
    ]),
    quality,
  );
}
