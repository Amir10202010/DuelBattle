import { existsSync } from 'node:fs';
import { createApp } from './app';

if (existsSync('.env')) process.loadEnvFile('.env');
const production = process.env.NODE_ENV === 'production' || import.meta.url.includes('/dist/');
const port = Number(process.env.PORT ?? 3000);
const origin = process.env.APP_ORIGIN ?? `http://localhost:${port}`;
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be a valid port number.');
if (
  production &&
  !origin.startsWith('https://') &&
  !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)
)
  throw new Error('Production APP_ORIGIN must use HTTPS.');
const instance = await createApp({
  databasePath: process.env.DATABASE_PATH ?? './data/duelbattle.sqlite',
  origin,
  production,
  trustProxy: process.env.TRUST_PROXY === '1',
});
instance.http.listen(port, process.env.HOST ?? '0.0.0.0', () =>
  console.log(`DuelBattle ready at ${origin}`),
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void instance.close().then(() => process.exit(0));
  });
