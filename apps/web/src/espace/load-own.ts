import 'server-only';
import type { PlayerProfileOutput } from '@oz/contracts';
import { redirect } from '../i18n/navigation';
import { toLogin } from '../onboarding/load-draft';
import { ONBOARDING_PATH } from '../onboarding/steps';
import { readOwnPlayer } from '../players/players-api';

/**
 * Fiche du titulaire pour l'espace (lot 1.19b) : sans session → connexion ; sans fiche (inscription
 * en cours, tuteur, autre rôle) → l'aiguillage de `/onboarding` ; panne → `null`.
 */
export async function loadOwn(path: string, locale: string): Promise<PlayerProfileOutput | null> {
  const own = await readOwnPlayer();
  if (own.kind === 'unauthenticated') toLogin(path, locale);
  if (own.kind === 'not_found' || own.kind === 'forbidden') {
    redirect({ href: ONBOARDING_PATH, locale });
  }
  return own.kind === 'ok' ? own.data : null;
}
