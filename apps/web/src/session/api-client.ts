import 'server-only';
import type { AppEnv } from '@oz/config/security-headers';
import { z } from 'zod';

/*
 * Client de l'API pour le serveur du site (ADR-010). Le navigateur n'appelle jamais l'API : actions
 * serveur et `proxy.ts` passent par ici. Aucun message, pile ni adresse interne de l'API ne remonte :
 * l'écran ne reçoit qu'un code (traduit côté site) et les détails de champ.
 */

export const API_REFRESH_COOKIE = '__Host-oz_refresh';
const TIMEOUT_MS = 10_000;

export interface ApiClientContext {
  /** En-tête `X-Forwarded-For` reçu de l'équilibreur, transmis tel quel (limites de débit par IP). */
  readonly forwardedFor?: string | null;
  readonly userAgent?: string | null;
}

export interface ApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly client?: ApiClientContext;
  /** Délai d'abandon (10 s par défaut ; plus court quand une page attend, comme la rotation). */
  readonly timeoutMs?: number;
}

export type ApiFieldError = { readonly field: string; readonly code: string };

export type ApiResult<T = unknown> =
  | { readonly ok: true; readonly status: number; readonly data: T; readonly setCookies: string[] }
  | {
      readonly ok: false;
      /** 0 : API injoignable ou délai dépassé. */
      readonly status: number;
      readonly code: string;
      readonly details: readonly ApiFieldError[];
      readonly retryAfterSeconds?: number;
    };

const apiErrorBody = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  details: z
    .array(z.object({ field: z.string().max(100), code: z.string().max(64) }))
    .max(50)
    .optional(),
});

const UNAVAILABLE = (status: number): ApiResult<never> => ({
  ok: false,
  status,
  code: 'UNAVAILABLE',
  details: [],
});

function parsedUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Au démarrage du serveur (instrumentation) : en recette et en production, API_URL et APP_URL sont
 * exigées ; une valeur présente mais invalide est refusée partout. En local, le site peut tourner
 * seul (pages publiques) : les écrans connectés répondent alors « service indisponible ».
 */
export function assertApiConfig(appEnv: AppEnv): void {
  for (const name of ['API_URL', 'APP_URL'] as const) {
    const raw = process.env[name];
    if (!raw) {
      if (appEnv !== 'local') throw new Error(`${name} manquante (exigée hors local, ADR-010).`);
      continue;
    }
    if (parsedUrl(raw) === null) throw new Error(`${name} invalide (URL http ou https attendue).`);
  }
}

/** Retry-After en secondes (entier positif), sinon rien. */
function retryAfter(response: Response): number | undefined {
  const value = Number(response.headers.get('retry-after'));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export async function apiFetch<T = unknown>(
  path: string,
  request: ApiRequest,
): Promise<ApiResult<T>> {
  // Chemin interne seulement : jamais d'hôte choisi par l'appelant.
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Chemin d’API invalide.');
  const base = parsedUrl(process.env.API_URL);
  if (base === null) return UNAVAILABLE(0);

  const headers = new Headers({ accept: 'application/json' });
  if (request.body !== undefined) headers.set('content-type', 'application/json');
  const origin = parsedUrl(process.env.APP_URL)?.origin;
  if (origin) headers.set('origin', origin);
  if (request.client?.forwardedFor) headers.set('x-forwarded-for', request.client.forwardedFor);
  if (request.client?.userAgent) headers.set('user-agent', request.client.userAgent);
  if (request.accessToken) headers.set('authorization', `Bearer ${request.accessToken}`);
  if (request.refreshToken) headers.set('cookie', `${API_REFRESH_COOKIE}=${request.refreshToken}`);

  let response: Response;
  try {
    response = await fetch(new URL(path, base), {
      method: request.method,
      headers,
      ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
      signal: AbortSignal.timeout(request.timeoutMs ?? TIMEOUT_MS),
      cache: 'no-store',
      redirect: 'error',
    });
  } catch {
    return UNAVAILABLE(0);
  }

  const text = await response.text().catch(() => '');
  let body: unknown = null;
  if (text !== '') {
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
  }

  if (response.ok) {
    if (body === undefined) return UNAVAILABLE(response.status);
    return {
      ok: true,
      status: response.status,
      data: body as T,
      setCookies: response.headers.getSetCookie(),
    };
  }
  const error = apiErrorBody.safeParse(body);
  if (!error.success) return UNAVAILABLE(response.status);
  const seconds = retryAfter(response);
  return {
    ok: false,
    status: response.status,
    code: error.data.code,
    details: error.data.details ?? [],
    ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
  };
}
