import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3100',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    viewport: { width: 1440, height: 1000 },
    permissions: ['camera', 'microphone', 'clipboard-read', 'clipboard-write'],
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // Build here as well as in CI: a browser run against a stale `dist` is worse
    // than no browser run at all.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3100/api/health',
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: '3100',
      APP_ORIGIN: 'http://localhost:3100',
      DATABASE_PATH: ':memory:',
      STUN_URL: '',
      GEMINI_API_KEYS: '',
      GEMINI_API_KEY: '',
    },
  },
});
