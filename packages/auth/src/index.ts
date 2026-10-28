/** Primitives d'authentification (lot 1.3) */
export const PACKAGE_NAME = '@oz/auth' as const;

export {
  checkPasswordPolicy,
  isAcceptablePasswordInput,
  normalizePassword,
  passwordLength,
  PASSWORD_MAX_INPUT_UNITS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type PasswordPolicyCode,
} from './password-policy.js';
export {
  ARGON2_PARAMS,
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './argon2.js';
export {
  PWNED_DEFAULT_TIMEOUT_MS,
  PwnedPasswordsClient,
  type FetchLike,
  type PwnedClientOptions,
  type PwnedResult,
} from './pwned.js';
export {
  generateOneTimeToken,
  hashOneTimeToken,
  ONE_TIME_TOKEN_PATTERN,
  type TokenRandomSource,
} from './one-time-token.js';
export { BACKOFF_FREE_FAILURES, BACKOFF_MAX_SECONDS, backoffSeconds } from './backoff.js';
export {
  ACCESS_TOKEN_MIN_KEY_BYTES,
  ACCESS_TOKEN_TTL_SECONDS,
  AccessTokens,
  type AccessTokenSubject,
  type IssuedAccessToken,
} from './access-token.js';
export {
  generateRefreshToken,
  hashRefreshToken,
  REFRESH_TOKEN_MIN_KEY_BYTES,
  REFRESH_TOKEN_PATTERN,
} from './refresh-token.js';
