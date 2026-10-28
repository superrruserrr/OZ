import { z } from 'zod';
import { currentPassword, email, newPassword, oneTimeToken } from '../common/fields.js';

// Authentification (lot 1.3a, EX-103) : briques dans `common/fields.ts`.

export const registerSchema = z.strictObject({ email, password: newPassword });
export type RegisterInput = z.infer<typeof registerSchema>;

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
