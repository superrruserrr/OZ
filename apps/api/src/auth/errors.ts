import { AppException } from '../common/errors/api-error.js';

/** Réponse générique : ne dit jamais si l'email existe ni pourquoi l'accès est refusé (CP-28). */
export const INVALID_CREDENTIALS = (): AppException =>
  new AppException(401, 'AUTH_INVALID_CREDENTIALS', 'Email ou mot de passe incorrect.');
/** Rafraîchissement impossible : même réponse pour un jeton absent, inconnu, expiré ou rejoué. */
export const UNAUTHENTICATED = (): AppException =>
  new AppException(401, 'AUTH_UNAUTHENTICATED', 'Session expirée : reconnectez-vous.');

/** Refus d'autorisation : même réponse quelle que soit la règle qui refuse (CP-09). */
export const AUTHZ_FORBIDDEN = (): AppException =>
  new AppException(403, 'AUTHZ_FORBIDDEN', 'Accès refusé.');

/** Accès refusé tant que l'adresse n'est pas confirmée (EX-103 n° 9). */
export const EMAIL_UNVERIFIED = (): AppException =>
  new AppException(
    403,
    'AUTH_EMAIL_UNVERIFIED',
    'Adresse email à confirmer : suivez le lien reçu par email.',
  );

/** Attente imposée par le délai exponentiel, portée jusqu'à l'en-tête Retry-After. */
export class RetryLaterException extends AppException {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'AUTH_RETRY_LATER', 'Trop de tentatives : réessayez plus tard.');
  }
}

/** Second temps de la connexion : même réponse pour un défi inconnu, épuisé ou un code faux. */
export const TWO_FACTOR_INVALID = (): AppException =>
  new AppException(401, 'AUTH_2FA_INVALID', 'Code incorrect ou expiré.');

/** Session restreinte (D6 du lot 1.3cb) : seul l'enrôlement reste possible. */
export const TWO_FACTOR_ENROLLMENT_REQUIRED = (): AppException =>
  new AppException(
    403,
    'AUTH_2FA_ENROLLMENT_REQUIRED',
    'Activez la validation en deux étapes pour continuer.',
  );
