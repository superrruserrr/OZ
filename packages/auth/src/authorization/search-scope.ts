// Portée de recherche (lot 1.14a, rbac `player.search`) : décidée par CASL sur les rôles relus en
// base. `limited` (académie) : profils vérifiés, sans critère avancé (D1). Le filtre par organisation
// ne vise que les organisations du lecteur, pour toute portée hors administrateur. Le cumul de rôles
// retient la portée la plus large.

import { authorizationReason, type Actor, type AppAbility } from './abilities.js';

export interface SearchScope {
  readonly kind: 'full' | 'limited';
  /**
   * Organisations du lecteur : seules filtrables par `organizationId`, le rattachement n'étant dans
   * aucune vue tierce (pas d'oracle) ; `null` pour l'administrateur, qui lit toute fiche complète.
   */
  readonly organizationIds: readonly string[] | null;
}

/** Critères avancés (D1), refusés à la portée réduite. */
export const SEARCH_ADVANCED_CRITERIA = [
  'heightMin',
  'heightMax',
  'weightMin',
  'weightMax',
  'foot',
  'organizationId',
] as const;

/** `null` : aucune recherche permise (joueur, tuteur, centre, recruteur ou agence sans KYC 3). */
export function searchScopeFor(actor: Actor, ability: AppAbility): SearchScope | null {
  if (!ability.can('player.search', 'PlayerSearch')) return null;
  const kind =
    authorizationReason(ability, 'player.search', 'PlayerSearch') === 'limited'
      ? 'limited'
      : 'full';
  const organizationIds = actor.roles.some((role) => role.role === 'admin')
    ? null
    : actor.roles.flatMap((role) => (role.organizationId === null ? [] : [role.organizationId]));
  return { kind, organizationIds };
}

/** Critères présents que la portée refuse, dans l'ordre de `SEARCH_ADVANCED_CRITERIA`. */
export function refusedSearchCriteria(
  scope: SearchScope,
  criteria: Readonly<Record<string, unknown>>,
): string[] {
  return SEARCH_ADVANCED_CRITERIA.filter((key) => {
    const value = criteria[key];
    if (value === undefined) return false;
    // Toute portée : une organisation du lecteur seulement (sauf l'administrateur).
    if (key === 'organizationId') {
      return scope.organizationIds !== null && !scope.organizationIds.includes(value as string);
    }
    return scope.kind === 'limited';
  });
}
