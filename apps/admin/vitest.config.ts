import { defineConfig } from 'vitest/config';

// Composants React testés dans un DOM simulé (jsdom) ; les parcours réels passent par Playwright.
export default defineConfig({
  test: {
    name: '@oz/admin',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // next-intl importe `next/server` sans extension : résolu par Vite plutôt que par Node ESM.
    server: { deps: { inline: ['next-intl'] } },
  },
});
