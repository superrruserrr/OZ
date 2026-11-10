import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Composants React testés dans un DOM simulé (jsdom) ; les parcours réels passent par Playwright.
export default defineConfig({
  resolve: {
    // `server-only` est fourni par Next (alias de compilation) : vide côté serveur dans les tests.
    alias: {
      'server-only': fileURLToPath(
        new URL('node_modules/next/dist/compiled/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    name: '@oz/web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // next-intl importe `next/server` sans extension : résolu par Vite plutôt que par Node ESM.
    server: { deps: { inline: ['next-intl'] } },
  },
});
