import 'server-only';
import {
  consentTextOutputSchema,
  guardianChildrenOutputSchema,
  type ConsentTextOutput,
  type GuardianChildrenOutput,
} from '@oz/contracts';
import { signupFetch } from '../onboarding/signup-api';

/*
 * Lectures de l'espace tuteur (lot 1.7bc, ADR-010) : appelées par les pages, côté serveur seulement,
 * au nom du compte connecté (jeton du cookie `HttpOnly`). Rien de l'API ne part tel quel au navigateur.
 */

export type GuardianChild = GuardianChildrenOutput['children'][number];

export type ChildrenRead =
  | { readonly kind: 'ok'; readonly children: readonly GuardianChild[] }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'unavailable' };

export async function readChildren(): Promise<ChildrenRead> {
  const result = await signupFetch('/guardians/me/children', { method: 'GET' });
  if (result === null) return { kind: 'unauthenticated' };
  if (!result.ok)
    return result.status === 401 ? { kind: 'unauthenticated' } : { kind: 'unavailable' };
  const parsed = guardianChildrenOutputSchema.safeParse(result.data);
  return parsed.success ? { kind: 'ok', children: parsed.data.children } : { kind: 'unavailable' };
}

export type GuardianConsentType = ConsentTextOutput['type'];

/** Texte en vigueur d'un accord, présenté tel quel (version et empreinte renvoyées à l'accord). */
export async function readConsentText(
  type: GuardianConsentType,
): Promise<ConsentTextOutput | null> {
  const result = await signupFetch(`/consent-texts/${type}/current`, { method: 'GET' });
  if (result === null || !result.ok) return null;
  const parsed = consentTextOutputSchema.safeParse(result.data);
  return parsed.success ? parsed.data : null;
}
