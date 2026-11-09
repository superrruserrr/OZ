/** Logique métier pure : OZ ID, âge, règles (lot 1.2) */
export const PACKAGE_NAME = '@oz/core' as const;

export {
  CROCKFORD_ALPHABET,
  crockfordSymbol,
  crockfordValue,
  normalizeCrockford,
} from './oz-id/crockford.js';
export {
  computeOzIdCheck,
  formatOzId,
  isValidOzId,
  OZ_ID_PATTERN,
  OzIdError,
  parseOzId,
  type OzId,
  type OzIdErrorCode,
  type OzIdParts,
  type ParseOzIdResult,
} from './oz-id/oz-id.js';
export {
  generateOzId,
  issueWithRetry,
  OZ_ID_MAX_ATTEMPTS,
  OzIdExhaustedError,
  randomOzIdPart,
  type RandomSource,
} from './oz-id/generate.js';
export {
  profileQrSvg,
  profileUrl,
  QR_QUIET_ZONE,
  qrModules,
  qrSvg,
  type ProfileQrOptions,
} from './oz-id/qr.js';
