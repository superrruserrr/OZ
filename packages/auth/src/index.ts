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
export {
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_RULES,
  resolveRateLimits,
  slidingLogDecision,
  SLIDING_LOG_SCRIPT,
  type RateLimit,
  type RateLimitDecision,
  type RateLimitRule,
  type RateLimits,
} from './rate-limit.js';
export {
  checkFormToken,
  FORM_TOKEN_MAX_AGE_MS,
  FORM_TOKEN_MIN_AGE_MS,
  FORM_TOKEN_PATTERN,
  issueFormToken,
  type FormTokenVerdict,
} from './form-token.js';
export {
  RECAPTCHA_DEFAULT_TIMEOUT_MS,
  RecaptchaVerifier,
  type RecaptchaFetch,
  type RecaptchaVerdict,
  type RecaptchaVerifierOptions,
} from './recaptcha.js';
export {
  generateTotpCode,
  generateTotpSecret,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  totpStep,
  totpUri,
  verifyTotpCode,
} from './totp.js';
export {
  generateRecoveryCodes,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes.js';
