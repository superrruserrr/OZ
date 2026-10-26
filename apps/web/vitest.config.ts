import { defineConfig } from 'vitest/config';

// Composants React testés dans un DOM simulé (jsdom) ; les parcours réels passent par Playwright.
export default defineConfig({
  test: {
    name: '@oz/web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
