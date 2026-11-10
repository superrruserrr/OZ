'use server';

import {
  signupAffiliationSchema,
  signupCompleteOutputSchema,
  signupGuardianSchema,
  signupIdentitySchema,
  signupSportSchema,
  signupStatusOutputSchema,
  type SignupCompleteOutput,
} from '@oz/contracts';
import type { ApiResult } from '../session/api-client';
import { signupFetch } from './signup-api';
import { nextPath, type SignupStep } from './steps';

/*
 * Actions serveur du parcours d'inscription (lot 1.7cb, ADR-010). Chaque étape est revalidée par son
 * contrat (C2) avant l'API ; le navigateur ne reçoit qu'une clé de message, les codes d'erreur de
 * champ et l'étape suivante, jamais un jeton ni un message de l'API.
 */

const SCHEMAS = {
  identity: signupIdentitySchema,
  sport: signupSportSchema,
  affiliation: signupAffiliationSchema,
  guardian: signupGuardianSchema,
} as const;

/** Clés de `onboarding.errors.*` dans les messages du site. */
export type SignupErrorKey =
  | 'invalid'
  | 'retryLater'
  | 'unavailable'
  /** Session expirée ou révoquée : l'écran recharge la page, `proxy.ts` renvoie à la connexion. */
  | 'session'
  | 'completed'
  | 'refused'
  | 'guardianRequired'
  | 'incomplete';

export type SignupFailure = {
  readonly ok: false;
  readonly error: SignupErrorKey;
  readonly fields: Readonly<Record<string, string>>;
  readonly retryAfterSeconds?: number;
};

const failure = (error: SignupErrorKey, fields: Record<string, string> = {}): SignupFailure => ({
  ok: false,
  error,
  fields,
});

const isStep = (value: unknown): value is SignupStep =>
  typeof value === 'string' && Object.hasOwn(SCHEMAS, value);

function fromApi(result: Extract<ApiResult, { ok: false }> | null): SignupFailure {
  if (result === null) return failure('session');
  const fields = Object.fromEntries(result.details.map((detail) => [detail.field, detail.code]));
  const error = ((): SignupErrorKey => {
    switch (result.code) {
      case 'RATE_LIMITED':
        return 'retryLater';
      case 'SIGNUP_ALREADY_COMPLETED':
        return 'completed';
      case 'SIGNUP_REFUSED':
        return 'refused';
      case 'SIGNUP_GUARDIAN_REQUIRED':
        return 'guardianRequired';
      case 'SIGNUP_INCOMPLETE':
        return 'incomplete';
      case 'VALIDATION_FAILED':
        return 'invalid';
      default:
        if (result.status === 401) return 'session';
        return result.status === 422 || result.status === 400 ? 'invalid' : 'unavailable';
    }
  })();
  return {
    ok: false,
    error,
    fields,
    ...(result.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: result.retryAfterSeconds }),
  };
}

/** Erreurs de champ d'un contrat (clés `validation.*`, ou message générique de Zod). */
function zodFields(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[String(issue.path[0] ?? 'form')] ??= issue.message;
  return fields;
}

/** Enregistre une étape (`PUT /players/signup/:step`) et rend l'étape suivante du parcours. */
export async function saveSignupStep(
  step: unknown,
  input: unknown,
): Promise<{ readonly ok: true; readonly next: string } | SignupFailure> {
  if (!isStep(step)) return failure('invalid');
  const parsed = SCHEMAS[step].safeParse(input);
  if (!parsed.success) return failure('invalid', zodFields(parsed.error.issues));
  const result = await signupFetch(`/players/signup/${step}`, { method: 'PUT', body: parsed.data });
  if (result === null || !result.ok) return fromApi(result);
  const status = signupStatusOutputSchema.safeParse(result.data);
  return status.success ? { ok: true, next: nextPath(status.data) } : failure('unavailable');
}

/** Finalise l'inscription (`POST /players/signup/complete`) : OZ ID au statut déclaré. */
export async function completeSignup(): Promise<
  { readonly ok: true; readonly card: SignupCompleteOutput } | SignupFailure
> {
  const result = await signupFetch('/players/signup/complete', { method: 'POST' });
  if (result === null || !result.ok) return fromApi(result);
  const card = signupCompleteOutputSchema.safeParse(result.data);
  return card.success ? { ok: true, card: card.data } : failure('unavailable');
}
