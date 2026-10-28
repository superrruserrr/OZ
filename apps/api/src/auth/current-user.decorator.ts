import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenSubject } from '@oz/auth';
import type { Request } from 'express';
import { authenticated } from './access-token.guard.js';

/** Titulaire posé par `AccessTokenGuard` ; une route sans la garde est une erreur de programmation. */
export function currentUserOf(req: Request): AccessTokenSubject {
  const subject = authenticated.get(req);
  if (subject === undefined) throw new Error('Route authentifiée sans AccessTokenGuard.');
  return subject;
}

/** Utilisateur et famille de session du jeton d'accès : `@CurrentUser() user: AccessTokenSubject`. */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) =>
  currentUserOf(context.switchToHttp().getRequest<Request>()),
);
