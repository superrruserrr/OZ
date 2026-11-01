import { AppException } from '../errors/api-error.js';

/** Limite de débit atteinte (EX-T18) : 429 `RATE_LIMITED`, attente annoncée par `Retry-After`. */
export class RateLimitedException extends AppException {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', 'Trop de requêtes : réessayez plus tard.');
  }
}
