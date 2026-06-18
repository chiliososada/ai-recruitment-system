import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@ars/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // PGlite is a single WASM instance per process; forks keep each test file isolated.
    pool: 'forks',
    poolOptions: { forks: { singleFork: false } },
    testTimeout: 30000,
    hookTimeout: 30000,
    sequence: { concurrent: false },
  },
});
