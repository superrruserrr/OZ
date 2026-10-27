import { defineConfig } from 'vitest/config';

// Tests d'intégration sur un PostgreSQL jetable (Testcontainers), comme ceux de l'API.
export default defineConfig({
  test: {
    name: '@oz/db',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Charge longue (million d'OZ ID en base) : à la main, `pnpm --filter @oz/db test:load`.
    exclude: ['**/node_modules/**', 'test/**/*.load.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
