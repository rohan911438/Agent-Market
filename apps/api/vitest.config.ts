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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      // Composition root / process entrypoint — wired up by the integration
      // tests indirectly (via buildTestContext, a parallel construction) but
      // never executed directly, so real coverage here would require testing
      // process bootstrapping itself rather than behavior.
      exclude: ['src/main.ts', 'src/build-context.ts', 'src/context.ts', 'src/types/**', 'src/**/*.test.ts'],
      // Set from the actual baseline at introduction (~60/74/79/60), with a
      // few points of headroom so incidental fluctuation doesn't flake CI —
      // not an arbitrary target. Ratchet up as real coverage grows.
      thresholds: {
        statements: 55,
        branches: 70,
        functions: 75,
        lines: 55,
      },
    },
  },
});
