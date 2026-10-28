import { createHmac } from 'node:crypto';
import { generateOneTimeToken, type TokenRandomSource } from './one-time-token.js';

/** Jeton de rafraîchissement : 32 octets en base64url, comme les jetons à usage unique. */
export const REFRESH_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** Taille minimale de la clé d'empreinte, en octets. */
export const REFRESH_TOKEN_MIN_KEY_BYTES = 64;

/** Jeton opaque remis dans le cookie `httpOnly` ; jamais stocké en clair. */
export function generateRefreshToken(random?: TokenRandomSource): string {
  return generateOneTimeToken(random);
}

/**
 * Empreinte HMAC-SHA-256 (hexadécimal, 64 caractères) conservée dans `sessions.refresh_token_hash`.
 * La clé (`JWT_REFRESH_SECRET`) rend une fuite de la table inexploitable ; la changer invalide
 * toutes les sessions.
 */
export function hashRefreshToken(token: string, key: Uint8Array): string {
  // L'appelant valide le cookie ; cette garde borne l'entrée hachée quoi qu'il arrive.
  if (!REFRESH_TOKEN_PATTERN.test(token))
    throw new TypeError('jeton de rafraîchissement mal formé');
  if (key.byteLength < REFRESH_TOKEN_MIN_KEY_BYTES) {
    throw new RangeError(`clé de ${String(REFRESH_TOKEN_MIN_KEY_BYTES)} octets au moins`);
  }
  return createHmac('sha256', key).update(token, 'utf8').digest('hex');
}
