import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { RbacAction, RbacRole } from '@oz/auth';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import {
  ACCESS_POLICY,
  REQUIRED_ACTION,
  REQUIRED_ROLES,
  SCOPE_PARAM,
  type AccessPolicy,
} from './metadata.js';
import { RolesGuard } from './roles.guard.js';

/** Route ouverte sans session. */
export const Public = () => SetMetadata(ACCESS_POLICY, 'public' satisfies AccessPolicy);

/** Session valide, sans droit particulier : la route n'agit que sur le compte de son titulaire. */
export const Authenticated = () =>
  applyDecorators(
    SetMetadata(ACCESS_POLICY, 'authenticated' satisfies AccessPolicy),
    UseGuards(AccessTokenGuard),
  );

const Restricted = () =>
  applyDecorators(
    SetMetadata(ACCESS_POLICY, 'restricted' satisfies AccessPolicy),
    UseGuards(AccessTokenGuard, RolesGuard),
  );

/** Réservée aux rôles cités ; sans rôle cité, la route reste fermée à tous. */
export const Roles = (...roles: RbacRole[]) =>
  applyDecorators(Restricted(), SetMetadata(REQUIRED_ROLES, roles));

/**
 * Exige une action de la matrice. Décision au niveau du type : un droit conditionnel (`self`, `org`)
 * passe ici, et le service décide ensuite sur le sujet avec `abilityFor`.
 */
export const Can = (action: RbacAction) =>
  applyDecorators(Restricted(), SetMetadata(REQUIRED_ACTION, action));

/**
 * Le paramètre de route désigne une organisation du compte. Pose lui-même les gardes : joint à
 * `@Roles` ou `@Can`, il restreint leurs rôles à ceux tenus dans cette organisation.
 */
export const Scope = (param: string) =>
  applyDecorators(Restricted(), SetMetadata(SCOPE_PARAM, param));
