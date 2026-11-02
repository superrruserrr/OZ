import { describe, expect, it } from 'vitest';
import { RBAC_ACTIONS, RBAC_ROLES } from './actions.js';
import { parseRbacMatrix } from './matrix.js';

const separator = (columns: number): string =>
  `| ${Array.from({ length: columns }, () => '---').join(' | ')} |`;
const ACTIONS_HEAD = `| Action | Libellé | ${RBAC_ROLES.join(' | ')} |`;
const cells = (value = 'deny'): string => RBAC_ROLES.map(() => value).join(' | ');
const row = (action: string, value?: string): string =>
  `| \`${action}\` | libellé | ${cells(value)} |`;
const ROWS = RBAC_ACTIONS.map((action) => row(action));

function document(
  actions: string[] = ROWS,
  routes: string[] = ['| GET | /a | public |'],
  head = ACTIONS_HEAD,
): string {
  return [
    '<!-- rbac:actions -->',
    '',
    head,
    separator(RBAC_ROLES.length + 2),
    ...actions,
    '',
    '<!-- rbac:routes -->',
    '',
    '| Méthode | Route | Accès |',
    separator(3),
    ...routes,
    '',
    'suite',
  ].join('\n');
}

describe('parseRbacMatrix', () => {
  it('lit les deux tableaux', () => {
    const matrix = parseRbacMatrix(document());
    expect(matrix.actions['kyc.read'].admin).toBe('deny');
    expect(matrix.routes).toEqual([{ method: 'GET', path: '/a', access: 'public' }]);
  });

  it('une route peut exiger une action de la matrice (`@Can`)', () => {
    const matrix = parseRbacMatrix(document(ROWS, ['| POST | /b | `document.upload` |']));
    expect(matrix.routes).toEqual([{ method: 'POST', path: '/b', access: 'document.upload' }]);
  });

  it.each([
    ['marqueur absent', 'rien'],
    ['tableau absent', '<!-- rbac:actions -->\n\ntexte'],
    ['séparateur absent', '<!-- rbac:actions -->\n\n| a |\n| b |\n'],
    ['tableau vide', document(ROWS, [])],
    [
      'colonnes de rôles échangées',
      document(ROWS, undefined, `| A | L | ${[...RBAC_ROLES].reverse().join(' | ')} |`),
    ],
    ['action inconnue', document([...ROWS, row('nope')])],
    ['action en double', document([...ROWS, ROWS[0] ?? ''])],
    ['action absente', document(ROWS.slice(1))],
    [
      'colonne manquante',
      document([...ROWS.slice(1), `| \`${RBAC_ACTIONS[0] ?? ''}\` | l | deny |`]),
    ],
    ['cellule inconnue', document([...ROWS.slice(1), row(RBAC_ACTIONS[0] ?? '', '✓')])],
    ['cellule vide', document([...ROWS.slice(1), row(RBAC_ACTIONS[0] ?? '', '')])],
    ['route en double', document(ROWS, ['| GET | /a | public |', '| GET | /a | public |'])],
    ['accès inconnu', document(ROWS, ['| GET | /a | peut-être |'])],
    ['ligne de route tronquée', document(ROWS, ['| GET |'])],
    ['ligne d’action tronquée', document([...ROWS.slice(1), '|'])],
  ])('refuse : %s', (_name, markdown) => {
    expect(() => parseRbacMatrix(markdown)).toThrow(/Matrice/);
  });
});
