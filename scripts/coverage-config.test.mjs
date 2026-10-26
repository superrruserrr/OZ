// Seuils de couverture R6 / EX-T06 bloquants (vitest.config.ts), appliqués par `pnpm test:coverage` en CI.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import config from '../vitest.config.ts';

const coverage = config.test?.coverage ?? {};
const thresholds = coverage.thresholds ?? {};
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const all = (value) => ({ lines: value, functions: value, branches: value, statements: value });

describe('seuils de couverture (R6, EX-T06)', () => {
  it('bloque sous 70 % au global', () => {
    expect(thresholds).toMatchObject(all(70));
  });

  it('bloque sous 80 % sur les couches domaine et services', () => {
    for (const glob of ['apps/api/src/**/*.service.ts', 'packages/core/src/**']) {
      expect(thresholds[glob], glob).toEqual(all(80));
    }
  });

  it('bloque sous 100 % sur l’authentification, le KYC et la facturation', () => {
    for (const glob of [
      'apps/api/src/auth/**',
      'apps/api/src/kyc/**',
      'apps/api/src/billing/**',
      'packages/auth/src/**',
    ]) {
      expect(thresholds[glob], glob).toEqual(all(100));
    }
  });

  it('mesure le code écrit, pas le code généré ni les tests', () => {
    for (const pattern of ['**/src/generated/**', '**/*.test.{ts,tsx}', '**/src/cli/**']) {
      expect(coverage.exclude, pattern).toContain(pattern);
    }
  });

  it('génère le client Prisma avant les tests, couverture comprise', () => {
    expect(manifest.scripts['test:coverage']).toMatch(
      /^turbo run generate .*&& vitest run --coverage$/,
    );
  });
});
