import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    maxWorkers: 4,
    // type-aware lint tests build a TS program, which exceeds 5s on slow shared runners
    testTimeout: 60_000,
    hookTimeout: 60_000,
    setupFiles: ['tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
