import { FilesetResolver, HandLandmarker, ObjectDetector, PoseLandmarker } from '@mediapipe/tasks-vision';
import { nearHand, type Box, type VisionRequest, type VisionResponse } from './types.js';

/*
 * The tracker, off the main thread.
 *
 * Three things make this fast enough to look live rather than look broken.
 * It asks for the GPU delegate first and only falls back to CPU when the
 * machine has no WebGL to give it. It runs the landmarkers in VIDEO mode, so
 * MediaPipe tracks between frames instead of re-detecting a stranger every
 * time — cheaper per frame and far steadier from frame to frame. And the
 * object detector, which is the expensive one and the one whose subject barely
 * moves, runs only on the frames the host asks it to, with the last result
 * carried forward in between.
 *
 * A classic worker supports MediaPipe's importScripts WASM loader.
 */
let pose: PoseLandmarker | undefined;
let hands: HandLandmarker | undefined;
let objects: ObjectDetector | undefined;
let lastObjects: { label: string; confidence: number; box: Box }[] = [];
/** VIDEO mode requires timestamps that never repeat and never go backwards. */
let lastStamp = 0;

const send = (message: VisionResponse) => postMessage(message);

async function build(base: string, delegate: 'GPU' | 'CPU') {
  const files = await FilesetResolver.forVisionTasks(`${base}wasm`);
  const common = { delegate } as const;
  const [p, h, o] = await Promise.all([
    PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${base}pose.task`, ...common },
      canvas: new OffscreenCanvas(320, 240), runningMode: 'VIDEO', numPoses: 1,
      // Lower than a still photo would want: in VIDEO mode a confident first
      // detection is tracked forward, and a bar set for single frames drops the
      // skeleton every time somebody turns side-on.
      minPoseDetectionConfidence: 0.45, minPosePresenceConfidence: 0.45,
      minTrackingConfidence: 0.45, outputSegmentationMasks: false,
    }),
    HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${base}hands.task`, ...common },
      canvas: new OffscreenCanvas(320, 240), runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: 0.45, minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.45,
    }),
    ObjectDetector.createFromOptions(files, {
      baseOptions: { modelAssetPath: `${base}objects.tflite`, ...common },
      canvas: new OffscreenCanvas(320, 240), runningMode: 'VIDEO',
      scoreThreshold: 0.42, maxResults: 6, categoryDenylist: ['person'],
    }),
  ]);
  pose = p; hands = h; objects = o;
}

function close() {
  pose?.close(); hands?.close(); objects?.close();
  pose = hands = objects = undefined;
}

async function init(base: string) {
  try {
    await build(base, 'GPU');
    send({ type: 'ready', backend: 'gpu' });
  } catch {
    // A machine without WebGL in workers still gets tracking, just slower.
    close();
    await build(base, 'CPU');
    send({ type: 'ready', backend: 'cpu' });
  }
}

function boxesFrom(bitmap: ImageBitmap, stamp: number) {
  const found = objects!.detectForVideo(bitmap, stamp).detections.flatMap((d) => {
    const rect = d.boundingBox, category = d.categories[0];
    if (!rect || !category) return [];
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const box: Box = [clamp(rect.originX / bitmap.width), clamp(rect.originY / bitmap.height),
      clamp((rect.originX + rect.width) / bitmap.width), clamp((rect.originY + rect.height) / bitmap.height)];
    if (box[2] - box[0] < 0.02 || box[3] - box[1] < 0.02) return [];
    return [{ label: category.categoryName, confidence: category.score, box }];
  });
  return found;
}

onmessage = (event: MessageEvent<VisionRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    lastStamp = 0;
    lastObjects = [];
    void init(request.base).catch(() => {
      close();
      send({ type: 'error' });
    });
    return;
  }
  const { bitmap } = request;
  const started = performance.now();
  try {
    if (!pose || !hands || !objects) throw new Error('Tracker not ready');
    const stamp = (lastStamp = Math.max(lastStamp + 1, Math.round(request.at)));
    const body = pose.detectForVideo(bitmap, stamp).landmarks[0] ?? [];
    const fingers = hands.detectForVideo(bitmap, stamp).landmarks;
    if (request.objects) lastObjects = boxesFrom(bitmap, stamp);
    send({
      type: 'scene',
      costMs: performance.now() - started,
      scene: {
        pose: body,
        hands: fingers,
        objects: lastObjects.map((o) => ({ ...o, nearHand: nearHand(o.box, fingers) })),
        at: request.at,
      },
    });
  } catch { send({ type: 'error' }); }
  finally { bitmap.close(); }
};
