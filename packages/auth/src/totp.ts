import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

// TOTP (lot 1.3cb, D1 et D2) : RFC 6238 en SHA-1, 6 chiffres, 30 s, seuls réglages compris par toutes
// les applications d'authentification. Le chiffrement du secret et le dernier pas accepté vivent en
// base ; ce module ne connaît que des secrets en clair, le temps d'un calcul.

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Tolérance d'horloge : un pas de part et d'autre. */
export const TOTP_WINDOW_STEPS = 1;

const ISSUER = 'OZ';
const CODE_PATTERN = /^[0-9]{6}$/;

const epochSeconds = (nowMs: number): number => Math.floor(nowMs / 1000);

/** Numéro du pas de temps à l'instant `nowMs`. */
export const totpStep = (nowMs: number): number =>
  Math.floor(epochSeconds(nowMs) / TOTP_PERIOD_SECONDS);

/** Secret de 160 bits (RFC 4226 §4), en base32. */
export function generateTotpSecret(): string {
  return generateSecret({ length: 20 });
}

/** URI `otpauth://` du QR d'enrôlement. Contient le secret : ni journal, ni cache. */
export function totpUri(input: { readonly secret: string; readonly label: string }): string {
  return generateURI({
    issuer: ISSUER,
    label: input.label,
    secret: input.secret,
    algorithm: 'sha1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
  });
}

/** Code valable à `nowMs`. Ne sert qu'aux tests et aux parcours E2E : l'API ne fait que vérifier. */
export function generateTotpCode(secret: string, nowMs: number): string {
  return generateSync({ secret, epoch: epochSeconds(nowMs) });
}

/**
 * Pas accepté, ou `null`. `lastStep` est le dernier pas consommé : un code n'a qu'un usage (D2),
 * que la base garantit de façon atomique.
 */
export function verifyTotpCode(input: {
  readonly secret: string;
  readonly code: string;
  readonly nowMs: number;
  readonly lastStep?: number | null;
}): number | null {
  if (!CODE_PATTERN.test(input.code)) return null;
  // Dernier pas au-delà de la fenêtre (horloges d'instances décalées) : rien d'acceptable, et
  // otplib lèverait au lieu de refuser.
  const { lastStep } = input;
  if (typeof lastStep === 'number' && lastStep >= totpStep(input.nowMs) + TOTP_WINDOW_STEPS) {
    return null;
  }
  const result = verifySync({
    secret: input.secret,
    token: input.code,
    epoch: epochSeconds(input.nowMs),
    epochTolerance: TOTP_WINDOW_STEPS * TOTP_PERIOD_SECONDS,
    ...(typeof lastStep === 'number' ? { afterTimeStep: lastStep } : {}),
  });
  return result.valid ? totpStep(input.nowMs) + result.delta : null;
}
