/** Schémas Zod partagés client / serveur (lot 0.5) : un schéma, deux exécutions (§7.1). */
export const PACKAGE_NAME = '@oz/contracts' as const;

export {
  consent,
  currentPassword,
  email,
  longText,
  newPassword,
  oneTimeToken,
  personName,
} from './common/fields.js';
export {
  ORGANISATION_TYPES,
  sendContactMessageSchema,
  type SendContactMessageInput,
} from './contact/send-contact-message.schema.js';
export {
  accessTokenOutputSchema,
  formTokenOutputSchema,
  loginSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  sessionListOutputSchema,
  sessionParamsSchema,
  verifyEmailSchema,
  type AccessTokenOutput,
  type FormTokenOutput,
  type LoginInput,
  type RegisterInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SessionListOutput,
  type SessionParamsInput,
  type VerifyEmailInput,
} from './auth/auth.schema.js';
