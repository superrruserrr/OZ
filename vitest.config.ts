import { defineConfig } from 'vitest/config';

const all = (value: number) => ({
  lines: value,
  functions: value,
  branches: value,
  statements: value,
});

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
      exclude: ['**/*.test.{ts,tsx}', '**/src/test/**', '**/src/generated/**', '**/src/cli/**'],
      reporter: ['text', 'html', 'json-summary'],
      // R6 / EX-T06 : seuils bloquants en CI (`pnpm test:coverage`). Un seuil par motif ne vaut
      // que pour les fichiers qui y correspondent ; il s'applique dès que le module existe.
      thresholds: {
        ...all(70),
        'apps/api/src/**/*.service.ts': all(80),
        'packages/core/src/**': all(80),
        'apps/api/src/auth/**': all(100),
        'apps/api/src/kyc/**': all(100),
        'apps/api/src/billing/**': all(100),
        'packages/auth/src/**': all(100),
      },
    },
  },
});
