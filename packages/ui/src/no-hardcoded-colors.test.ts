// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('aucune couleur en dur (naming_conventions, design.md §8.3)', () => {
  it('les composants n’utilisent que les jetons --oz-* et les classes oz-*', () => {
    const offenders = sources(SRC)
      .filter((path) => !path.endsWith('tokens.ts'))
      .filter((path) => /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length));
    expect(offenders).toEqual([]);
  });

  it('couvre bien les composants (le test n’est pas vide)', () => {
    expect(sources(SRC).some((path) => path.includes('components'))).toBe(true);
  });
});
