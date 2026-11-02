import { defineConfig } from 'vitest/config';

// Tests d'intégration sur un SeaweedFS jetable (Testcontainers), même image que le poste.
export default defineConfig({
  test: {
    name: '@oz/storage',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
