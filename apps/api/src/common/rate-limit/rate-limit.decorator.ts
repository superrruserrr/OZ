import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiTooManyRequestsResponse } from '@nestjs/swagger';
import type { RateLimitRule } from '@oz/auth';
import { ApiErrorDto } from '../errors/api-error.dto.js';
import { RateLimitGuard } from './rate-limit.guard.js';

/** Ce qui est compté : l'IP du client (IPv6 par /64) ou l'adresse email saisie dans le corps. */
export type RateLimitSubject = 'ip' | 'email';

export interface RateLimitSpec {
  readonly rule: RateLimitRule;
  readonly by: RateLimitSubject;
}

export const RATE_LIMIT_SPECS = 'oz:rate-limit-specs';

/**
 * Soumet la route aux règles données (lot 1.3ca, EX-T18), avant la validation du corps : une requête
 * invalide compte aussi. Au-delà : 429 `RATE_LIMITED` avec `Retry-After`, documenté dans OpenAPI.
 */
export const RateLimit = (
  specs: readonly RateLimitSpec[],
  description = 'Limite de débit atteinte',
) =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_SPECS, specs),
    UseGuards(RateLimitGuard),
    ApiTooManyRequestsResponse({
      type: ApiErrorDto,
      description,
      headers: {
        'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
      },
    }),
  );
