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
      {
        // Ces tests lancent ESLint (analyse typée) ou commitlint : premier démarrage lent sur un runner.
        test: { name: 'scripts', include: ['scripts/**/*.test.mjs'], testTimeout: 30_000 },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['apps/*/src/**', 'packages/*/src/**'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.stories.tsx',
        '**/*.mdx',
        '**/src/test/**',
        '**/src/generated/**',
        '**/src/cli/**',
        // Point d'entrée du conteneur (trois lignes) : la logique est dans `worker.ts`, couverte.
        'apps/worker/src/main.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      // R6 / EX-T06 : seuils bloquants en CI (`pnpm test:coverage`). Un seuil par motif ne vaut
      // que pour les fichiers qui y correspondent ; il s'applique dès que le module existe.
      thresholds: {
        ...all(70),
        'apps/api/src/**/*.service.ts': all(80),
        'packages/core/src/**': all(80),
        // EX-102 n° 8 : génération et validation de l'OZ ID couvertes à 100 %.
        'packages/core/src/oz-id/**': all(100),
        'apps/api/src/auth/**': all(100),
        'apps/api/src/authorization/**': all(100),
        'apps/api/src/document/**': all(100),
        'apps/api/src/kyc/**': all(100),
        'apps/api/src/billing/**': all(100),
        'packages/auth/src/**': all(100),
        // Coffre documentaire (lot 1.9a) : clés et présignature, surface d'attaque directe.
        'packages/storage/src/**': all(100),
        // Worker d'analyse (lot 1.9b) : antivirus, ré-encodage et verdicts, surface d'attaque directe.
        'apps/worker/src/**': all(100),
      },
    },
  },
});
