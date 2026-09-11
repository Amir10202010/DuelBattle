import { existsSync } from 'node:fs';
import { createApp } from './app';
import { GeminiPhotoJudge } from './ai-judge';
import { YoloObjectDetector } from './object-detector';

if (existsSync('.env')) process.loadEnvFile('.env');
const production = process.env.NODE_ENV === 'production' || import.meta.url.includes('/dist/');
const port = Number(process.env.PORT ?? 3000);
const origin = process.env.APP_ORIGIN ?? `http://localhost:${port}`;
const geminiKeys = process.env.GEMINI_API_KEYS?.trim() || process.env.GEMINI_API_KEY?.trim();
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid port number.');
if (
  production &&
  !origin.startsWith('https://') &&
  !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)
)
  throw new Error('Production APP_ORIGIN must use HTTPS.');
const instance = await createApp({
  aiJudge: geminiKeys
    ? new GeminiPhotoJudge(
        geminiKeys,
        process.env.GEMINI_MODEL || undefined,
        fetch,
        new YoloObjectDetector(process.env.YOLO_URL || undefined, process.env.YOLO_SERVICE_TOKEN),
      )
    : undefined,
  databasePath: process.env.DATABASE_PATH ?? './data/duelbattle.sqlite',
  origin,
  production,
  trustProxy: process.env.TRUST_PROXY === '1',
});
console.log(
  geminiKeys
    ? 'Gemini photo judge enabled with local YOLOv8 assistance.'
    : 'AI judge not configured. Battles use clearly labeled opponent review. Set GEMINI_API_KEYS to enable AI.',
);
instance.http.listen(port, process.env.HOST ?? '0.0.0.0', () =>
  console.log(`DuelBattle ready at ${origin}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void instance.close().then(() => process.exit(0));
  });
