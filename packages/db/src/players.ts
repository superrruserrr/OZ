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
    checkedAt: row.checked_at,
  };
}
