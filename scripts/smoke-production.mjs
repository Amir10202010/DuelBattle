/* global fetch, AbortSignal */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

// The production build, with an isolated DB and no external side effects.
const dataDir = mkdtempSync(join(tmpdir(), 'duelbattle-smoke-'));
Object.assign(process.env, {
  NODE_ENV: 'production', DATA_DIR: dataDir,
  CLIENT_DIR: fileURLToPath(new URL('../packages/client/dist/', import.meta.url)),
  TELEGRAM_BOT_ENABLED: '0', TELEGRAM_BOT_TOKEN: '',
  GEMINI_API_KEYS: '', GEMINI_API_KEY: '', YOLO_URL: '', YOLO_TOKEN: '',
  RESEND_API_KEY: '', BREVO_API_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '',
  STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', ADMIN_EMAILS: '',
  APP_ORIGIN: '', ALLOWED_ORIGINS: '', LOG_LEVEL: 'error',
});
let app;
try {
  const { createApp } = await import('../packages/server/dist/app.js');
  app = createApp();
  const port = await app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${port}`;
  const get = (path, init) => fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(5000) });
  assert.equal((await (await get('/healthz')).json()).ok, true);
  assert.equal((await (await get('/readyz')).json()).ready, true);
  for (const path of ['/', '/home', '/store', '/pass', '/tg/pass']) {
    const page = await get(path);
    assert.equal(page.status, 200, path);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/);
    assert.ok(page.headers.get('content-security-policy'), 'CSP must be present');
    assert.match(await page.text(), /<div id="root">/);
  }
  assert.equal((await get('/api/meta')).status, 401);
  assert.equal((await get('/api/admin/kpis')).status, 401);
  assert.equal((await get('/api/pay/stripe/webhook', { method: 'POST', body: '{}' })).status, 404);
  assert.equal((await get('/api/meta/daily', { method: 'POST', body: '{}' })).status, 401);
  process.stdout.write('Production smoke passed: health, readiness, SPA routes, CSP, protected APIs and disabled payments.\n');
} finally {
  await app?.close();
  // Delete only the exact temporary directory this process created.
  const target = resolve(dataDir);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.ok(basename(target).startsWith('duelbattle-smoke-'));
  rmSync(target, { recursive: true, force: true });
}
