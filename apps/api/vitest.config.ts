import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    hookTimeout: 30_000,
    testTimeout: 15_000,
    // Integration tests share one real SQLite file (see global-setup.ts).
    // Running test files in parallel workers causes concurrent writers to
    // hit SQLite file locks — force sequential execution instead.
    fileParallelism: false,
  },
});
