// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ORG_PLANS, PLAYER_PLANS } from './pricing';

// La page tarifs reprend exactement la grille provisoire de docs/legal (lot 1.6, D3).
const SOURCE = readFileSync(
  new URL('../../../../docs/legal/tarifs-provisoires.md', import.meta.url),
  'utf8',
);

function rows(title: string): string[][] {
  const section = SOURCE.split(/^## /m).find((part) => part.startsWith(title)) ?? '';
  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && !/^\|\s*-/.test(line))
    .slice(1)
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}

const number = (cell: string | undefined): number | null =>
  cell === undefined || /sans limite/i.test(cell)
    ? null
    : Number(cell.replace(/\s/g, '').replace(',', '.'));

describe('grille tarifaire', () => {
  it('joueurs : mêmes prix que docs/legal/tarifs-provisoires.md', () => {
    expect(rows('Joueurs').map((r) => [number(r[1]), number(r[2])])).toEqual(
      PLAYER_PLANS.map((plan) => [plan.xaf, plan.eur]),
    );
  });

  it('organisations : mêmes prix, joueurs gérés, utilisateurs et exports', () => {
    expect(
      rows('Organisations').map((r) => [
        number(r[1]),
        number(r[2]),
        number(r[3]),
        number(r[4]),
        number(r[6]),
      ]),
    ).toEqual(
      ORG_PLANS.map((plan) => [plan.xaf, plan.eur, plan.managed, plan.users, plan.exportsPerDay]),
    );
  });

  it('palier gratuit : 3 exports par jour, comme le quota appliqué par l’API (lot 1.14b)', () => {
    expect(ORG_PLANS[0]?.exportsPerDay).toBe(3);
  });
});
