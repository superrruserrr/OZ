import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'apps/*',
      'packages/*',
      { test: { name: 'scripts', include: ['scripts/**/*.test.mjs'] } },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text', 'html', 'json-summary'],
    },
  },
});
