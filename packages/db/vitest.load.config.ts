import { defineConfig } from 'vitest/config';

// Tests de charge longs, hors CI (lot 1.2, D6) : `pnpm --filter @oz/db test:load`.
export default defineConfig({
  test: {
    name: '@oz/db:load',
    include: ['test/**/*.load.test.ts'],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
  },
});
