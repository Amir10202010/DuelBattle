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
    /*
     * Room for the tests that exercise real password hashing.
     *
     * Sign-in derives keys with scrypt at N=131072, which costs about 128MB and
     * a good fraction of a second *by design* — that cost is the security
     * property, so a test that used cheaper parameters would be testing
     * something the product does not do. A handful of tests run four or five
     * derivations each, and the files run in parallel, so under contention they
     * drift past the five-second default and fail for no reason anybody can act
     * on.
     *
     * Raised rather than worked around: the honest fix for "this test does a
     * lot of deliberately slow work" is to allow the work the time it takes.
     */
    testTimeout: 20_000,
    // Keep real logging code paths exercised without drowning the test output.
    env: { LOG_LEVEL: 'error' },
  },
});
