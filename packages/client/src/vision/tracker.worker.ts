import { FilesetResolver, HandLandmarker, ObjectDetector, PoseLandmarker } from '@mediapipe/tasks-vision';
import { nearHand, type Box, type VisionRequest, type VisionResponse } from './types.js';

// A classic worker supports MediaPipe's importScripts WASM loader. Inference is
// synchronous here, never on React's thread. IMAGE mode isolates the two cameras.
let pose: PoseLandmarker | undefined;
let hands: HandLandmarker | undefined;
let objects: ObjectDetector | undefined;
const send = (message: VisionResponse) => postMessage(message);

async function init(base: string) {
  const files = await FilesetResolver.forVisionTasks(`${base}wasm`);
  pose = await PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}pose.task`, delegate: 'CPU' },
    canvas: new OffscreenCanvas(320, 240), runningMode: 'IMAGE', numPoses: 1,
    minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6,
    outputSegmentationMasks: false,
  });
  hands = await HandLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}hands.task`, delegate: 'CPU' },
    canvas: new OffscreenCanvas(320, 240), runningMode: 'IMAGE', numHands: 2,
    minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6,
  });
  objects = await ObjectDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${base}objects.tflite`, delegate: 'CPU' },
    canvas: new OffscreenCanvas(320, 240), runningMode: 'IMAGE',
    scoreThreshold: 0.6, maxResults: 5, categoryDenylist: ['person'],
  });
  send({ type: 'ready' });
}

onmessage = (event: MessageEvent<VisionRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    void init(request.base).catch(() => {
      pose?.close(); hands?.close(); objects?.close();
      send({ type: 'error' });
    });
    return;
  }
  const { bitmap, side } = request;
  try {
    if (!pose || !hands || !objects) throw new Error('Tracker not ready');
    const body = pose.detect(bitmap).landmarks[0] ?? [];
    const fingers = hands.detect(bitmap).landmarks;
    const detected = objects.detect(bitmap).detections.flatMap((d) => {
      const rect = d.boundingBox, category = d.categories[0];
      if (!rect || !category) return [];
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      const box: Box = [clamp(rect.originX / bitmap.width), clamp(rect.originY / bitmap.height),
        clamp((rect.originX + rect.width) / bitmap.width), clamp((rect.originY + rect.height) / bitmap.height)];
      if (box[2] <= box[0] || box[3] <= box[1]) return [];
      return [{ label: category.categoryName, confidence: category.score, box, nearHand: nearHand(box, fingers) }];
    });
    send({ type: 'scene', side, scene: { pose: body, hands: fingers, objects: detected } });
  } catch { send({ type: 'error' }); }
  finally { bitmap.close(); }
};
