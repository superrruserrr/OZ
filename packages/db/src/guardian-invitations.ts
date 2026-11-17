// Invitation du tuteur légal (lot 1.7ba, EX-108) : appels typés à la migration
// 20261119100000_guardian_invitations. Seule l'empreinte du jeton entre en base ; la clé de
// déchiffrement arrive en paramètre, jamais stockée.

import type { PrismaClient } from './client.js';
import type { TransactionClient } from './session-context.js';

export type GuardianInviteOutcome =
  /** `email` : adresse du tuteur déclaré, ou `null` s'il n'a donné qu'un téléphone (D1). */
  | {
      readonly outcome: 'created';
      readonly email: string | null;
      readonly childFirstName: string;
    }
  /** Le compte n'a pas de fiche joueur. */
  | { readonly outcome: 'no_player' }
  | { readonly outcome: 'adult' }
  | { readonly outcome: 'no_guardian' }
  /** Le tuteur déclaré a déjà un compte. */
  | { readonly outcome: 'linked' }
  /** Compte inutilisable (supprimé, suspendu, email non vérifié). */
  | { readonly outcome: 'refused' };

export interface GuardianInvitationPreview {
  readonly childFirstName: string;
  readonly relationship: string;
}

export type GuardianAcceptOutcome =
  | { readonly outcome: 'accepted'; readonly playerId: string }
  /** Inconnue, expirée, déjà acceptée, annulée, joueur devenu majeur ou tuteur déjà lié : sans motif. */
  | { readonly outcome: 'invalid' }
  /** L'enfant ne peut pas être son propre tuteur. */
  | { readonly outcome: 'self' }
  /** Compte inutilisable, ou compte d'un joueur mineur. */
  | { readonly outcome: 'refused' };

/** État du lien vu du compte : pièces attendues, en revue, refusé, ou approuvé (lot 1.7bb). */
export type GuardianLinkStatus = 'awaiting_documents' | 'submitted' | 'rejected' | 'approved';

export interface GuardianChild {
  /** Fiche tuteur de ce rattachement : cible des pièces du justificatif (lot 1.7bb). */
  readonly guardianId: string;
  /** Tuteur vérifié (KYC 2) : condition des droits du tuteur sur la fiche (lots 1.4 et 1.13). */
  readonly guardianVerified: boolean;
  readonly linkStatus: GuardianLinkStatus;
  /** `null` tant que le lien n'est pas approuvé. */
  readonly ozId: string | null;
  readonly firstName: string;
  /** `null` tant que le lien n'est pas approuvé. */
  readonly lastName: string | null;
  readonly verificationStatus: string;
  /** Fiche visible des tiers : consentement du tuteur vérifié et fiche vérifiée (EX-T16 n° 3). */
  readonly published: boolean;
  /** Consentements actifs du tuteur pour cet enfant (types), vide avant le lien approuvé. */
  readonly consents: readonly string[];
}

const LINK_STATUSES: readonly string[] = [
  'awaiting_documents',
  'submitted',
  'rejected',
  'approved',
];

const TOKEN_HASH = /^[0-9a-f]{64}$/;

function assertInput(tokenHash: string, ttlSeconds?: number): void {
  if (!TOKEN_HASH.test(tokenHash)) throw new Error('Invitation : empreinte SHA-256 attendue.');
  if (
    ttlSeconds !== undefined &&
    (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 7 * 86_400)
  ) {
    throw new Error('Invitation : durée de vie entière de 60 s à 7 jours attendue.');
  }
}

/** Invitation émise par le joueur mineur du contexte ; annule la précédente. */
export async function inviteGuardian(
  tx: TransactionClient,
  input: {
    readonly tokenHash: string;
    readonly ttlSeconds: number;
    readonly encryptionKey: string;
  },
): Promise<GuardianInviteOutcome> {
  assertInput(input.tokenHash, input.ttlSeconds);
  const rows = await tx.$queryRaw<
    { r: { outcome: string; email?: string | null; childFirstName?: string } }[]
  >`SELECT oz_guardian_invite(${input.tokenHash}, make_interval(secs => ${input.ttlSeconds}),
      ${input.encryptionKey}) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'created' && typeof r.childFirstName === 'string') {
    return { outcome: 'created', email: r.email ?? null, childFirstName: r.childFirstName };
  }
  if (
    r?.outcome === 'no_player' ||
    r?.outcome === 'adult' ||
    r?.outcome === 'no_guardian' ||
    r?.outcome === 'linked' ||
    r?.outcome === 'refused'
  ) {
    return { outcome: r.outcome };
  }
  throw new Error('Invitation du tuteur : réponse inattendue de la base.');
}

/** Aperçu d'une invitation utilisable, sans session ; `null` sinon, sans motif. */
export async function readGuardianInvitation(
  db: Pick<PrismaClient, '$queryRaw'>,
  tokenHash: string,
): Promise<GuardianInvitationPreview | null> {
  assertInput(tokenHash);
  const rows = await db.$queryRaw<
    { r: { childFirstName?: string; relationship?: string } | null }[]
  >`SELECT oz_guardian_invitation_read(${tokenHash}) AS r`;
  const r = rows[0]?.r;
  return typeof r?.childFirstName === 'string' && typeof r.relationship === 'string'
    ? { childFirstName: r.childFirstName, relationship: r.relationship }
    : null;
}

/** Acceptation par le compte du contexte : rattachement en attente, sans rôle ni droit (D3). */
export async function acceptGuardianInvitation(
  tx: TransactionClient,
  tokenHash: string,
): Promise<GuardianAcceptOutcome> {
  assertInput(tokenHash);
  const rows = await tx.$queryRaw<{ r: { outcome: string; playerId?: string } }[]>`
    SELECT oz_guardian_invitation_accept(${tokenHash}) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'accepted' && typeof r.playerId === 'string') {
    return { outcome: 'accepted', playerId: r.playerId };
  }
  if (r?.outcome === 'invalid' || r?.outcome === 'self' || r?.outcome === 'refused') {
    return { outcome: r.outcome };
  }
  throw new Error('Acceptation du tuteur : réponse inattendue de la base.');
}

/**
 * Enfants mineurs du compte du contexte (EX-108 n° 6) : rattachements en attente (invitation
 * acceptée) et fiches tuteur liées. Un enfant devenu majeur n'y figure plus. Avant l'approbation du
 * lien, seuls le prénom et le statut sortent : ni nom, ni OZ ID (D3).
 */
export async function guardianChildren(tx: TransactionClient): Promise<GuardianChild[]> {
  const rows = await tx.$queryRaw<
    {
      guardian_id: string;
      guardian_verified: boolean;
      link_status: string;
      oz_id: string | null;
      first_name: string;
      last_name: string | null;
      verification_status: string;
      published: boolean;
      consents: string[];
    }[]
  >`SELECT guardian_id::text AS guardian_id, guardian_verified, link_status, oz_id, first_name,
      last_name, verification_status, published, consents FROM oz_guardian_children()`;
  return rows.map((row) => {
    if (!LINK_STATUSES.includes(row.link_status)) {
      throw new Error('Enfants du tuteur : état du lien inattendu.');
    }
    return {
      guardianId: row.guardian_id,
      guardianVerified: row.guardian_verified,
      linkStatus: row.link_status as GuardianLinkStatus,
      ozId: row.oz_id,
      firstName: row.first_name,
      lastName: row.last_name,
      verificationStatus: row.verification_status,
      published: row.published,
      consents: row.consents,
    };
  });
}
