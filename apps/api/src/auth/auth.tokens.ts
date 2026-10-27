/** Configuration des comptes (présente car FEATURE_AUTH=true). */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
/** Client HaveIBeenPwned (remplacé par un double dans les tests). */
export const PWNED_CLIENT = Symbol('PWNED_CLIENT');
/**
 * Durée minimale des réponses d'inscription et de demande de réinitialisation, en millisecondes :
 * le temps de réponse ne dépend pas de l'existence du compte (CP-28).
 */
export const AUTH_RESPONSE_FLOOR_MS = Symbol('AUTH_RESPONSE_FLOOR_MS');

/** Durées de vie des jetons envoyés par email (affichées dans les gabarits). */
export const VERIFICATION_TTL_SECONDS = 24 * 3_600;
export const RESET_TTL_SECONDS = 30 * 60;
