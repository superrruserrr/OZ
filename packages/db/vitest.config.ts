import { defineConfig } from 'vitest/config';

// Tests d'intégration sur un PostgreSQL jetable (Testcontainers), comme ceux de l'API.
export default defineConfig({
  test: {
    name: '@oz/db',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
