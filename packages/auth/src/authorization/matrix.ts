// Lecture de `docs/security/rbac.md`, source de la suite générée (EX-104 n° 7, n° 8). Un écart de
// forme lève une erreur : une matrice illisible fait échouer la suite, elle ne la vide pas.

import {
  RBAC_ACTIONS,
  RBAC_CELLS,
  RBAC_ROLES,
  type RbacAction,
  type RbacCell,
  type RbacRole,
} from './actions.js';

export const RBAC_ROUTE_ACCESS = ['public', 'authenticated'] as const;
/** `public`, `authenticated`, ou l'action de la matrice qu'exige la route (`@Can`). */
export type RbacRouteAccess = (typeof RBAC_ROUTE_ACCESS)[number] | RbacAction;

const ROUTE_ACCESS: readonly RbacRouteAccess[] = [...RBAC_ROUTE_ACCESS, ...RBAC_ACTIONS];

export interface RbacRoute {
  readonly method: string;
  readonly path: string;
  readonly access: RbacRouteAccess;
}

export interface RbacMatrix {
  readonly actions: Readonly<Record<RbacAction, Readonly<Record<RbacRole, RbacCell>>>>;
  readonly routes: readonly RbacRoute[];
}

const isOneOf = <T extends string>(values: readonly T[], value: string): value is T =>
  (values as readonly string[]).includes(value);

/** Lignes de données du tableau qui suit le marqueur, cellules débarrassées de `code`. */
function tableAfter(markdown: string, marker: string): string[][] {
  const start = markdown.indexOf(`<!-- ${marker} -->`);
  if (start === -1) throw new Error(`Matrice : marqueur ${marker} absent.`);
  const rows: string[][] = [];
  for (const line of markdown.slice(start).split('\n').slice(1)) {
    if (line.trim() === '' && rows.length === 0) continue;
    if (!line.startsWith('|')) break;
    rows.push(
      line
        .slice(1, line.lastIndexOf('|'))
        .split('|')
        .map((cell) => cell.trim().replaceAll('`', '')),
    );
  }
  const [, separator] = rows;
  if (!separator?.every((cell) => /^:?-+:?$/.test(cell))) {
    throw new Error(`Matrice : tableau ${marker} mal formé.`);
  }
  if (rows.length === 2) throw new Error(`Matrice : tableau ${marker} vide.`);
  return rows;
}

function parseActions([header, , ...rows]: readonly string[][]): RbacMatrix['actions'] {
  if (header?.slice(2).join() !== RBAC_ROLES.join())
    throw new Error('Matrice : colonnes de rôles.');
  const actions = new Map<string, Record<RbacRole, RbacCell>>();
  for (const [action = '', , ...cells] of rows) {
    if (!isOneOf(RBAC_ACTIONS, action)) throw new Error(`Matrice : action inconnue ${action}.`);
    if (actions.has(action)) throw new Error(`Matrice : action en double ${action}.`);
    if (cells.length !== RBAC_ROLES.length) throw new Error(`Matrice : colonnes de ${action}.`);
    const parsed = cells.map((cell, index) => {
      if (!isOneOf(RBAC_CELLS, cell)) throw new Error(`Matrice : cellule « ${cell} » (${action}).`);
      return [RBAC_ROLES[index], cell] as const;
    });
    actions.set(action, Object.fromEntries(parsed) as Record<RbacRole, RbacCell>);
  }
  const missing = RBAC_ACTIONS.filter((action) => !actions.has(action));
  if (missing.length > 0) throw new Error(`Matrice : actions absentes ${missing.join(', ')}.`);
  return Object.fromEntries(actions) as RbacMatrix['actions'];
}

function parseRoutes([, , ...rows]: readonly string[][]): RbacRoute[] {
  const seen = new Set<string>();
  return rows.map(([method = '', path = '', access = '']) => {
    const key = `${method} ${path}`;
    if (seen.has(key)) throw new Error(`Matrice : route en double ${key}.`);
    seen.add(key);
    if (!isOneOf(ROUTE_ACCESS, access)) throw new Error(`Matrice : accès de ${key}.`);
    return { method, path, access };
  });
}

export function parseRbacMatrix(markdown: string): RbacMatrix {
  return {
    actions: parseActions(tableAfter(markdown, 'rbac:actions')),
    routes: parseRoutes(tableAfter(markdown, 'rbac:routes')),
  };
}
