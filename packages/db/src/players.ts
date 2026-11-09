// Lecture d'un joueur en entrée de décision CASL (lot 1.4b) : forme de `PlayerRecord` (@oz/auth),
// lue sous le contexte du lecteur, donc après la RLS (D1).

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlayerAccessRecord {
  readonly userId: string | null;
  readonly birthDate: Date;
  readonly verificationStatus: string;
  /** Le lecteur lui-même s'il est le tuteur vérifié du joueur ; jamais le tuteur d'un autre. */
  readonly guardianUserId: string | null;
  readonly organizationId: string | null;
  /** Aucune table de résultats de tests avant son lot (D8 du lot 1.4b). */
  readonly testedByOrganizationIds: readonly string[];
  readonly hasPublicationConsent: boolean;
  /** Suppression du compte titulaire en attente (lot 1.16cba) : fiche invisible des tiers. */
  readonly deletionPending: boolean;
  /**
   * Instant de la base (`now()`) auquel la RLS a jugé la ligne : à passer à `playerSubject` pour que
   * CASL décide de la minorité au même instant (D3), jamais l'horloge de l'API.
   */
  readonly checkedAt: Date;
}

/**
 * Joueur `playerId` tel que le lecteur du contexte a le droit de le voir. `null` si la RLS le cache,
 * s'il est supprimé ou si l'identifiant est mal formé : l'existence n'est jamais révélée.
 */
export async function playerRecord(
  tx: TransactionClient,
  playerId: string,
): Promise<PlayerAccessRecord | null> {
  if (!UUID.test(playerId)) return null;
  const rows = await tx.$queryRaw<
    {
      user_id: string | null;
      birth_date: Date;
      verification_status: string;
      guardian_user_id: string | null;
      organization_id: string | null;
      published: boolean;
      deletion_pending: boolean;
      checked_at: Date;
    }[]
  >`
    SELECT p.user_id::text, p.birth_date, p.verification_status::text,
      CASE WHEN EXISTS (
        SELECT 1 FROM guardians g
        WHERE g.id = p.guardian_id AND g.user_id = oz_current_user_id()
          AND g.deleted_at IS NULL AND g.verification_status = 'verified')
      THEN oz_current_user_id()::text END AS guardian_user_id,
      p.organization_id::text,
      oz_player_published(p.id, p.guardian_id, p.verification_status) AS published,
      oz_account_deletion_pending(p.user_id) AS deletion_pending,
      now() AS checked_at
    FROM players p
    WHERE p.id = ${playerId}::uuid AND p.deleted_at IS NULL`;
  const row = rows[0];
  if (row === undefined) return null;
  return {
    userId: row.user_id,
    birthDate: row.birth_date,
    verificationStatus: row.verification_status,
    guardianUserId: row.guardian_user_id,
    organizationId: row.organization_id,
    testedByOrganizationIds: [],
    hasPublicationConsent: row.published,
    deletionPending: row.deletion_pending,
    checkedAt: row.checked_at,
  };
}

// Fiche joueur (lot 1.13a, EX-115) : lue par OZ ID sous la RLS du lecteur, avec l'entrée de CASL,
// les champs des vues, le niveau du badge et les blocs masqués. Le téléphone est lu à part, déchiffré
// seulement quand la vue retenue le porte.

const OZ_ID = /^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$/;

/** Blocs réglables (D1 du lot 1.13a) ; absent : visible. */
export const PLAYER_VISIBILITY_BLOCKS = ['location', 'physical', 'sport'] as const;
export type PlayerVisibilityBlock = (typeof PLAYER_VISIBILITY_BLOCKS)[number];
export type PlayerVisibility = Partial<Record<PlayerVisibilityBlock, boolean>>;

export interface PlayerProfileRecord {
  readonly id: string;
  readonly access: PlayerAccessRecord;
  readonly data: {
    readonly ozId: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly nationality: string;
    readonly country: string;
    readonly region: string | null;
    readonly city: string | null;
    readonly primaryPosition: string | null;
    readonly secondaryPosition: string | null;
    readonly dominantFoot: string | null;
    readonly heightCm: number | null;
    readonly weightKg: number | null;
  };
  /** 0 email seul, 1 email et téléphone vérifiés, 2 identité vérifiée (D2 du lot 1.13a). */
  readonly kycLevel: 0 | 1 | 2;
  readonly visibility: PlayerVisibility;
}

function visibilityOf(value: unknown): PlayerVisibility {
  const out: Record<string, boolean> = {};
  if (typeof value !== 'object' || value === null) return out;
  for (const block of PLAYER_VISIBILITY_BLOCKS) {
    const flag = (value as Record<string, unknown>)[block];
    if (typeof flag === 'boolean') out[block] = flag;
  }
  return out;
}

/** Fiche `ozId` telle que le lecteur du contexte a le droit de la voir ; `null` sinon, sans distinction. */
export async function playerProfileByOzId(
  tx: TransactionClient,
  ozId: string,
): Promise<PlayerProfileRecord | null> {
  if (!OZ_ID.test(ozId)) return null;
  const rows = await tx.$queryRaw<
    {
      id: string;
      oz_id: string;
      user_id: string | null;
      first_name: string;
      last_name: string;
      birth_date: Date;
      nationality: string;
      country: string;
      region: string | null;
      city: string | null;
      primary_position: string | null;
      secondary_position: string | null;
      dominant_foot: string | null;
      height_cm: number | null;
      weight_kg: number | null;
      verification_status: string;
      guardian_user_id: string | null;
      organization_id: string | null;
      published: boolean;
      deletion_pending: boolean;
      kyc_level: number;
      visibility: unknown;
      checked_at: Date;
    }[]
  >`
    SELECT p.id::text, p.oz_id, p.user_id::text, p.first_name, p.last_name, p.birth_date,
      p.nationality, p.country, p.region, p.city, p.primary_position::text,
      p.secondary_position::text, p.dominant_foot::text, p.height_cm, p.weight_kg,
      p.verification_status::text,
      CASE WHEN EXISTS (
        SELECT 1 FROM guardians g
        WHERE g.id = p.guardian_id AND g.user_id = oz_current_user_id()
          AND g.deleted_at IS NULL AND g.verification_status = 'verified')
      THEN oz_current_user_id()::text END AS guardian_user_id,
      p.organization_id::text,
      oz_player_published(p.id, p.guardian_id, p.verification_status) AS published,
      oz_player_kyc_level(p.id) AS kyc_level,
      oz_account_deletion_pending(p.user_id) AS deletion_pending,
      p.visibility,
      now() AS checked_at
    FROM players p
    WHERE p.oz_id = ${ozId} AND p.deleted_at IS NULL`;
  const row = rows[0];
  if (row === undefined) return null;
  const level = row.kyc_level;
  return {
    id: row.id,
    access: {
      userId: row.user_id,
      birthDate: row.birth_date,
      verificationStatus: row.verification_status,
      guardianUserId: row.guardian_user_id,
      organizationId: row.organization_id,
      testedByOrganizationIds: [],
      hasPublicationConsent: row.published,
      deletionPending: row.deletion_pending,
      checkedAt: row.checked_at,
    },
    data: {
      ozId: row.oz_id,
      firstName: row.first_name,
      lastName: row.last_name,
      nationality: row.nationality,
      country: row.country,
      region: row.region,
      city: row.city,
      primaryPosition: row.primary_position,
      secondaryPosition: row.secondary_position,
      dominantFoot: row.dominant_foot,
      heightCm: row.height_cm,
      weightKg: row.weight_kg,
    },
    kycLevel: level === 2 ? 2 : level === 1 ? 1 : 0,
    visibility: visibilityOf(row.visibility),
  };
}

/** Téléphone déchiffré d'un joueur visible du lecteur ; `null` s'il n'en a pas ou s'il est caché. */
export async function playerPhone(
  tx: TransactionClient,
  playerId: string,
  encryptionKey: string,
): Promise<string | null> {
  if (!UUID.test(playerId)) return null;
  const rows = await tx.$queryRaw<{ phone: string | null }[]>`
    SELECT oz_decrypt(p.phone_encrypted, ${encryptionKey}) AS phone
    FROM players p WHERE p.id = ${playerId}::uuid AND p.deleted_at IS NULL`;
  return rows[0]?.phone ?? null;
}

/**
 * Règle des blocs (titulaire majeur ou tuteur vérifié d'un mineur), audité par la base. `null` :
 * joueur inconnu, supprimé ou sans droit, sans distinction.
 */
export async function setPlayerVisibility(
  tx: TransactionClient,
  playerId: string,
  blocks: PlayerVisibility,
): Promise<PlayerVisibility | null> {
  if (!UUID.test(playerId)) return null;
  const clean = visibilityOf(blocks);
  if (Object.keys(clean).length === 0 || Object.keys(blocks).length !== Object.keys(clean).length) {
    throw new Error('Visibilité : blocs booléens connus attendus.');
  }
  const rows = await tx.$queryRaw<{ visibility: unknown }[]>`
    SELECT oz_player_set_visibility(${playerId}::uuid, ${JSON.stringify(clean)}::jsonb) AS visibility`;
  const visibility = rows[0]?.visibility;
  return visibility === null || visibility === undefined ? null : visibilityOf(visibility);
}

/** Lecture journalisée (cellule `logged`, EX-T16 n° 4) : écrite dans la transaction de la lecture. */
export async function recordPlayerProfileView(
  tx: TransactionClient,
  actorUserId: string,
  playerId: string,
  view: string,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (${actorUserId}::uuid, 'player.profile.viewed', 'player', ${playerId}::uuid,
      'Fiche consultée', jsonb_build_object('view', ${view}::text))`;
}
