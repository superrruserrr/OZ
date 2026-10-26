// turbo.json : le cache de build se périme quand un script appelé par les builds change.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const turbo = JSON.parse(readFileSync(new URL('../turbo.json', import.meta.url), 'utf8'));

describe('turbo.json', () => {
  it('suit le script de copie standalone appelé par les builds Next', () => {
    expect(turbo.globalDependencies ?? []).toContain('scripts/next-standalone-assets.mjs');
  });
});
