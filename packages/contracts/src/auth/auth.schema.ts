import { z } from 'zod';
import { currentPassword, email, newPassword, oneTimeToken, totpCode } from '../common/fields.js';

// Authentification (lot 1.3a, EX-103) : briques dans `common/fields.ts`.

/** Jeton de formulaire signé par le serveur (lot 1.3ca, D6) : `GET /auth/register/form`. */
const formToken = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/, { error: 'validation.token.invalid' });

export const registerSchema = z.strictObject({
  email,
  password: newPassword,
  formToken,
  /** Champ piège (D6) : invisible pour un humain, doit rester absent ou vide. */
  website: z.string().max(200).optional(),
  /** Jeton reCAPTCHA v3 (D4), action `register`. */
  recaptchaToken: z.string().max(4_000).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const formTokenOutputSchema = z.strictObject({ formToken });
export type FormTokenOutput = z.infer<typeof formTokenOutputSchema>;

export const verifyEmailSchema = z.strictObject({ token: oneTimeToken });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const requestPasswordResetSchema = z.strictObject({ email });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.strictObject({ token: oneTimeToken, password: newPassword });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Connexion (route exposée au lot 1.3b). */
export const loginSchema = z.strictObject({ email, password: currentPassword });
export type LoginInput = z.infer<typeof loginSchema>;

/** Jeton d'accès rendu par la connexion et le rafraîchissement (lot 1.3b) ; jamais dans un cookie. */
export const accessTokenOutputSchema = z.strictObject({
  accessToken: z.string().min(1),
  /** Durée de vie en secondes (900). */
  expiresIn: z.number().int().positive(),
});
export type AccessTokenOutput = z.infer<typeof accessTokenOutputSchema>;

// 2FA TOTP (lot 1.3cb, EX-103 n° 7).

/** Code TOTP, ou code de secours (`ABCD-EFGH-IJKL-MNOP`, casse et séparateurs libres). */
const secondFactorCode = z
  .string()
  .trim()
  .regex(/^([0-9]{6}|[A-Za-z2-7 -]{16,19})$/, { error: 'validation.token.invalid' });

/** Second temps de la connexion, après `{ status: '2fa_required' }`. */
export const loginTwoFactorSchema = z.strictObject({
  challengeToken: oneTimeToken,
  code: secondFactorCode,
});
export type LoginTwoFactorInput = z.infer<typeof loginTwoFactorSchema>;

/** Mot de passe juste, second facteur attendu : aucune session n'est encore ouverte. */
export const twoFactorChallengeOutputSchema = z.strictObject({
  status: z.literal('2fa_required'),
  challengeToken: oneTimeToken,
  /** Durée de vie du défi en secondes (300). */
  expiresIn: z.number().int().positive(),
});
export type TwoFactorChallengeOutput = z.infer<typeof twoFactorChallengeOutputSchema>;

export const loginOutputSchema = z.union([accessTokenOutputSchema, twoFactorChallengeOutputSchema]);
export type LoginOutput = z.infer<typeof loginOutputSchema>;

/** Enrôlement : à montrer une fois, jamais à conserver côté client. */
export const twoFactorSetupOutputSchema = z.strictObject({
  /** Secret en base32, pour une saisie manuelle. */
  secret: z.string().regex(/^[A-Z2-7]{32}$/),
  uri: z.string().startsWith('otpauth://totp/'),
  /** QR de `uri`, en SVG autonome. */
  qrSvg: z.string().startsWith('<svg'),
});
export type TwoFactorSetupOutput = z.infer<typeof twoFactorSetupOutputSchema>;

export const twoFactorEnableSchema = z.strictObject({
  code: totpCode,
  /** Changement d'appareil : code de l'appareil actuel, ou code de secours. */
  currentCode: secondFactorCode.optional(),
});
export type TwoFactorEnableInput = z.infer<typeof twoFactorEnableSchema>;

export const twoFactorDisableSchema = z.strictObject({
  password: currentPassword,
  code: secondFactorCode,
});
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;

/** Code TOTP seul (D5) : perdre son appareil passe par le changement d'appareil. */
export const twoFactorRecoveryCodesSchema = z.strictObject({ code: totpCode });
export type TwoFactorRecoveryCodesInput = z.infer<typeof twoFactorRecoveryCodesSchema>;

/** Codes de secours : montrés cette seule fois. */
export const recoveryCodesOutputSchema = z.strictObject({
  recoveryCodes: z.array(z.string().regex(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/)).length(10),
});
export type RecoveryCodesOutput = z.infer<typeof recoveryCodesOutputSchema>;

/** Session désignée par sa famille, identifiant stable malgré les rotations (lot 1.3b). */
export const sessionParamsSchema = z.strictObject({ id: z.uuid() });
export type SessionParamsInput = z.infer<typeof sessionParamsSchema>;

/** Sessions valides de l'utilisateur (EX-103 n° 6) : ni empreinte, ni IP complète, ni User-Agent brut. */
export const sessionListOutputSchema = z.strictObject({
  sessions: z.array(
    z.strictObject({
      id: z.uuid(),
      /** Libellé déduit du User-Agent (« Firefox · macOS »). */
      device: z.string().max(100).nullable(),
      /** IP tronquée (/24, /48), notation CIDR. */
      ip: z.string().max(50).nullable(),
      createdAt: z.iso.datetime(),
      lastUsedAt: z.iso.datetime().nullable(),
      /** Session du jeton d'accès de la requête. */
      current: z.boolean(),
    }),
  ),
});
export type SessionListOutput = z.infer<typeof sessionListOutputSchema>;
