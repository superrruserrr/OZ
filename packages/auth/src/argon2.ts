import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { isAcceptablePasswordInput, normalizePassword } from './password-policy.js';

/** Paramètres OWASP figés (EX-103 n° 2, §6.2) : m=19456 Kio, t=2, p=1. */
export const ARGON2_PARAMS = Object.freeze({ memoryCost: 19456, timeCost: 2, parallelism: 1 });

// Algorithme et version par défaut du paquet : Argon2id, version 0x13 (vérifiés par test sur le
// préfixe PHC). Ses `const enum` sont inaccessibles sous `isolatedModules`.
const OPTIONS = { ...ARGON2_PARAMS };

/** Préfixe PHC d'un hash aux paramètres courants. */
const CURRENT_PREFIX = `$argon2id$v=19$m=${String(ARGON2_PARAMS.memoryCost)},t=${String(
  ARGON2_PARAMS.timeCost,
)},p=${String(ARGON2_PARAMS.parallelism)}$`;

/** Hash PHC Argon2id du mot de passe normalisé, salé aléatoirement. */
export function hashPassword(password: string): Promise<string> {
  if (!isAcceptablePasswordInput(password)) {
    return Promise.reject(
      new RangeError('mot de passe hors politique : appliquer checkPasswordPolicy'),
    );
  }
  return hash(normalizePassword(password), OPTIONS);
}

/**
 * Vrai si le mot de passe correspond. Une entrée démesurée ou mal formée est refusée sans calcul
 * (rien n'y dépend du compte) ; un hash illisible est un échec, jamais une exception : l'appelant
 * contrôle les hashes à l'écriture (`oz_auth_is_password_hash` en base).
 */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  if (!isAcceptablePasswordInput(password)) return false;
  try {
    return await verify(storedHash, normalizePassword(password));
  } catch {
    return false;
  }
}

/** Vrai si le hash n'est pas un Argon2id aux paramètres courants (à refaire après connexion). */
export function needsRehash(storedHash: string): boolean {
  return !storedHash.startsWith(CURRENT_PREFIX);
}

let dummy: Promise<string> | undefined;

/**
 * Hash d'un secret aléatoire jamais conservé : vérifié quand le compte n'existe pas, pour que la
 * réponse prenne le même temps (CP-28). Calculé une fois par processus.
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword(randomBytes(32).toString('base64url')).catch((error: unknown) => {
    dummy = undefined; // un échec passager ne doit pas rester en cache pour la vie du processus
    throw error;
  });
  return dummy;
}
