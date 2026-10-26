// turbo.json : le cache de build se périme quand un script appelé par les builds change.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const turbo = JSON.parse(readFileSync(new URL('../turbo.json', import.meta.url), 'utf8'));

describe('turbo.json', () => {
  it('suit le script de copie standalone appelé par les builds Next', () => {
    expect(turbo.globalDependencies ?? []).toContain('scripts/next-standalone-assets.mjs');
  });

  it('restaure avec le cache les types générés par next typegen, lus par le lint typé', () => {
    // Sans eux, un typecheck servi par le cache laisse next/root-params typé `any` (CI, PR #14).
    expect(turbo.tasks.typecheck.outputs).toEqual(
      expect.arrayContaining(['.next/types/**', 'next-env.d.ts']),
    );
  });
});
