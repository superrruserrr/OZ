import { defineConfig } from 'vitest/config';

// Tests unitaires des composants dans un DOM simulé (jsdom). Les stories, rendues dans Chromium avec
// axe-core, ont leur propre configuration (vitest.storybook.config.ts, `pnpm test:stories`).
export default defineConfig({
  test: {
    name: '@oz/ui',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.browser.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
