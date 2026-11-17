// Justificatif de lien et consentement du tuteur légal (lot 1.7bb, EX-108 n° 2 à 5) : appels typés à
// la migration 20261120100000_guardian_link_consent. Toutes les décisions sont prises par la base,
// sous le contexte RLS de l'appelant (`withUserContext`).

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

/** Types de consentement donnés par un tuteur pour un enfant. */
export const GUARDIAN_CONSENT_TYPES = [
  'guardian_data_processing',
  'guardian_profile_publication',
] as const;
export type GuardianConsentType = (typeof GUARDIAN_CONSENT_TYPES)[number];

/** Motifs de refus d'un justificatif (R4) : liste fermée. */
export const GUARDIAN_LINK_REJECTION_REASONS = [
  'illegible',
  'name_mismatch',
  'child_mismatch',
  'wrong_document',
  'suspected_forgery',
] as const;
export type GuardianLinkRejectionReason = (typeof GUARDIAN_LINK_REJECTION_REASONS)[number];

export type GuardianLinkSubmitOutcome =
  | { readonly outcome: 'submitted'; readonly reviewId: string }
  | {
      readonly outcome:
        'refused' | 'not_found' | 'already_submitted' | 'invalid_documents' | 'order_required';
    };

export interface GuardianLinkQueueEntry {
  readonly reviewId: string;
  readonly submittedAt: Date;
  readonly relationship: string;
  readonly guardianFirstName: string;
  readonly guardianLastName: string;
  readonly childFirstName: string;
  readonly childLastName: string;
  readonly childBirthDate: Date;
  /** Refus déjà prononcés sur ce rattachement (3 : clos). */
  readonly rejections: number;
  readonly documentIds: readonly string[];
}

export type GuardianLinkDecision =
  | { readonly approve: true }
  | { readonly approve: false; readonly reason: GuardianLinkRejectionReason };

export type GuardianLinkDecideOutcome =
  | {
      readonly outcome: 'approved' | 'rejected';
      /** Rattachement clos : 3e refus ou faux suspecté ; l'enfant devra réinviter. */
      readonly closed: boolean;
      /** Adresse du compte déposant, pour l'avis de décision. */
      readonly email: string;
      readonly childFirstName: string;
    }
  | { readonly outcome: 'refused' | 'not_found' | 'conflict' | 'stale' };

export interface ConsentText {
  readonly version: string;
  readonly body: string;
  readonly sha256: string;
  readonly publishedAt: Date;
}

export type GuardianConsentGrantOutcome =
  | {
      readonly outcome: 'granted' | 'already';
      readonly grantedAt: Date;
      readonly textVersion: string;
    }
  | { readonly outcome: 'not_found' | 'stale' | 'requires_data_processing' };

export type GuardianConsentRevokeOutcome =
  { readonly outcome: 'revoked'; readonly revoked: number } | { readonly outcome: 'not_found' };

/** Dépôt du justificatif par le compte d'un rattachement en attente (1 à 3 pièces saines). */
export async function submitGuardianLink(
  tx: TransactionClient,
  guardianId: string,
  documentIds: readonly string[],
): Promise<GuardianLinkSubmitOutcome> {
  if (!UUID.test(guardianId) || documentIds.some((id) => !UUID.test(id))) {
    return { outcome: 'not_found' };
  }
  const rows = await tx.$queryRaw<{ r: { outcome: string; reviewId?: string } }[]>`
    SELECT oz_guardian_link_submit(${guardianId}::uuid, ${[...documentIds]}::uuid[]) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'submitted' && typeof r.reviewId === 'string') {
    return { outcome: 'submitted', reviewId: r.reviewId };
  }
  if (
    r?.outcome === 'refused' ||
    r?.outcome === 'not_found' ||
    r?.outcome === 'already_submitted' ||
    r?.outcome === 'invalid_documents' ||
    r?.outcome === 'order_required'
  ) {
    return { outcome: r.outcome };
  }
  throw new Error('Dépôt du justificatif : réponse inattendue de la base.');
}

/** File de revue (administrateur vérifié du contexte) ; vide pour tout autre compte. */
export async function guardianLinkQueue(
  tx: TransactionClient,
  limit: number,
): Promise<GuardianLinkQueueEntry[]> {
  const rows = await tx.$queryRaw<
    {
      review_id: string;
      submitted_at: Date;
      relationship: string;
      guardian_first_name: string;
      guardian_last_name: string;
      child_first_name: string;
      child_last_name: string;
      child_birth_date: Date;
      rejections: number;
      document_ids: string[];
    }[]
  >`SELECT review_id::text AS review_id, submitted_at, relationship, guardian_first_name,
      guardian_last_name, child_first_name, child_last_name, child_birth_date, rejections,
      document_ids::text[] AS document_ids
    FROM oz_guardian_link_queue(${limit}::integer)`;
  return rows.map((row) => ({
    reviewId: row.review_id,
    submittedAt: row.submitted_at,
    relationship: row.relationship,
    guardianFirstName: row.guardian_first_name,
    guardianLastName: row.guardian_last_name,
    childFirstName: row.child_first_name,
    childLastName: row.child_last_name,
    childBirthDate: row.child_birth_date,
    rejections: row.rejections,
    documentIds: row.document_ids,
  }));
}

/** Décision d'un administrateur vérifié ; les pièces sont gardées `retentionDays` après elle. */
export async function decideGuardianLink(
  tx: TransactionClient,
  reviewId: string,
  decision: GuardianLinkDecision,
  retentionDays: number,
): Promise<GuardianLinkDecideOutcome> {
  if (!UUID.test(reviewId)) return { outcome: 'not_found' };
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('Décision du lien : durée de conservation de 1 à 3650 jours attendue.');
  }
  const reason = decision.approve ? null : decision.reason;
  const rows = await tx.$queryRaw<
    { r: { outcome: string; closed?: boolean; email?: string; childFirstName?: string } }[]
  >`SELECT oz_guardian_link_decide(${reviewId}::uuid, ${decision.approve}, ${reason}::text,
      make_interval(days => ${retentionDays}::integer)) AS r`;
  const r = rows[0]?.r;
  if (
    (r?.outcome === 'approved' || r?.outcome === 'rejected') &&
    typeof r.closed === 'boolean' &&
    typeof r.email === 'string' &&
    typeof r.childFirstName === 'string'
  ) {
    return {
      outcome: r.outcome,
      closed: r.closed,
      email: r.email,
      childFirstName: r.childFirstName,
    };
  }
  if (
    r?.outcome === 'refused' ||
    r?.outcome === 'not_found' ||
    r?.outcome === 'conflict' ||
    r?.outcome === 'stale'
  ) {
    return { outcome: r.outcome };
  }
  throw new Error('Décision du lien : réponse inattendue de la base.');
}

/** Motifs du retrait d'un lien approuvé par erreur (lot 1.7bc, décision C6). */
export const GUARDIAN_LINK_REVOCATION_REASONS = [
  'approved_in_error',
  'suspected_fraud',
  'child_request',
  'other',
] as const;
export type GuardianLinkRevocationReason = (typeof GUARDIAN_LINK_REVOCATION_REASONS)[number];

export type GuardianLinkRevokeOutcome =
  | { readonly outcome: 'revoked'; readonly email: string | null; readonly childFirstName: string }
  | { readonly outcome: 'refused' | 'not_found' | 'conflict' | 'concerned' };

/**
 * Retire un lien approuvé (C6) : compte retiré de la fiche, consentements révoqués, invitation
 * annulée, rôle retiré s'il ne sert plus. Administrateur vérifié du contexte, jugé par la base.
 */
export async function revokeGuardianLink(
  tx: TransactionClient,
  reviewId: string,
  reason: GuardianLinkRevocationReason,
  retentionDays: number,
): Promise<GuardianLinkRevokeOutcome> {
  if (!UUID.test(reviewId)) return { outcome: 'not_found' };
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
    throw new Error('Retrait du lien : durée de conservation de 1 à 3650 jours attendue.');
  }
  const rows = await tx.$queryRaw<
    { r: { outcome: string; email?: string | null; childFirstName?: string } }[]
  >`SELECT oz_guardian_link_revoke(${reviewId}::uuid, ${reason}::text,
      make_interval(days => ${retentionDays}::integer)) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'revoked' && typeof r.childFirstName === 'string') {
    return {
      outcome: 'revoked',
      email: typeof r.email === 'string' ? r.email : null,
      childFirstName: r.childFirstName,
    };
  }
  if (
    r?.outcome === 'refused' ||
    r?.outcome === 'not_found' ||
    r?.outcome === 'conflict' ||
    r?.outcome === 'concerned'
  ) {
    return { outcome: r.outcome };
  }
  throw new Error('Retrait du lien : réponse inattendue de la base.');
}

/** Texte en vigueur d'un type de consentement de tuteur ; `null` s'il n'y en a aucun. */
export async function currentConsentText(
  db: Pick<TransactionClient, '$queryRaw'>,
  type: GuardianConsentType,
): Promise<ConsentText | null> {
  const rows = await db.$queryRaw<
    { version: string; body: string; sha256: string; published_at: Date }[]
  >`SELECT version, body, sha256, published_at
    FROM oz_guardian_consent_current(${type}::consent_type)`;
  const row = rows[0];
  return row === undefined
    ? null
    : { version: row.version, body: row.body, sha256: row.sha256, publishedAt: row.published_at };
}

/** Consentement du tuteur au lien approuvé pour l'enfant `ozId`, sur le texte lu. */
export async function grantGuardianConsent(
  tx: TransactionClient,
  input: {
    readonly ozId: string;
    readonly type: GuardianConsentType;
    readonly textVersion: string;
    readonly textSha256: string;
  },
): Promise<GuardianConsentGrantOutcome> {
  if (!SHA256.test(input.textSha256)) return { outcome: 'stale' };
  const rows = await tx.$queryRaw<
    { r: { outcome: string; grantedAt?: string; textVersion?: string } }[]
  >`SELECT oz_guardian_consent_grant(${input.ozId}, ${input.type}::consent_type,
      ${input.textVersion}, ${input.textSha256}) AS r`;
  const r = rows[0]?.r;
  if (
    (r?.outcome === 'granted' || r?.outcome === 'already') &&
    typeof r.grantedAt === 'string' &&
    typeof r.textVersion === 'string'
  ) {
    return { outcome: r.outcome, grantedAt: new Date(r.grantedAt), textVersion: r.textVersion };
  }
  if (
    r?.outcome === 'not_found' ||
    r?.outcome === 'stale' ||
    r?.outcome === 'requires_data_processing'
  ) {
    return { outcome: r.outcome };
  }
  throw new Error('Consentement du tuteur : réponse inattendue de la base.');
}

/** Révocation (dépublication immédiate) ; retirer le traitement retire aussi la publication. */
export async function revokeGuardianConsent(
  tx: TransactionClient,
  ozId: string,
  type: GuardianConsentType,
): Promise<GuardianConsentRevokeOutcome> {
  const rows = await tx.$queryRaw<{ r: { outcome: string; revoked?: number } }[]>`
    SELECT oz_guardian_consent_revoke(${ozId}, ${type}::consent_type) AS r`;
  const r = rows[0]?.r;
  if (r?.outcome === 'revoked' && typeof r.revoked === 'number') {
    return { outcome: 'revoked', revoked: r.revoked };
  }
  if (r?.outcome === 'not_found') return { outcome: 'not_found' };
  throw new Error('Révocation du consentement : réponse inattendue de la base.');
}
