import { REFRESH_TOKEN_PATTERN } from '@oz/auth';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/api-error.js';

// Cookie du jeton de rafraîchissement (EX-103 n° 4) : `__Host-` impose Secure, Path=/ et aucun
// Domain (ni sous-domaine ni chemin ne peut le remplacer) ; HttpOnly le cache au JavaScript (XSS) ;
// SameSite=Strict ne l'envoie jamais depuis un autre site. Le jeton d'accès, lui, reste en mémoire
// côté client (EX-103 n° 3) : il n'est jamais posé en cookie.

export const REFRESH_COOKIE = '__Host-oz_refresh';

const OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict', path: '/' } as const;

/** Jeton du cookie s'il a la forme attendue ; tout autre contenu est ignoré (jamais haché ni journalisé). */
export function readRefreshCookie(req: Request): string | null {
  const header = req.headers.cookie;
  if (header === undefined || header.length > 8_192) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator !== -1 && part.slice(0, separator).trim() === REFRESH_COOKIE) {
      const value = part.slice(separator + 1).trim();
      return REFRESH_TOKEN_PATTERN.test(value) ? value : null;
    }
  }
  return null;
}

/** Pose le cookie jusqu'à l'échéance de la session (glissante, bornée par la famille). */
export function setRefreshCookie(res: Response, token: string, expiresAt: Date, now: Date): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...OPTIONS,
    maxAge: Math.max(0, expiresAt.getTime() - now.getTime()),
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, OPTIONS);
}

/**
 * Routes qui lisent le cookie : l'origine doit figurer dans la liste blanche CORS (CSRF), en plus de
 * SameSite=Strict. Une requête sans en-tête Origin est refusée : un navigateur l'envoie toujours sur
 * un POST, son absence trahit un client qui n'est pas le site.
 */
export function assertTrustedOrigin(req: Request, allowed: readonly string[]): void {
  const origin = req.header('Origin');
  if (origin === undefined || !allowed.includes(origin)) {
    throw new AppException(403, 'AUTH_ORIGIN_REFUSED', 'Origine de la requête refusée.');
  }
}
