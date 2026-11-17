// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('écrans de compte : jetons seulement (ADR-012)', () => {
  it('aucune couleur codée en dur dans auth, onboarding, guardian et leurs routes', () => {
    const dirs = ['auth', 'onboarding', 'guardian', 'app/[locale]/(auth)', 'app/[locale]/(app)'];
    const offenders = dirs
      .flatMap((dir) => sources(join(SRC, dir)))
      .filter((path) => /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});
