import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, readAccessToken, type AccessToken } from './cookies';

/**
 * Session présumée, lue par un composant serveur ou une action (ADR-010) : signature NON vérifiée.
 * Elle ne sert qu'à choisir l'écran ; aucune donnée ni aucun droit n'est accordé sans un appel à
 * l'API, qui vérifie le jeton (D-132). Lecture seule : un composant serveur
 * ne peut pas poser de cookie, le renouvellement se fait dans `proxy.ts` avant le rendu. Le jeton reste
 * côté serveur : il ne doit jamais être passé à un composant client.
 */
export async function readUnverifiedSession(now: number = Date.now()): Promise<AccessToken | null> {
  const token = readAccessToken((await cookies()).get(ACCESS_COOKIE)?.value);
  return token !== null && token.expiresAt > now ? token : null;
}
