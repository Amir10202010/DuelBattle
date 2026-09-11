import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
    // Keep real logging code paths exercised without drowning the test output.
    env: { LOG_LEVEL: 'error' },
  },
});
