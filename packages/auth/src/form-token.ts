import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Jeton de formulaire d'inscription (lot 1.3ca, D6) : le serveur date lui-même l'ouverture du
// formulaire, le client ne peut pas falsifier la durée de remplissage. Contenu : horodatage et aléa,
// aucune donnée personnelle. Forme : `<charge 24 octets>.<HMAC-SHA-256>` en base64url.

/** Âge minimal : en deçà, formulaire rempli trop vite pour un humain. */
export const FORM_TOKEN_MIN_AGE_MS = 3_000;
/** Âge maximal : au-delà, le formulaire doit être rechargé. */
export const FORM_TOKEN_MAX_AGE_MS = 2 * 3_600_000;

/** 24 octets (8 d'horodatage, 16 d'aléa) puis 32 octets de signature, en base64url. */
export const FORM_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/;

export type FormTokenVerdict = 'valid' | 'invalid' | 'too_fast' | 'expired';

// Séparation de domaine : la même clé (`AUTH_HMAC_KEY`) sert à d'autres empreintes.
const DOMAIN = 'oz:form-token:v1:';

const sign = (key: string | Uint8Array, payload: string): Buffer =>
  createHmac('sha256', key)
    .update(DOMAIN + payload)
    .digest();

/** Émet un jeton daté de `nowMs`. */
export function issueFormToken(key: string | Uint8Array, nowMs: number): string {
  const body = Buffer.alloc(24);
  body.writeBigUInt64BE(BigInt(Math.trunc(nowMs)));
  randomBytes(16).copy(body, 8);
  const payload = body.toString('base64url');
  return `${payload}.${sign(key, payload).toString('base64url')}`;
}

/** Vérifie la signature (temps constant) puis l'âge du jeton à `nowMs`. */
export function checkFormToken(
  key: string | Uint8Array,
  token: string,
  nowMs: number,
): FormTokenVerdict {
  if (!FORM_TOKEN_PATTERN.test(token)) return 'invalid';
  const [payload = '', mac = ''] = token.split('.');
  const given = Buffer.from(mac, 'base64url');
  // Base64url non canonique (bits de fin) : rejeté, une seule écriture valide par jeton.
  if (given.toString('base64url') !== mac) return 'invalid';
  if (!timingSafeEqual(given, sign(key, payload))) return 'invalid';
  const issuedAt = Number(Buffer.from(payload, 'base64url').readBigUInt64BE());
  const age = nowMs - issuedAt;
  if (age < FORM_TOKEN_MIN_AGE_MS) return 'too_fast';
  if (age > FORM_TOKEN_MAX_AGE_MS) return 'expired';
  return 'valid';
}
