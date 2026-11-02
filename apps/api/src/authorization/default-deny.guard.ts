import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AUTHZ_FORBIDDEN } from '../auth/errors.js';
import { ACCESS_POLICY, routeOf, type AccessPolicy } from './metadata.js';

/**
 * Refus par défaut (EX-104 n° 5) : garde globale, avant toute autre. Une route sans politique
 * déclarée reçoit 403, y compris sans session, et son gestionnaire ne s'exécute pas.
 */
@Injectable()
export class DefaultDenyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectPinoLogger(DefaultDenyGuard.name) private readonly logger: PinoLogger,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_POLICY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (policy !== undefined) return true;
    const req = context.switchToHttp().getRequest<Request>();
    this.logger.error({ method: req.method, route: routeOf(req) }, 'Route sans politique d’accès');
    throw AUTHZ_FORBIDDEN();
  }
}
