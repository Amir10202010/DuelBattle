/**
 * Not a test: a measurement. Prints the per-pixel change signal a still room
 * produces versus a real object, at several exposures, so the change threshold
 * can be chosen from numbers rather than from taste.
 */
import { decodeEvidence } from '../src/verify.js';
import {
  FURNITURE,
  GREY,
  realisticEmptyRoom,
  realisticHeld,
  scene,
  type SceneOptions,
} from './helpers.js';
import { colorSwatch } from '@battle/shared';

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function stats(a: ReturnType<typeof decodeEvidence>, b: ReturnType<typeof decodeEvidence>) {
  const deltas: number[] = [];
  for (let i = 0; i < a.data.length; i += 4) {
    deltas.push(
      (Math.abs(a.data[i]! - b.data[i]!) +
        Math.abs(a.data[i + 1]! - b.data[i + 1]!) +
        Math.abs(a.data[i + 2]! - b.data[i + 2]!)) / 3,
    );
  }
  deltas.sort((x, y) => x - y);
  const at = (p: number) => deltas[Math.floor(deltas.length * p)]!.toFixed(1);
  return { p50: at(0.5), p90: at(0.9), p99: at(0.99), max: deltas[deltas.length - 1]!.toFixed(1) };
}

function meanLevel(frame: ReturnType<typeof decodeEvidence>) {
  let sum = 0;
  for (let i = 0; i < frame.data.length; i += 4) {
    sum += (frame.data[i]! + frame.data[i + 1]! + frame.data[i + 2]!) / 3;
  }
  return (sum / (frame.data.length / 4)).toFixed(1);
}

const rooms: [string, SceneOptions][] = [
  ['good webcam      ', { noise: 6, vignette: 0.15, exposure: 1, seed: 1 }],
  ['cheap laptop cam ', { noise: 16, vignette: 0.35, exposure: 0.95, seed: 2 }],
  ['dim evening room ', { noise: 14, vignette: 0.3, exposure: 0.55, seed: 3 }],
  ['very dim room    ', { noise: 14, vignette: 0.3, exposure: 0.35, seed: 5 }],
  ['bright by window ', { noise: 8, vignette: 0.2, exposure: 1.35, seed: 4 }],
];

console.log('room               mean  | still-room delta (noise)      | green object delta');
for (const [label, room] of rooms) {
  const baseline = decodeEvidence(realisticEmptyRoom(room));
  const still = decodeEvidence(realisticEmptyRoom({ ...room, seed: (room.seed ?? 0) + 20 }));
  const held = decodeEvidence(
    realisticHeld(
      scene(GREY, [...FURNITURE, { x: 80, y: 50, w: 80, h: 80, color: hexToRgb(colorSwatch('green')) }]),
      { ...room, seed: (room.seed ?? 0) + 30 },
    ),
  );
  const noise = stats(baseline, still);
  const signal = stats(baseline, held);
  console.log(
    `${label} ${meanLevel(baseline).padStart(5)} | p90 ${noise.p90.padStart(5)} p99 ${noise.p99.padStart(5)} max ${noise.max.padStart(5)} | p90 ${signal.p90.padStart(5)} p99 ${signal.p99.padStart(5)}`,
  );
}
