import 'server-only';
import {
  playerProfileOutputSchema,
  playerSearchPageSchema,
  type PlayerProfileOutput,
  type PlayerSearchPageOutput,
} from '@oz/contracts';
import { cookies } from 'next/headers';
import { apiFetch } from '../session/api-client';
import { clientContext } from '../session/client-context';
import { ACCESS_COOKIE, readAccessToken } from '../session/cookies';

/*
 * Lecture de l'annuaire et des fiches au nom de l'utilisateur connecté (lot 1.5dc, ADR-010) : le
 * jeton reste dans le cookie `HttpOnly`. L'API applique seule les droits : une fiche hors de portée
 * répond 404, une recherche interdite 403. Le site n'ajoute ni ne devine aucune donnée.
 */
export type Read<T> =
  | { readonly kind: 'ok'; readonly data: T }
  | { readonly kind: 'unauthenticated' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'unavailable' };

async function read(path: string): Promise<Read<unknown>> {
  const token = readAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  if (token === null) return { kind: 'unauthenticated' };
  const result = await apiFetch(path, {
    method: 'GET',
    accessToken: token.token,
    client: await clientContext(),
  });
  if (result.ok) return { kind: 'ok', data: result.data };
  if (result.status === 401) return { kind: 'unauthenticated' };
  if (result.status === 403) return { kind: 'forbidden' };
  if (result.status === 404) return { kind: 'not_found' };
  return { kind: 'unavailable' };
}

export const SEARCH_POSITIONS = [
  'goalkeeper',
  'centre_back',
  'full_back',
  'defensive_midfielder',
  'central_midfielder',
  'attacking_midfielder',
  'winger',
  'striker',
] as const;
export type SearchPosition = (typeof SEARCH_POSITIONS)[number];

export interface SearchCriteria {
  readonly q?: string | undefined;
  readonly position?: SearchPosition | undefined;
  readonly country?: string | undefined;
  readonly cursor?: string | undefined;
}

/** Critères lus dans l'adresse : toute valeur hors format est ignorée, jamais transmise. */
export function parseCriteria(
  params: Readonly<Record<string, string | string[] | undefined>>,
): SearchCriteria {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === 'string' ? value.trim() : '';
  };
  const q = one('q').slice(0, 80);
  const position = SEARCH_POSITIONS.find((item) => item === one('position'));
  const country = /^[A-Z]{2}$/.test(one('country')) ? one('country') : '';
  const cursor = /^[A-Za-z0-9_-]{1,512}$/.test(one('cursor')) ? one('cursor') : '';
  return {
    ...(q.length >= 2 ? { q } : {}),
    ...(position ? { position } : {}),
    ...(country ? { country } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

export function criteriaQuery(criteria: SearchCriteria): string {
  const query = new URLSearchParams();
  for (const key of ['q', 'position', 'country', 'cursor'] as const) {
    const value = criteria[key];
    if (value) query.set(key, value);
  }
  return query.toString();
}

export async function searchPlayers(
  criteria: SearchCriteria,
): Promise<Read<PlayerSearchPageOutput>> {
  const query = criteriaQuery(criteria);
  const result = await read(`/players${query ? `?${query}` : ''}`);
  if (result.kind !== 'ok') return result;
  const parsed = playerSearchPageSchema.safeParse(result.data);
  return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'unavailable' };
}

const OZ_ID = /^OZ-[A-Z]{2}-\d{2}-[A-Z0-9]{6}-[A-Z0-9]$/;

export async function readPlayer(ozId: string): Promise<Read<PlayerProfileOutput>> {
  // Identifiant hors format : jamais transmis à l'API.
  if (!OZ_ID.test(ozId)) return { kind: 'not_found' };
  const result = await read(`/players/${ozId}`);
  if (result.kind !== 'ok') return result;
  const parsed = playerProfileOutputSchema.safeParse(result.data);
  return parsed.success ? { kind: 'ok', data: parsed.data } : { kind: 'unavailable' };
}
