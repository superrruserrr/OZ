import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  abilityFor,
  RBAC_ACTION_SUBJECTS,
  type Actor,
  type ActorRole,
  type RbacAction,
  type RbacRole,
} from '@oz/auth';
import type { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AUTHZ_FORBIDDEN } from '../auth/errors.js';
import { actorOf } from './actor.decorator.js';
import { routeOf } from './metadata.js';
import { REQUIRED_ACTION, REQUIRED_ROLES, SCOPE_PARAM } from './metadata.js';

/**
 * Décision de `@Roles`, `@Can` et `@Scope`, toujours après `AccessTokenGuard` : 401 et 2FA d'abord.
 * L'acteur vient de la base ; en-têtes, corps et jeton n'entrent pas dans la décision (CP-08).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectPinoLogger(RolesGuard.name) private readonly logger: PinoLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const actor = actorOf(req);
    if (this.isAllowed(context, req, actor)) return true;
    this.logger.warn(
      { method: req.method, route: routeOf(req), userId: actor.userId },
      'Accès refusé par la matrice des droits',
    );
    throw AUTHZ_FORBIDDEN();
  }

  private isAllowed(context: ExecutionContext, req: Request, actor: Actor): boolean {
    let entries = actor.roles;
    for (const roles of this.layers<RbacRole[]>(REQUIRED_ROLES, context)) {
      entries = entries.filter(({ role }) => roles.includes(role));
    }
    for (const param of this.layers<string>(SCOPE_PARAM, context)) {
      entries = entries.filter((entry) => inScope(entry, req.params[param]));
    }
    if (entries.length === 0) return false;
    // Seuls les rôles retenus décident : un rôle tenu ailleurs n'ouvre pas cette organisation.
    const ability = abilityFor({ ...actor, roles: entries });
    return this.layers<RbacAction>(REQUIRED_ACTION, context).every((action) =>
      ability.can(action, RBAC_ACTION_SUBJECTS[action]),
    );
  }

  /** Valeurs de la méthode et de la classe : chacune s'ajoute, aucune n'élargit l'autre. */
  private layers<T>(key: string, context: ExecutionContext): T[] {
    return this.reflector
      .getAll<(T | undefined)[]>(key, [context.getHandler(), context.getClass()])
      .filter((value) => value !== undefined);
  }
}

/** L'administrateur n'a pas d'organisation : sa portée est globale, sur une organisation désignée. */
const inScope = ({ role, organizationId }: ActorRole, id: unknown): boolean =>
  typeof id === 'string' && (role === 'admin' || organizationId === id);
