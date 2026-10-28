import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenSubject, AccessTokens } from '@oz/auth';
import { sessionAccess, withUserContext, type PrismaClient } from '@oz/db';
import type { Request } from 'express';
import { DB_CLIENT } from '../database/database.module.js';
import { ACCESS_TOKENS } from './auth.tokens.js';
import { EMAIL_UNVERIFIED, UNAUTHENTICATED } from './session.service.js';

// Schéma insensible à la casse (RFC 9110 §11.1) ; la forme du jeton est vérifiée par `AccessTokens`.
const BEARER = /^Bearer +(\S+)$/i;

/** Titulaire authentifié de la requête, posé par la garde (lu par `@CurrentUser()`). */
export const authenticated: WeakMap<object, AccessTokenSubject> = new WeakMap();

/**
 * Garde des routes authentifiées (lot 1.3b, D2) : jeton d'accès `Authorization: Bearer` valide, puis
 * famille encore active et compte actif et vérifié, relus en base à chaque requête pour qu'une
 * révocation ou une suspension prenne effet dès la requête suivante. Tout refus a le même corps.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(ACCESS_TOKENS) private readonly accessTokens: AccessTokens,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = BEARER.exec(req.header('Authorization') ?? '')?.[1];
    if (token === undefined) throw UNAUTHENTICATED();
    const claims = await this.accessTokens.verify(token, new Date());
    if (claims === null) throw UNAUTHENTICATED();
    const access = await withUserContext(this.db, claims.userId, (tx) =>
      sessionAccess(tx, claims.familyId),
    );
    if (access === 'invalid') throw UNAUTHENTICATED();
    if (access === 'email_unverified') throw EMAIL_UNVERIFIED();
    authenticated.set(req, claims);
    return true;
  }
}
