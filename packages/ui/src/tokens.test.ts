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

/*
 * Échelle typographique douce (lot 1.5e, E6) : corps à 15 px, titres réduits d'environ 20 %,
 * jamais sous 12 px. Les classes Tailwind `text-*` lisent ces jetons.
 */
describe('échelle typographique (lot 1.5e)', () => {
  const css = read('../styles/tokens.css');
  const rem = (name: string): number => {
    const match = new RegExp(`--text-${name}:\\s*([0-9.]+)rem;`).exec(css);
    if (!match?.[1]) throw new Error(`--text-${name} absent`);
    return Number(match[1]) * 16;
  };

  it('corps à 15 px, métadonnées à 14 px, plancher à 12 px', () => {
    expect(rem('base')).toBe(15);
    expect(rem('sm')).toBe(14);
    expect(rem('xs')).toBe(12);
  });

  it('titres réduits : chaque palier sous la valeur Tailwind par défaut', () => {
    const tailwind = { lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36 } as const;
    for (const [name, px] of Object.entries(tailwind)) {
      expect(rem(name), name).toBeLessThan(px);
      expect(rem(name), name).toBeGreaterThanOrEqual(px * 0.78);
    }
  });

  it('interlignage aéré pour le corps', () => {
    expect(css).toMatch(/--text-base--line-height:\s*1\.55;/);
  });
});

describe('durées du chargement (E5)', () => {
  const css = read('../styles/tokens.css');
  const ms = (name: string) => {
    const m = new RegExp(`--animate-${name}: [a-z-]+ (\\d+)ms(?:[^;]*? (\\d+)ms)?[^;]*;`).exec(css);
    if (!m) throw new Error(name);
    return { duration: Number(m[1]), delay: Number(m[2] ?? 0) };
  };

  it('apparition après 150 ms, anneau et éclatement en 600 ms au plus', () => {
    expect(ms('oz-loader-appear').delay).toBe(150);
    for (const side of ['left', 'center', 'right']) {
      const { duration } = ms(`oz-split-${side}`);
      expect(duration).toBeLessThanOrEqual(600);
    }
    expect(ms('oz-ring-burst').duration).toBeLessThanOrEqual(600);
  });
});
