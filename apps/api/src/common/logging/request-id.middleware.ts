import type { NextFunction, Request, Response } from 'express';
import { resolveRequestId } from './logging.js';

type RequestWithId = Request & { id?: unknown };

/**
 * Premier middleware de la chaîne : attribue l'identifiant avant toute analyse du corps,
 * pour que les erreurs précoces (JSON malformé, corps trop gros…) le portent aussi.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = resolveRequestId(req.headers['x-request-id']);
  (req as RequestWithId).id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

export function requestIdOf(req: Request): string {
  const id = (req as RequestWithId).id;
  return typeof id === 'string' ? id : '';
}
