import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@oz/worker',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 240_000,
  },
});
