import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    /*
     * Tests read the shared package's source, not its build output.
     *
     * Resolving through package.json would make `npm test` depend on a prior
     * `npm run build -w @battle/shared`, which fails on a fresh clone and — far
     * worse — silently tests a stale build when one is lying around.
     */
    alias: {
      '@battle/shared/validation': src('./packages/shared/src/validation.ts'),
      '@battle/shared': src('./packages/shared/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
    // Keep real logging code paths exercised without drowning the test output.
    env: { LOG_LEVEL: 'error' },
  },
});
