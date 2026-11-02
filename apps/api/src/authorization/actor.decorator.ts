import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Actor } from '@oz/auth';
import type { Request } from 'express';
import { actors } from '../auth/access-token.guard.js';

/** Acteur posé par `AccessTokenGuard` ; une route sans la garde est une erreur de programmation. */
export function actorOf(req: Request): Actor {
  const actor = actors.get(req);
  if (actor === undefined) throw new Error('Route protégée sans AccessTokenGuard.');
  return actor;
}

/** Acteur de la requête, rôles relus en base : `@CurrentActor() actor: Actor`. */
export const CurrentActor = createParamDecorator((_: unknown, context: ExecutionContext) =>
  actorOf(context.switchToHttp().getRequest<Request>()),
);
