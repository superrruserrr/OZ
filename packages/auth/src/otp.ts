import { createHmac, randomInt } from 'node:crypto';

// OTP de vérification du téléphone (lot 1.3cc, D3 et D4) : fonctions pures, le stockage est dans
// l'API. Le code n'est jamais conservé en clair, seulement son empreinte liée au compte.

const OTP_SPACE = 1_000_000;
export const OTP_PATTERN = /^\d{6}$/;

/** Tire six chiffres uniformes ; `draw` est injectable en test. */
export function generateOtpCode(draw: (max: number) => number = randomInt): string {
  return String(draw(OTP_SPACE)).padStart(6, '0');
}

export function otpDigest(key: string | Uint8Array, userId: string, code: string): string {
  return createHmac('sha256', key).update(`phone-otp:${userId}:${code}`).digest('hex');
}

/** Liste blanche d'indicatifs : parade au pompage de SMS (D3). */
export const phoneAllowed = (phone: string, prefixes: readonly string[]): boolean =>
  prefixes.some((prefix) => phone.startsWith(prefix));
