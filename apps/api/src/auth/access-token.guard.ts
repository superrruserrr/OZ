import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccessTokenSubject, AccessTokens, Actor } from '@oz/auth';
import { sessionAccess, withUserContext, type PrismaClient } from '@oz/db';
import type { Request } from 'express';
import { DB_CLIENT } from '../database/database.module.js';
import { ACCESS_TOKENS } from './auth.tokens.js';
import { EMAIL_UNVERIFIED, TWO_FACTOR_ENROLLMENT_REQUIRED, UNAUTHENTICATED } from './errors.js';
import { TWO_FACTOR_EXEMPT } from './two-factor-exempt.decorator.js';

// Schéma insensible à la casse (RFC 9110 §11.1) ; la forme du jeton est vérifiée par `AccessTokens`.
const BEARER = /^Bearer +(\S+)$/i;

/** Titulaire authentifié de la requête, posé par la garde (lu par `@CurrentUser()`). */
export const authenticated: WeakMap<object, AccessTokenSubject> = new WeakMap();

/** Acteur de la requête, rôles relus en base : lu par `RolesGuard` et `@CurrentActor()`. */
export const actors: WeakMap<object, Actor> = new WeakMap();

/**
 * Garde des routes authentifiées (lot 1.3b, D2) : jeton d'accès `Authorization: Bearer` valide, puis
 * famille encore active et compte actif et vérifié, relus en base à chaque requête pour qu'une
 * révocation ou une suspension prenne effet dès la requête suivante. Tout refus a le même corps.
 * Compte à rôle obligatoire sans 2FA (D6 du lot 1.3cb) : session restreinte, seules les routes
 * marquées `@TwoFactorEnrollment()` restent ouvertes.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(ACCESS_TOKENS) private readonly accessTokens: AccessTokens,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Déjà passée sur cette requête (garde de classe et de méthode) : une seule lecture en base.
    if (actors.has(req)) return true;
    const token = BEARER.exec(req.header('Authorization') ?? '')?.[1];
    if (token === undefined) throw UNAUTHENTICATED();
    const claims = await this.accessTokens.verify(token, new Date());
    if (claims === null) throw UNAUTHENTICATED();
    const access = await withUserContext(this.db, claims.userId, (tx) =>
      sessionAccess(tx, claims.familyId),
    );
    if (access.status === 'invalid') throw UNAUTHENTICATED();
    if (access.status === 'email_unverified') throw EMAIL_UNVERIFIED();
    if (access.status === 'enrollment_required' && !this.isExempt(context)) {
      throw TWO_FACTOR_ENROLLMENT_REQUIRED();
    }
    authenticated.set(req, claims);
    // Niveau KYC : absent jusqu'au lot 1.10, donc refusé (D7 du lot 1.4a).
    actors.set(req, { userId: claims.userId, roles: access.roles, isKyc3Verified: false });
    return true;
  }

  private isExempt(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean | undefined>(TWO_FACTOR_EXEMPT, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }
}
