import 'server-only';
import { accessTokenOutputSchema } from '@oz/contracts';
import { apiFetch, type ApiClientContext } from './api-client';
import { sessionCookies, type CookieSpec } from './cookies';

const REFRESH_TIMEOUT_MS = 3_000;

export type RefreshOutcome =
  | { readonly kind: 'renewed'; readonly cookies: CookieSpec[]; readonly accessToken: string }
  /** 401 de l'API : session expirée, révoquée ou jeton rejoué. Cookies à effacer. */
  | { readonly kind: 'refused' }
  /** Panne passagère (5xx, délai, API injoignable) : le jeton n'a pas été consommé, rien à effacer. */
  | { readonly kind: 'unavailable' };

/** Rotation du jeton de rafraîchissement (`POST /auth/refresh`, ADR-010). */
export async function refreshSession(
  refreshToken: string,
  client: ApiClientContext,
): Promise<RefreshOutcome> {
  // Une page attend : délai court, une panne ne bloque pas chaque écran 10 s.
  const result = await apiFetch('/auth/refresh', {
    method: 'POST',
    refreshToken,
    client,
    timeoutMs: REFRESH_TIMEOUT_MS,
  });
  if (!result.ok) {
    // 403 : origine refusée, erreur de configuration du site et non de l'utilisateur.
    return result.status === 401 ? { kind: 'refused' } : { kind: 'unavailable' };
  }
  const parsed = accessTokenOutputSchema.safeParse(result.data);
  const cookies = parsed.success ? sessionCookies(parsed.data, result.setCookies) : null;
  if (!parsed.success || cookies === null) {
    // Rotation faite par l'API mais inutilisable ici : l'ancien jeton est déjà consommé, le garder
    // déclencherait la détection de réutilisation. Session close, trace sans aucune valeur.
    process.stderr.write(
      'Rotation de session sans cookie de rafraîchissement exploitable (ADR-010).\n',
    );
    return { kind: 'refused' };
  }
  return { kind: 'renewed', cookies, accessToken: parsed.data.accessToken };
}
