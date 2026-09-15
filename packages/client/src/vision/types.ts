export type Side = 'self' | 'peer';
export interface Point { x: number; y: number; visibility?: number }
export type Box = [number, number, number, number];
export interface TrackedObject { label: string; confidence: number; box: Box; nearHand: boolean }
export interface Scene {
  pose: Point[];
  hands: Point[][];
  objects: TrackedObject[];
}
export type VisionRequest = { type: 'init'; base: string } |
  { type: 'frame'; side: Side; bitmap: ImageBitmap };
export type VisionResponse = { type: 'ready' } | { type: 'error' } |
  { type: 'scene'; side: Side; scene: Scene };

export const BODY_LINKS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32],
] as const;
export const HAND_LINKS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
] as const;

/** Geometric proximity is a hint, never proof that the object is being held. */
export function nearHand(box: Box, hands: Point[][]): boolean {
  return hands.some((hand) => hand.some((p) => p.x >= box[0] - 0.035 && p.x <= box[2] + 0.035 &&
    p.y >= box[1] - 0.035 && p.y <= box[3] + 0.035));
}

export function visible(point: Point | undefined): point is Point {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && (point.visibility ?? 1) >= 0.6);
}
