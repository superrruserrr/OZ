import type { AccessTokenOutput } from '@oz/contracts';

/*
 * Cookies de session du site (ADR-010). `__Host-` impose Secure, Path=/ et aucun Domain ; HttpOnly
 * les cache au JavaScript du navigateur ; SameSite=Strict ne les envoie jamais depuis un autre site.
 * Le jeton d'accès n'est décodé ici que pour son échéance et son sujet : l'API vérifie la signature
 * à chaque appel, le site n'accorde aucun droit sur la foi de ce décodage.
 */

export const ACCESS_COOKIE = '__Host-oz_access';
export const REFRESH_COOKIE = '__Host-oz_refresh';
export const CHALLENGE_COOKIE = '__Host-oz_2fa';

/** Défi du second facteur (300 s côté API). */
export const CHALLENGE_MAX_AGE = 300;

const STRICT = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' } as const;
/** Même forme que `REFRESH_TOKEN_PATTERN` de `@oz/auth` (32 octets en base64url). */
const REFRESH_VALUE = /^[A-Za-z0-9_-]{43}$/;
const MAX_TOKEN_LENGTH = 4_096;

export interface CookieSpec {
  readonly name: string;
  readonly value: string;
  readonly options: typeof STRICT & { readonly maxAge: number };
}

/** Écrit une liste de cookies sur `cookies()` (action serveur) ou `NextResponse.cookies`. */
export interface CookieWriter {
  set(name: string, value: string, options: CookieSpec['options']): unknown;
}

export function writeCookies(target: CookieWriter, specs: readonly CookieSpec[]): void {
  for (const spec of specs) target.set(spec.name, spec.value, spec.options);
}

export function cookie(name: string, value: string, maxAge: number): CookieSpec {
  return { name, value, options: { ...STRICT, maxAge } };
}

/** Cookie `__Host-oz_refresh` parmi les `Set-Cookie` de l'API : valeur et durée restante. */
export function refreshFromSetCookie(
  setCookies: readonly string[],
  now: number = Date.now(),
): { value: string; maxAge: number } | null {
  for (const header of setCookies) {
    const [pair = '', ...attributes] = header.split(';');
    const separator = pair.indexOf('=');
    if (separator === -1 || pair.slice(0, separator).trim() !== REFRESH_COOKIE) continue;
    const value = pair.slice(separator + 1).trim();
    if (!REFRESH_VALUE.test(value)) return null;
    let maxAge: number | undefined;
    let expires: number | undefined;
    for (const attribute of attributes) {
      const [key = '', raw = ''] = attribute.split('=').map((part) => part.trim());
      if (key.toLowerCase() === 'max-age') maxAge = Number(raw);
      if (key.toLowerCase() === 'expires') expires = Date.parse(raw);
    }
    const seconds =
      maxAge !== undefined && Number.isFinite(maxAge)
        ? Math.floor(maxAge)
        : expires !== undefined && Number.isFinite(expires)
          ? Math.floor((expires - now) / 1000)
          : NaN;
    return Number.isFinite(seconds) && seconds > 0 ? { value, maxAge: seconds } : null;
  }
  return null;
}

/** Au-delà, un navigateur ignore le cookie sans rien dire : la session serait perdue en silence. */
const MAX_COOKIE_VALUE = 3_800;

/**
 * Cookies à poser après une connexion ou un renouvellement ; `null` si la réponse ne permet pas une
 * session durable (rafraîchissement absent ou illisible, jeton d'accès trop long). L'appelant traite
 * alors l'échec : garder l'ancien jeton déjà consommé provoquerait un rejeu, donc une révocation.
 */
export function sessionCookies(
  access: AccessTokenOutput,
  setCookies: readonly string[],
  now: number = Date.now(),
): CookieSpec[] | null {
  const refresh = refreshFromSetCookie(setCookies, now);
  if (refresh === null || access.accessToken.length > MAX_COOKIE_VALUE) return null;
  return [
    cookie(ACCESS_COOKIE, access.accessToken, access.expiresIn),
    cookie(REFRESH_COOKIE, refresh.value, refresh.maxAge),
  ];
}

/** Effacement : mêmes attributs, sinon le navigateur refuse un cookie `__Host-`. */
export function clearedSessionCookies(): CookieSpec[] {
  return [ACCESS_COOKIE, REFRESH_COOKIE, CHALLENGE_COOKIE].map((name) => cookie(name, '', 0));
}

export interface AccessToken {
  readonly token: string;
  readonly userId: string;
  /** Échéance en millisecondes depuis l'époque. */
  readonly expiresAt: number;
}

/** Sujet et échéance du jeton d'accès, sans vérifier la signature (rôle de l'API). */
export function readAccessToken(token: string | undefined): AccessToken | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[1] === undefined) return null;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload !== 'object' || payload === null) return null;
    const { sub, exp } = payload as { sub?: unknown; exp?: unknown };
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 64) return null;
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return null;
    return { token, userId: sub, expiresAt: exp * 1000 };
  } catch {
    return null;
  }
}

/** Valeur plausible d'un cookie de rafraîchissement reçu du navigateur. */
export function isRefreshValue(value: string | undefined): value is string {
  return value !== undefined && REFRESH_VALUE.test(value);
}
