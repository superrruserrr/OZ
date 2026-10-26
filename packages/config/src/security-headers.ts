/**
 * En-têtes de sécurité des applications web (plan §6.5, EX-T17.2), partagés par web et admin.
 * La CSP repose sur un nonce par requête (`'strict-dynamic'`) : jamais `'unsafe-inline'`.
 */

export interface PageSecurityOptions {
  /** Nonce de la requête, issu de `createNonce()`. */
  readonly nonce: string;
  /** `next dev` : `eval` (piles d'erreur de React) et styles inline (overlay) ; jamais en production. */
  readonly development: boolean;
  /** Requête reçue en HTTPS (directement ou derrière un proxy TLS) : HSTS et mise à niveau. */
  readonly secureTransport: boolean;
}

// Base64 de 16 octets : rien qui puisse fermer la source `'nonce-…'` ou ajouter une directive.
const NONCE = /^[A-Za-z0-9+/]{22}==$/;

/** Environnements de déploiement (même liste que la configuration de l'API). */
export const APP_ENVS = ['local', 'preview', 'staging', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/**
 * `APP_ENV` des applications web, validé comme pour l'API : une valeur inconnue lève une erreur au lieu
 * de priver la recette ou la production de HSTS. Obligatoire pour un build de production.
 */
export function resolveAppEnv(raw: string | undefined, nodeEnv: string | undefined): AppEnv {
  if (raw === undefined) {
    if (nodeEnv === 'production') throw new Error('APP_ENV manquant pour un build de production.');
    return 'local';
  }
  const env = APP_ENVS.find((candidate) => candidate === raw);
  if (!env) throw new Error(`APP_ENV invalide (attendu : ${APP_ENVS.join(', ')}).`);
  return env;
}

/**
 * La requête doit-elle recevoir HSTS et `upgrade-insecure-requests` ? Recette et production sont
 * toujours servies en HTTPS (Cloudflare, TD-009) : la réponse ne dépend alors d'aucun en-tête. Ailleurs
 * (poste, prévisualisation), le protocole reçu ou le premier `x-forwarded-proto` décide.
 */
export function isSecureRequest(request: {
  appEnv: AppEnv;
  protocol: string;
  forwardedProto: string | null;
}): boolean {
  if (request.appEnv === 'staging' || request.appEnv === 'production') return true;
  const forwarded = request.forwardedProto?.split(',')[0]?.trim().toLowerCase();
  return (forwarded ?? request.protocol.replace(':', '')) === 'https';
}

/** Nonce de 128 bits aléatoires, encodé en base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/** En-têtes indépendants de la requête : à poser aussi sur les fichiers statiques. */
export function staticSecurityHeaders(options: { noIndex?: boolean } = {}): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    'X-Frame-Options': 'DENY',
    ...(options.noIndex ? { 'X-Robots-Tag': 'noindex, nofollow' } : {}),
  };
}

/** En-têtes d'une page rendue : CSP avec nonce, HSTS sur connexion chiffrée, en-têtes communs. */
export function pageSecurityHeaders(
  { nonce, development, secureTransport }: PageSecurityOptions,
  options: { noIndex?: boolean } = {},
): Record<string, string> {
  if (!NONCE.test(nonce)) throw new Error('Nonce CSP invalide : utiliser createNonce().');
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    // L'overlay de `next dev` injecte des styles inline ; un nonce y désactiverait 'unsafe-inline'.
    development ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(secureTransport ? ['upgrade-insecure-requests'] : []),
  ].join('; ');

  return {
    'Content-Security-Policy': policy,
    ...(secureTransport
      ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload' }
      : {}),
    ...staticSecurityHeaders(options),
  };
}
