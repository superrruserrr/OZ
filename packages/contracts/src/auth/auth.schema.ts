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
