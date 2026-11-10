// Inscription joueur (lot 1.7a, EX-107) : appels typés à la migration 20261116100000_player_signup,
// sous le contexte RLS du compte (`withUserContext`). Le contenu des étapes est validé par l'API
// (contrats Zod) ; les clés arrivent en paramètre, jamais stockées en base.

import type { TransactionClient } from './session-context.js';

export const PLAYER_SIGNUP_STEPS = ['identity', 'sport', 'affiliation', 'guardian'] as const;
export type PlayerSignupStep = (typeof PLAYER_SIGNUP_STEPS)[number];

export type PlayerSignupSaveOutcome =
  | { readonly outcome: 'saved'; readonly expiresAt: Date }
  /** Le compte a déjà sa fiche. */
  | { readonly outcome: 'completed' }
  /** Refusé par la base (forme, taille, date de naissance hors bornes). */
  | { readonly outcome: 'invalid' }
  /** Compte inutilisable (supprimé, suspendu, email non vérifié). */
  | { readonly outcome: 'refused' };

export interface PlayerSignupDraft {
  readonly identity: Readonly<Record<string, unknown>> | null;
  readonly sport: Readonly<Record<string, unknown>> | null;
  readonly affiliation: Readonly<Record<string, unknown>> | null;
  readonly guardian: Readonly<Record<string, unknown>> | null;
  readonly minor: boolean | null;
  readonly expiresAt: Date;
}

export type PlayerSignupReadOutcome =
  | { readonly outcome: 'none' }
  | { readonly outcome: 'completed' }
  | { readonly outcome: 'refused' }
  | { readonly outcome: 'draft'; readonly draft: PlayerSignupDraft };

export type PlayerSignupCompleteOutcome =
  | { readonly outcome: 'created'; readonly playerId: string; readonly minor: boolean }
  | { readonly outcome: 'missing'; readonly missing: readonly PlayerSignupStep[] }
  | { readonly outcome: 'completed' }
  /** Compte inutilisable, ou rôle joueur retiré. */
  | { readonly outcome: 'refused' }
  /** Étape refusée par la base (contrat plus ancien) : à ressaisir. */
  | { readonly outcome: 'invalid' };

const asObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Sauvegarde d'une étape, chiffrée par la base. */
export async function savePlayerSignupStep(
  tx: TransactionClient,
  input: {
    readonly step: PlayerSignupStep;
    readonly data: Readonly<Record<string, unknown>>;
    readonly encryptionKey: string;
  },
): Promise<PlayerSignupSaveOutcome> {
  if (!PLAYER_SIGNUP_STEPS.includes(input.step)) return { outcome: 'invalid' };
  const rows = await tx.$queryRaw<{ r: { outcome: string; expiresAt?: string } }[]>`
    SELECT oz_player_signup_save(${input.step}, ${JSON.stringify(input.data)}::jsonb,
      ${input.encryptionKey}) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'saved' && r.expiresAt) {
    return { outcome: 'saved', expiresAt: new Date(r.expiresAt) };
  }
  if (r?.outcome === 'completed' || r?.outcome === 'invalid' || r?.outcome === 'refused') {
    return { outcome: r.outcome };
  }
  throw new Error('Inscription joueur : réponse inattendue de la base.');
}

/** Brouillon du compte, déchiffré (reprise après interruption). */
export async function readPlayerSignup(
  tx: TransactionClient,
  encryptionKey: string,
): Promise<PlayerSignupReadOutcome> {
  const rows = await tx.$queryRaw<{ r: Record<string, unknown> | null }[]>`
    SELECT oz_player_signup_read(${encryptionKey}) AS r`;
  const r = rows[0]?.r ?? null;
  if (r === null) return { outcome: 'none' };
  if (r.outcome === 'refused') return { outcome: 'refused' };
  if (r.completed === true) return { outcome: 'completed' };
  return {
    outcome: 'draft',
    draft: {
      identity: asObject(r.identity),
      sport: asObject(r.sport),
      affiliation: asObject(r.affiliation),
      guardian: asObject(r.guardian),
      minor: typeof r.minor === 'boolean' ? r.minor : null,
      expiresAt: new Date(String(r.expiresAt)),
    },
  };
}

/**
 * Finalisation : fiche `declared`, tuteur déclaré d'un mineur, rôle joueur, brouillon supprimé,
 * audit `player.signup.completed`. L'appelant émet l'OZ ID (`issueOzId`) dans la même transaction.
 */
export async function completePlayerSignup(
  tx: TransactionClient,
  keys: { readonly encryptionKey: string; readonly blindIndexKey: string },
): Promise<PlayerSignupCompleteOutcome> {
  const rows = await tx.$queryRaw<
    { r: { outcome: string; playerId?: string; minor?: boolean; missing?: string[] } }[]
  >`SELECT oz_player_signup_complete(${keys.encryptionKey}, ${keys.blindIndexKey}) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'created' && r.playerId && typeof r.minor === 'boolean') {
    return { outcome: 'created', playerId: r.playerId, minor: r.minor };
  }
  if (r?.outcome === 'missing' && Array.isArray(r.missing)) {
    return {
      outcome: 'missing',
      missing: PLAYER_SIGNUP_STEPS.filter((step) => r.missing?.includes(step)),
    };
  }
  if (r?.outcome === 'completed' || r?.outcome === 'refused' || r?.outcome === 'invalid') {
    return { outcome: r.outcome };
  }
  throw new Error('Inscription joueur : réponse inattendue de la base.');
}
