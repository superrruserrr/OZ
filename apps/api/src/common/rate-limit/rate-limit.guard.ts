import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../errors/api-error.js';
import { rateLimitKey } from '../security/client-ip.js';
import {
  RATE_LIMIT_SPECS,
  type RateLimitSpec,
  type RateLimitSubject,
} from './rate-limit.decorator.js';
import { RateLimitedException } from './rate-limited.exception.js';
import { RateLimiter } from './rate-limiter.service.js';

const MAX_EMAIL_LENGTH = 254;

/**
 * Valeur comptée pour une règle. Email : normalisé comme le contrat (`trim`, minuscules) ; absent ou
 * hors format, la règle ne s'applique pas et la validation refusera la requête. IP illisible
 * (mandataire mal réglé) : refus, jamais de compteur commun que n'importe qui pourrait épuiser.
 */
function subjectOf(req: Request, by: RateLimitSubject): string | null {
  if (by === 'ip') {
    const key = rateLimitKey(req.ip);
    if (key === null) throw new AppException(400, 'CLIENT_UNIDENTIFIED', 'Client non identifié.');
    return key;
  }
  const body: unknown = req.body;
  const value =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).email : undefined;
  if (typeof value !== 'string') return null;
  const address = value.trim().toLowerCase();
  return address === '' || address.length > MAX_EMAIL_LENGTH ? null : address;
}

/** Applique les règles de `@RateLimit` dans l'ordre déclaré, jusqu'au premier refus. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const specs =
      this.reflector.get<readonly RateLimitSpec[] | undefined>(
        RATE_LIMIT_SPECS,
        context.getHandler(),
      ) ?? [];
    const req = context.switchToHttp().getRequest<Request>();
    // Sujets calculés d'abord : une IP illisible refuse la requête avant tout décompte.
    const counted = specs.map(({ rule, by }) => ({ rule, subject: subjectOf(req, by) }));
    let wait = 0;
    for (const { rule, subject } of counted) {
      if (subject === null) continue;
      const decision = await this.limiter.consume(rule, subject);
      // Premier refus : les règles suivantes ne sont pas consommées (une IP déjà bloquée ne peut
      // pas épuiser le compteur d'un compte tiers).
      if (!decision.allowed) {
        wait = decision.retryAfterSeconds;
        break;
      }
    }
    if (wait > 0) throw new RateLimitedException(wait);
    return true;
  }
}
