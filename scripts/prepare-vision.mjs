import { mkdir, readFile, writeFile, cp, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

// Fixed upstream versions and digests. Serve models from our own origin; no
// CDN scripts, runtime model downloads from third parties, or committed binaries.
const models = [
  ['pose.task', 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
    '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'],
  ['hands.task', 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'],
  ['objects.tflite', 'object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
    '0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb'],
];
const root = new URL('../', import.meta.url);
const destination = new URL('packages/client/public/vision-runtime/', root);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
await mkdir(destination, { recursive: true });
for (const [name, path, digest] of models) {
  const file = new URL(name, destination);
  try { if (hash(await readFile(file)) === digest) continue; } catch { /* First build. */ }
  let completed = false;
  for (let attempt = 0; attempt < 3 && !completed; attempt++) {
    try {
      const response = await globalThis.fetch(`https://storage.googleapis.com/mediapipe-models/${path}`, {
        signal: globalThis.AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 12_000_000 || hash(bytes) !== digest) throw new Error(`Model checksum mismatch: ${name}`);
      const temporary = new URL(`${name}.download`, destination);
      await writeFile(temporary, bytes);
      // Windows rename cannot replace an existing model after a version change.
      await rm(file, { force: true });
      await rename(temporary, file);
      completed = true;
    } catch (error) { if (attempt === 2) throw error; }
  }
}
await cp(new URL('node_modules/@mediapipe/tasks-vision/wasm/', root), new URL('wasm/', destination), { recursive: true });
// Prebundle a classic worker in development AND production. Vite's unbundled
// development modules cannot run in a classic importScripts-based worker.
await build({
  entryPoints: [fileURLToPath(new URL('packages/client/src/vision/tracker.worker.ts', root))],
  outfile: fileURLToPath(new URL('tracker.js', destination)),
  bundle: true, format: 'iife', target: 'es2022', minify: true, legalComments: 'eof',
});
process.stdout.write(`Vision models verified: ${fileURLToPath(destination)}\n`);
