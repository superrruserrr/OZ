import { createHmac, randomBytes } from 'node:crypto';

// Codes de secours de la 2FA (lot 1.3cb, D5) : montrés une seule fois à l'activation, conservés en
// empreinte HMAC. La recherche se fait par égalité d'empreinte, comme pour les jetons à usage unique
// (aucune comparaison de secret en clair).

export const RECOVERY_CODE_COUNT = 10;

// 80 bits en base32 : 16 caractères sans 0, 1, 8 ni 9, qu'on ne confond pas à la recopie.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const CODE_BYTES = 10;
const CODE_CHARS = 16;
const BITS_PER_CHAR = 5;
const NORMALIZED = /^[A-Z2-7]{16}$/;

// Séparation de domaine : la même clé (`AUTH_HMAC_KEY`) sert à d'autres empreintes.
const DOMAIN = 'oz:recovery-code:v1:';

function generateCode(): string {
  const value = BigInt(`0x${randomBytes(CODE_BYTES).toString('hex')}`);
  let code = '';
  for (let i = 0; i < CODE_CHARS; i++) {
    const shift = BigInt((CODE_CHARS - 1 - i) * BITS_PER_CHAR);
    code += ALPHABET.charAt(Number((value >> shift) & 31n));
  }
  return code.replace(/(.{4})(?=.)/g, '$1-');
}

/** Dix codes de la forme `ABCD-EFGH-IJKL-MNOP`. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, generateCode);
}

/** Forme canonique d'une saisie (casse, tirets, espaces), ou `null` si ce n'est pas un code. */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return NORMALIZED.test(code) ? code : null;
}

/** Empreinte conservée en base. Lève sur une saisie qui n'est pas un code. */
export function hashRecoveryCode(key: string | Uint8Array, input: string): string {
  const code = normalizeRecoveryCode(input);
  if (code === null) throw new Error('code de secours mal formé');
  return createHmac('sha256', key)
    .update(DOMAIN + code)
    .digest('hex');
}
