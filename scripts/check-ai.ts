import { existsSync, readFileSync } from 'node:fs';
import { GeminiPhotoJudge } from '../server/ai-judge';
import { YoloObjectDetector } from '../server/object-detector';
import { AI_CHALLENGES } from '../shared/challenges';
import { decidePhotos } from '../shared/judging';
import jpeg from 'jpeg-js';

if (existsSync('.env')) process.loadEnvFile('.env');
const keys = process.env.GEMINI_API_KEYS?.trim() || process.env.GEMINI_API_KEY?.trim();
const file = process.argv[2] || 'test-results/vision-smoke.jpg';
if (!keys || !existsSync(file)) {
  console.error(
    'Add Gemini keys to .env and run vision/smoke.py first, or supply a diagnostic JPEG path.',
  );
  process.exitCode = 1;
} else {
  const judge = new GeminiPhotoJudge(
    keys,
    process.env.GEMINI_MODEL || undefined,
    fetch,
    new YoloObjectDetector(process.env.YOLO_URL || undefined, process.env.YOLO_SERVICE_TOKEN),
  );
  try {
    const result = await judge.judge({
      challenge: {
        ...AI_CHALLENGES[0],
        prompt: 'Show a bus in the photo',
        instructions:
          'Diagnostic only: identify the visible bus. Background vehicles count; no person needs to hold it.',
        color: undefined,
      },
      photos: [
        {
          playerId: 'diagnostic',
          image: `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`,
          contextImages: [],
        },
        {
          playerId: 'blank-control',
          image: `data:image/jpeg;base64,${jpeg.encode({ width: 480, height: 360, data: Buffer.alloc(480 * 360 * 4, 255) }, 70).data.toString('base64')}`,
          contextImages: [],
        },
      ],
      signal: AbortSignal.timeout(20_000),
    });
    const verdict = decidePhotos(result);
    console.log(
      JSON.stringify(
        { model: process.env.GEMINI_MODEL || 'gemini-2.5-flash', ...verdict },
        null,
        2,
      ),
    );
    if (verdict.winnerId !== 'diagnostic') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'AI check failed');
    process.exitCode = 1;
  }
}
