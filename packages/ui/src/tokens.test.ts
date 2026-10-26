import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ozColors } from './tokens.js';

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

const designBlock = /### 8\.3[\s\S]*?```css\n([\s\S]*?)```/.exec(read('../../../design.md'))?.[1];
const stylesheet = read('../styles/tokens.css');

describe('jetons OZ (design.md §8.3)', () => {
  it('reprennent exactement le bloc CSS de design.md, plus le gris observateur du tableau', () => {
    const expected = cssTokens(designBlock ?? '');
    expect(expected.size).toBe(26);
    expected.set('observer', '#8C8E8B');
    const fromTs = new Map(Object.entries(ozColors).map(([k, v]) => [k, v.toUpperCase()]));
    expect(fromTs).toEqual(expected);
  });

  it('sont posés à l’identique dans styles/tokens.css', () => {
    const fromTs = new Map(Object.entries(ozColors).map(([k, v]) => [k, v.toUpperCase()]));
    expect(cssTokens(stylesheet)).toEqual(fromTs);
  });

  it('exposent chaque jeton au thème Tailwind ; le bleu légal seulement en icône (M8)', () => {
    for (const name of Object.keys(ozColors).filter((key) => key !== 'legal')) {
      expect(stylesheet, name).toContain(`--color-oz-${name}: var(--oz-${name});`);
    }
    // #3B64F1 ne passe pas AA en petit texte : pas de `--color-oz-legal`, donc pas de `text-oz-legal`.
    expect(stylesheet).not.toMatch(/--color-oz-legal:/);
    expect(stylesheet).toContain('--color-oz-legal-icon: var(--oz-legal);');
  });

  it('sont gelés', () => {
    expect(Object.isFrozen(ozColors)).toBe(true);
  });
});
