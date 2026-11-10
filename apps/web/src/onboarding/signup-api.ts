import 'server-only';
import { signupStatusOutputSchema, type SignupStatusOutput } from '@oz/contracts';
import { cookies } from 'next/headers';
import { apiFetch, type ApiRequest, type ApiResult } from '../session/api-client';
import { clientContext } from '../session/client-context';
import { ACCESS_COOKIE, readAccessToken } from '../session/cookies';

export type SignupRead =
  | { readonly kind: 'draft'; readonly status: SignupStatusOutput }
  /** 409 : la fiche joueur existe déjà. */
  | { readonly kind: 'completed' }
  | { readonly kind: 'unauthenticated' }
  /** 403 `SIGNUP_REFUSED` : compte qui ne peut pas s'inscrire comme joueur. */
  | { readonly kind: 'refused' }
  | { readonly kind: 'unavailable' };

/**
 * Appel de l'API au nom du joueur connecté (ADR-010) : le jeton d'accès reste dans le cookie
 * `HttpOnly` et n'est jamais rendu au navigateur. `null` sans jeton lisible : pas d'appel.
 */
export async function signupFetch(
  path: string,
  request: Omit<ApiRequest, 'accessToken' | 'client'>,
): Promise<ApiResult | null> {
  const token = readAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  if (token === null) return null;
  return apiFetch(path, { ...request, accessToken: token.token, client: await clientContext() });
}

/** Brouillon d'inscription relu sur l'API (reprise, EX-107 n° 2). */
export async function readSignup(): Promise<SignupRead> {
  const result = await signupFetch('/players/signup', { method: 'GET' });
  if (result === null) return { kind: 'unauthenticated' };
  if (!result.ok) {
    if (result.status === 401) return { kind: 'unauthenticated' };
    if (result.status === 409) return { kind: 'completed' };
    if (result.status === 403 && result.code === 'SIGNUP_REFUSED') return { kind: 'refused' };
    return { kind: 'unavailable' };
  }
  const parsed = signupStatusOutputSchema.safeParse(result.data);
  return parsed.success ? { kind: 'draft', status: parsed.data } : { kind: 'unavailable' };
}
