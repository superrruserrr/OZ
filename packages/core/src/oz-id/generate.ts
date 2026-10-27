import { crockfordSymbol } from './crockford.js';
import { formatOzId, type OzId } from './oz-id.js';

/** Remplit le tableau d'octets aléatoires ; par défaut `crypto.getRandomValues` (jamais `Math.random`). */
export type RandomSource = (target: Uint8Array) => void;

/** Tirages au plus par émission : au-delà, l'espace du couple (pays, année) est anormalement saturé. */
export const OZ_ID_MAX_ATTEMPTS = 10;

export class OzIdExhaustedError extends Error {
  readonly code = 'OZ_ID_EXHAUSTED';
  constructor(readonly attempts: number) {
    super(`aucun OZ ID libre après ${String(attempts)} tirages`);
    this.name = 'OzIdExhaustedError';
  }
}

interface CryptoLike {
  getRandomValues(target: Uint8Array): Uint8Array;
}

const cryptoSource: RandomSource = (target) => {
  const api = (globalThis as { crypto?: CryptoLike }).crypto;
  if (api === undefined) {
    throw new Error('OZ ID : aléa cryptographique indisponible (crypto.getRandomValues)');
  }
  api.getRandomValues(target);
};

/**
 * Partie aléatoire de l'OZ ID : six symboles Crockford, 5 bits par octet. 256 étant multiple de 32,
 * le tirage est uniforme ; l'identifiant ne révèle ni ordre ni nombre d'inscrits (EX-102 n° 3).
 */
export function randomOzIdPart(source: RandomSource = cryptoSource): string {
  const bytes = new Uint8Array(6);
  source(bytes);
  return Array.from(bytes, (byte) => crockfordSymbol(byte & 31)).join('');
}

/** OZ ID complet tiré au hasard ; l'unicité vient du registre, jamais du seul hasard. */
export function generateOzId(
  parts: { readonly country: string; readonly year: number },
  source?: RandomSource,
): OzId {
  return formatOzId({ ...parts, random: randomOzIdPart(source) });
}

/**
 * Tire une partie aléatoire et tente de la réserver, jusqu'à `OZ_ID_MAX_ATTEMPTS` fois. `reserve`
 * rend `null` si la partie est déjà prise ; toute erreur de `reserve` est remontée sans nouveau tirage.
 */
export async function issueWithRetry<T>(
  reserve: (random: string) => T | null | Promise<T | null>,
  source?: RandomSource,
): Promise<{ value: T; attempts: number }> {
  for (let attempt = 1; attempt <= OZ_ID_MAX_ATTEMPTS; attempt += 1) {
    const value = await reserve(randomOzIdPart(source));
    if (value !== null) return { value, attempts: attempt };
  }
  throw new OzIdExhaustedError(OZ_ID_MAX_ATTEMPTS);
}
