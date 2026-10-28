import { createHash } from 'node:crypto';

/** Remplit le tableau d'octets aléatoires ; par défaut `crypto.getRandomValues`. */
export type TokenRandomSource = (target: Uint8Array) => void;

/** 32 octets en base64url sans remplissage : exactement 43 caractères. */
export const ONE_TIME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const TOKEN_BYTES = 32;

/** Jeton de confirmation d'email ou de réinitialisation, envoyé une seule fois par email. */
export function generateOneTimeToken(
  random: TokenRandomSource = (target) => crypto.getRandomValues(target),
): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  random(bytes);
  return Buffer.from(bytes).toString('base64url');
}

/**
 * Empreinte SHA-256 conservée en base : le jeton (256 bits d'aléa) n'y figure jamais, et la
 * recherche se fait par égalité d'empreinte (aucune comparaison de secret en clair).
 */
export function hashOneTimeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
