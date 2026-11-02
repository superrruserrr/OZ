// Clés de métadonnées, à part des décorateurs : ceux-ci importent les gardes qui les relisent.

import type { Request } from 'express';

export const ACCESS_POLICY = 'oz:access-policy';
export const REQUIRED_ROLES = 'oz:required-roles';
export const REQUIRED_ACTION = 'oz:required-action';
export const SCOPE_PARAM = 'oz:scope-param';

/** Politique d'accès déclarée, seule voie vers une route : voir `DefaultDenyGuard`. */
export type AccessPolicy = 'public' | 'authenticated' | 'restricted';

/** Motif de la route pour les journaux : jamais les valeurs de ses paramètres. */
export const routeOf = (req: Request): string => (req.route as { path: string }).path;
