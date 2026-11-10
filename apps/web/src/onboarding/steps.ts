import type { SIGNUP_STEPS, SignupStatusOutput } from '@oz/contracts';

/*
 * Ordre du parcours d'inscription (EX-107) : identité → sport → rattachement → tuteur si mineur →
 * carte OZ ID. La photo arrive plus tard (D-131). Le choix de l'écran se fait toujours à partir du
 * brouillon relu sur l'API, jamais de la session seule (ADR-010).
 */

export type SignupStep = (typeof SIGNUP_STEPS)[number];

const SLUGS: Readonly<Record<SignupStep, string>> = {
  identity: 'identite',
  sport: 'physique',
  affiliation: 'rattachement',
  guardian: 'tuteur',
};

export const ONBOARDING_PATH = '/onboarding';
export const OZ_ID_PATH = '/onboarding/oz-id';

export function stepFromSlug(slug: string): SignupStep | null {
  for (const [step, value] of Object.entries(SLUGS)) {
    if (value === slug) return step as SignupStep;
  }
  return null;
}

export const stepPath = (step: SignupStep): string => `${ONBOARDING_PATH}/${SLUGS[step]}`;

/** Étapes à remplir : le tuteur seulement quand le serveur a déclaré le joueur mineur. */
export function stepsFor(minor: boolean | null): SignupStep[] {
  const steps: SignupStep[] = ['identity', 'sport', 'affiliation'];
  if (minor === true) steps.push('guardian');
  return steps;
}

/** Reprise : première étape manquante selon l'API, sinon la finalisation. */
export function nextPath(status: SignupStatusOutput): string {
  const [first] = status.missing;
  return first === undefined ? OZ_ID_PATH : stepPath(first);
}

/** Une étape s'ouvre quand toutes les précédentes sont enregistrées ; le tuteur, pour un mineur. */
export function openStep(
  step: SignupStep,
  status: SignupStatusOutput,
): { readonly open: true } | { readonly redirect: string } {
  const order = stepsFor(status.minor);
  const index = order.indexOf(step);
  if (index === -1) return { redirect: nextPath(status) };
  const gap = order.slice(0, index).find((previous) => status.steps[previous] === null);
  return gap === undefined ? { open: true } : { redirect: stepPath(gap) };
}

/** Barre de progression (E7) : la carte OZ ID compte comme dernière étape. */
export function progress(
  step: SignupStep | 'ozId',
  minor: boolean | null,
): { readonly step: number; readonly total: number } {
  const order = stepsFor(minor);
  const total = order.length + 1;
  return { step: step === 'ozId' ? total : order.indexOf(step) + 1, total };
}

/** Étape précédente dans l'ordre du parcours, pour le bouton retour. */
export function previousPath(step: SignupStep | 'ozId', minor: boolean | null): string | null {
  const order = stepsFor(minor);
  const index = step === 'ozId' ? order.length : order.indexOf(step);
  const previous = index > 0 ? order[index - 1] : undefined;
  return previous === undefined ? null : stepPath(previous);
}
