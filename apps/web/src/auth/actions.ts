'use server';

import {
  accessTokenOutputSchema,
  formTokenOutputSchema,
  loginSchema,
  loginTwoFactorSchema,
  registerSchema,
  requestPasswordResetSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  twoFactorChallengeOutputSchema,
  verifyEmailSchema,
} from '@oz/contracts';
import { cookies } from 'next/headers';
import { apiFetch, type ApiResult } from '../session/api-client';
import { clientContext } from '../session/client-context';
import {
  CHALLENGE_COOKIE,
  CHALLENGE_MAX_AGE,
  REFRESH_COOKIE,
  clearedSessionCookies,
  cookie,
  isRefreshValue,
  sessionCookies,
  writeCookies,
} from '../session/cookies';
import { safeNext } from '../session/protected-routes';

/*
 * Actions serveur des écrans de compte (lot 1.7ca, ADR-010). Chaque entrée est revalidée par le
 * schéma partagé (C2) avant l'API ; le navigateur ne reçoit qu'une clé de message et les erreurs de
 * champ, jamais un jeton ni un message de l'API.
 */

/** Clés de `auth.errors.*` dans les messages du site. */
export type AuthErrorKey =
  | 'invalidCredentials'
  | 'emailUnverified'
  | 'retryLater'
  | 'passwordBreached'
  | 'linkInvalid'
  | 'codeInvalid'
  | 'invalid'
  | 'unavailable';

export type AuthFailure = {
  readonly ok: false;
  readonly error: AuthErrorKey;
  /** Champ → code (`required`, `AUTH_PASSWORD_TOO_SHORT`…), traduits par l'écran. */
  readonly fields: Readonly<Record<string, string>>;
  readonly retryAfterSeconds?: number;
};

export type AuthResult<T = object> = ({ readonly ok: true } & T) | AuthFailure;

const failure = (error: AuthErrorKey, fields: Record<string, string> = {}): AuthFailure => ({
  ok: false,
  error,
  fields,
});

function fromApi(result: Extract<ApiResult, { ok: false }>, fallback: AuthErrorKey): AuthFailure {
  const fields = Object.fromEntries(result.details.map((detail) => [detail.field, detail.code]));
  const base = (error: AuthErrorKey): AuthFailure => ({
    ok: false,
    error,
    fields,
    ...(result.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: result.retryAfterSeconds }),
  });
  switch (result.code) {
    case 'RATE_LIMITED':
    case 'AUTH_RETRY_LATER':
      return base('retryLater');
    case 'AUTH_INVALID_CREDENTIALS':
      return base('invalidCredentials');
    case 'AUTH_EMAIL_UNVERIFIED':
      return base('emailUnverified');
    case 'AUTH_PASSWORD_BREACHED':
      return base('passwordBreached');
    case 'VALIDATION_FAILED':
      return base('invalid');
    case 'UNAVAILABLE':
      return base('unavailable');
    default:
      return base(result.status >= 500 || result.status === 0 ? 'unavailable' : fallback);
  }
}

/** Erreurs de champ d'un schéma (clés `validation.*` des contrats). */
function zodFields(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? 'form');
    fields[field] ??= issue.message;
  }
  return fields;
}

/** Jeton du formulaire d'inscription, demandé côté serveur au rendu de la page. */
export async function openSignupForm(): Promise<string | null> {
  const result = await apiFetch('/auth/register/form', {
    method: 'GET',
    client: await clientContext(),
  });
  if (!result.ok) return null;
  const parsed = formTokenOutputSchema.safeParse(result.data);
  return parsed.success ? parsed.data.formToken : null;
}

/** Création du compte : même réponse que l'email soit déjà inscrit ou non (CP-28). */
export async function registerAccount(input: unknown): Promise<AuthResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return failure('invalid', zodFields(parsed.error.issues));
  const result = await apiFetch('/auth/register', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  return result.ok ? { ok: true } : fromApi(result, 'invalid');
}

export async function verifyEmail(token: unknown): Promise<AuthResult> {
  const parsed = verifyEmailSchema.safeParse({ token });
  if (!parsed.success) return failure('linkInvalid');
  const result = await apiFetch('/auth/verify-email', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  if (result.ok) return { ok: true };
  const mapped = fromApi(result, 'linkInvalid');
  return mapped.error === 'invalid' ? failure('linkInvalid') : mapped;
}

/** Nouveau lien de confirmation (lot 1.7cc) : même réponse que le compte existe ou non (CP-28). */
export async function resendVerification(email: unknown): Promise<AuthResult> {
  const parsed = resendVerificationSchema.safeParse({ email });
  if (!parsed.success) return failure('invalid', zodFields(parsed.error.issues));
  const result = await apiFetch('/auth/verify-email/resend', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  return result.ok ? { ok: true } : fromApi(result, 'invalid');
}

/** Demande d'un lien de réinitialisation : même réponse que le compte existe ou non (CP-28). */
export async function requestPasswordReset(email: unknown): Promise<AuthResult> {
  const parsed = requestPasswordResetSchema.safeParse({ email });
  if (!parsed.success) return failure('invalid', zodFields(parsed.error.issues));
  const result = await apiFetch('/auth/password/forgot', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  return result.ok ? { ok: true } : fromApi(result, 'invalid');
}

/**
 * Nouveau mot de passe avec le jeton reçu par email. L'API ferme toutes les sessions du compte : les
 * cookies de ce navigateur sont effacés aussi, l'utilisateur se reconnecte.
 */
export async function resetPassword(token: unknown, password: unknown): Promise<AuthResult> {
  const parsed = resetPasswordSchema.safeParse({ token, password });
  if (!parsed.success) {
    const fields = zodFields(parsed.error.issues);
    return 'token' in fields ? failure('linkInvalid') : failure('invalid', fields);
  }
  const result = await apiFetch('/auth/password/reset', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  if (!result.ok) {
    // Seul un refus du jeton lui-même dit « lien invalide » : une limite, une panne ou un autre
    // refus ne doivent pas faire abandonner un lien encore valable.
    const tokenRefused =
      result.code === 'AUTH_TOKEN_INVALID' ||
      (result.code === 'VALIDATION_FAILED' &&
        result.details.some((detail) => detail.field === 'token'));
    return tokenRefused ? failure('linkInvalid') : fromApi(result, 'unavailable');
  }
  writeCookies(await cookies(), clearedSessionCookies());
  return { ok: true };
}

type LoginSuccess = { readonly next: string } | { readonly twoFactor: true };

async function openSession(
  data: unknown,
  setCookies: string[],
  next: unknown,
): Promise<AuthResult<LoginSuccess>> {
  const access = accessTokenOutputSchema.safeParse(data);
  if (!access.success) return failure('unavailable');
  const session = sessionCookies(access.data, setCookies);
  if (session === null) return failure('unavailable');
  writeCookies(await cookies(), [cookie(CHALLENGE_COOKIE, '', 0), ...session]);
  return { ok: true, next: safeNext(typeof next === 'string' ? next : null) };
}

/** Connexion ; un compte à second facteur reçoit un défi gardé en cookie `HttpOnly`. */
export async function login(input: unknown, next: unknown): Promise<AuthResult<LoginSuccess>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return failure('invalid', zodFields(parsed.error.issues));
  const result = await apiFetch('/auth/login', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  if (!result.ok) return fromApi(result, 'invalidCredentials');
  const challenge = twoFactorChallengeOutputSchema.safeParse(result.data);
  if (challenge.success) {
    writeCookies(await cookies(), [
      cookie(
        CHALLENGE_COOKIE,
        challenge.data.challengeToken,
        Math.min(challenge.data.expiresIn, CHALLENGE_MAX_AGE),
      ),
    ]);
    return { ok: true, twoFactor: true };
  }
  return openSession(result.data, result.setCookies, next);
}

export async function loginTwoFactor(
  code: unknown,
  next: unknown,
): Promise<AuthResult<LoginSuccess>> {
  const challengeToken = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!challengeToken) return failure('codeInvalid');
  const parsed = loginTwoFactorSchema.safeParse({ challengeToken, code });
  if (!parsed.success) return failure('codeInvalid');
  const result = await apiFetch('/auth/login/2fa', {
    method: 'POST',
    body: parsed.data,
    client: await clientContext(),
  });
  if (!result.ok) {
    const mapped = fromApi(result, 'codeInvalid');
    return mapped.error === 'invalidCredentials' || mapped.error === 'invalid'
      ? { ...mapped, error: 'codeInvalid' }
      : mapped;
  }
  return openSession(result.data, result.setCookies, next);
}

/** Déconnexion de cet appareil : révoquée côté API, effacée ici même si l'API est injoignable. */
export async function logout(): Promise<AuthResult> {
  const jar = await cookies();
  const refreshToken = jar.get(REFRESH_COOKIE)?.value;
  if (isRefreshValue(refreshToken)) {
    await apiFetch('/auth/logout', {
      method: 'POST',
      refreshToken,
      client: await clientContext(),
    });
  }
  writeCookies(jar, clearedSessionCookies());
  return { ok: true };
}
