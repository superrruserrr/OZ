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

/** Signataire des jetons d'accès (lot 1.3b), construit sur `JWT_ACCESS_SECRET`. */
export const ACCESS_TOKENS = Symbol('ACCESS_TOKENS');
/** Durée absolue d'une famille de sessions : reconnexion obligatoire ensuite (D1 du lot 1.3b). */
export const SESSION_FAMILY_TTL_SECONDS = 90 * 86_400;
/** Vérificateur reCAPTCHA v3 (lot 1.3ca, D4) ; null quand aucun secret n'est configuré (local). */
export const RECAPTCHA_VERIFIER = Symbol('RECAPTCHA_VERIFIER');
/** Durée d'un défi de second facteur et nombre d'essais (D4 du lot 1.3cb). */
export const LOGIN_CHALLENGE_TTL_SECONDS = 300;
export const LOGIN_CHALLENGE_MAX_ATTEMPTS = 5;
/** Chaîne d'envoi des OTP (lot 1.3cc, D6). */
export const SMS_CHAIN = Symbol('SMS_CHAIN');
/** Code de vérification du téléphone (D4 du lot 1.3cc). */
export const PHONE_CHALLENGE_TTL_SECONDS = 300;
export const PHONE_CHALLENGE_MAX_ATTEMPTS = 5;
export const PHONE_RESEND_SECONDS = 60;
