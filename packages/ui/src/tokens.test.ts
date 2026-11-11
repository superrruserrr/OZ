// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OZ_DEFAULT_MODE, OZ_MODES, ozThemes } from './tokens.js';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

/** Paires `--oz-nom: #hex` d'un texte CSS (bloc de design.md ou feuille de styles). */
function cssTokens(css: string): Map<string, string> {
  return new Map(
    [...css.matchAll(/--oz-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((m) => [
      m[1] ?? '',
      (m[2] ?? '').toUpperCase(),
    ]),
  );
}

/** Coupe un CSS en bloc clair (`:root` hors média) et bloc sombre (`prefers-color-scheme: dark`). */
function byMode(css: string): Record<'light' | 'dark', Map<string, string>> {
  const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
  if (darkStart < 0) throw new Error('bloc sombre absent');
  return { light: cssTokens(css.slice(0, darkStart)), dark: cssTokens(css.slice(darkStart)) };
}

const fromTs = (mode: 'light' | 'dark') =>
  new Map(Object.entries(ozThemes[mode]).map(([k, v]) => [k, v.toUpperCase()]));
const designBlock = /### 8\.3[\s\S]*?```css\n([\s\S]*?)```/.exec(read('../../../design.md'))?.[1];
const stylesheet = read('../styles/tokens.css');

describe('jetons OZ (design.md §8.3, ADR-009)', () => {
  it.each(OZ_MODES)('%s : identiques au bloc CSS de design.md', (mode) => {
    const expected = byMode(designBlock ?? '')[mode];
    expect(expected.size).toBe(28);
    expect(fromTs(mode)).toEqual(expected);
  });

  it('styles/tokens.css pose le seul jeu sombre, sans bascule selon l’appareil (ADR-011)', () => {
    expect(OZ_DEFAULT_MODE).toBe('dark');
    expect(stylesheet).not.toContain('prefers-color-scheme');
    expect(cssTokens(stylesheet)).toEqual(fromTs(OZ_DEFAULT_MODE));
    expect(stylesheet).toMatch(/:root\s*{[^}]*color-scheme:\s*dark;/);
  });

  it('les deux modes ont les mêmes noms', () => {
    expect(Object.keys(ozThemes.dark)).toEqual(Object.keys(ozThemes.light));
  });

  it('exposent chaque jeton au thème Tailwind ; le bleu légal seulement en icône (M8)', () => {
    for (const name of Object.keys(ozThemes.light).filter((key) => key !== 'legal')) {
      expect(stylesheet, name).toContain(`--color-oz-${name}: var(--oz-${name});`);
    }
    expect(stylesheet).not.toMatch(/--color-oz-legal:/);
    expect(stylesheet).toContain('--color-oz-legal-icon: var(--oz-legal);');
  });

  it('sont gelés', () => {
    expect(Object.isFrozen(ozThemes)).toBe(true);
    for (const mode of OZ_MODES) expect(Object.isFrozen(ozThemes[mode])).toBe(true);
  });
});
