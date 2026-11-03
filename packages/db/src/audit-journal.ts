// Journal d'audit (lot 1.16a) : appels typés à la migration 20261107100000_audit_journal. Le worker
// (`oz_worker`, hors contexte utilisateur) entretient les partitions, lit la tête et vérifie la
// chaîne ; l'administrateur vérifié consulte le journal et les vérifications sous la RLS.

import type { TransactionClient } from './session-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
/** Borne de la consultation par page. */
export const AUDIT_LOG_MAX_PAGE = 100;

/** Client ou transaction : seule la requête brute est utilisée. */
type Queryable = Pick<TransactionClient, '$queryRaw'>;

export interface AuditPartitions {
  /** Entrées tombées dans `audit_log_default` (D-057) : toujours 0 en fonctionnement normal. */
  readonly defaultRows: number;
  /** Mois (courant et trois suivants) dont la partition n'a pas pu être créée. */
  readonly failedMonths: number;
  /** Code SQLSTATE du dernier échec, `null` sans échec. */
  readonly errorCode: string | null;
}

export interface AuditHead {
  readonly position: number;
  /** SHA-256 de la dernière entrée, en hexadécimal (64 zéros pour une chaîne vide). */
  readonly hash: string;
}

export interface AuditCheck {
  readonly checkedAt: Date;
  readonly headPosition: number;
  readonly anchorPosition: number | null;
  /** Première position en défaut ; `null` : chaîne intègre et conforme à l'ancre. */
  readonly defectPosition: number | null;
}

export interface AuditLogFilters {
  readonly limit: number;
  /** Position à partir de laquelle (exclue) lire vers le passé. */
  readonly before?: number | undefined;
  readonly action?: string | undefined;
  readonly targetType?: string | undefined;
  readonly targetId?: string | undefined;
  readonly actorUserId?: string | undefined;
  readonly from?: Date | undefined;
  readonly to?: Date | undefined;
}

export interface AuditLogEntry {
  readonly id: string;
  readonly position: number;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  readonly reason: string;
  readonly requestId: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
  readonly hash: string;
}

export interface AuditLogPage {
  readonly entries: readonly AuditLogEntry[];
  /** Position de la dernière entrée rendue s'il en reste d'autres, sinon `null`. */
  readonly nextBefore: number | null;
}

function position(value: bigint | null, label: string): number {
  if (value === null) throw new Error(`Journal d'audit : ${label} absente.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Journal d'audit : ${label} hors bornes.`);
  return n;
}

function optionalPosition(value: bigint | null, label: string): number | null {
  return value === null ? null : position(value, label);
}

/** Crée le mois courant et les trois suivants ; compte les entrées de la partition par défaut. */
export async function maintainAuditPartitions(db: Queryable): Promise<AuditPartitions> {
  const rows = await db.$queryRaw<
    { default_rows: bigint; failed_months: number; error_code: string | null }[]
  >`SELECT default_rows, failed_months, error_code FROM oz_audit_maintain_partitions()`;
  const row = rows[0];
  if (row === undefined) throw new Error("Journal d'audit : entretien sans réponse.");
  return {
    defaultRows: position(row.default_rows, 'partition par défaut'),
    failedMonths: row.failed_months,
    errorCode: row.error_code,
  };
}

/** Tête de la chaîne, à ancrer hors de la base (D-060). */
export async function auditChainHead(db: Queryable): Promise<AuditHead> {
  const rows = await db.$queryRaw<{ head_position: bigint; head_hash: Buffer }[]>`
    SELECT head_position, head_hash FROM oz_audit_head()`;
  const row = rows[0];
  if (row === undefined) throw new Error("Journal d'audit : tête inaccessible.");
  return {
    position: position(row.head_position, 'position de tête'),
    hash: Buffer.from(row.head_hash).toString('hex'),
  };
}

/** Vérifie la chaîne contre la dernière ancre (ou sans ancre) et consigne le résultat (CP-23). */
export async function checkAuditChain(
  db: Queryable,
  anchor: AuditHead | null,
): Promise<AuditCheck> {
  if (anchor !== null) {
    if (!Number.isSafeInteger(anchor.position) || anchor.position < 1 || !HASH.test(anchor.hash)) {
      throw new TypeError("journal d'audit : ancre hors format");
    }
  }
  const anchorPosition = anchor === null ? null : BigInt(anchor.position);
  const anchorHash = anchor === null ? null : Buffer.from(anchor.hash, 'hex');
  const rows = await db.$queryRaw<
    {
      checked_at: Date;
      head_position: bigint;
      anchor_position: bigint | null;
      defect_position: bigint | null;
    }[]
  >`SELECT checked_at, head_position, anchor_position, defect_position
    FROM oz_audit_check(${anchorPosition}::bigint, ${anchorHash}::bytea)`;
  const row = rows[0];
  if (row === undefined) throw new Error("Journal d'audit : vérification sans réponse.");
  return toCheck(row);
}

function toCheck(row: {
  checked_at: Date;
  head_position: bigint;
  anchor_position: bigint | null;
  defect_position: bigint | null;
}): AuditCheck {
  return {
    checkedAt: row.checked_at,
    headPosition: position(row.head_position, 'position de tête'),
    anchorPosition: optionalPosition(row.anchor_position, "position d'ancre"),
    defectPosition: optionalPosition(row.defect_position, 'position en défaut'),
  };
}

/** Dernière vérification consignée, sous la RLS (administrateur vérifié) ; `null` si aucune. */
export async function latestAuditCheck(db: Queryable): Promise<AuditCheck | null> {
  const rows = await db.$queryRaw<
    {
      checked_at: Date;
      head_position: bigint;
      anchor_position: bigint | null;
      defect_position: bigint | null;
    }[]
  >`SELECT checked_at, head_position, anchor_position, defect_position FROM audit_chain_checks
    ORDER BY checked_at DESC, id DESC LIMIT 1`;
  const row = rows[0];
  return row === undefined ? null : toCheck(row);
}

/**
 * Page du journal, de la plus récente à la plus ancienne, sous la RLS (administrateur vérifié :
 * tout ; autre rôle : rien). Pagination par position (jamais `OFFSET`, EX-T20 n° 2).
 */
export async function listAuditLog(db: Queryable, filters: AuditLogFilters): Promise<AuditLogPage> {
  const { limit } = filters;
  if (!Number.isInteger(limit) || limit < 1 || limit > AUDIT_LOG_MAX_PAGE) {
    throw new TypeError(`journal d'audit : page de 1 à ${String(AUDIT_LOG_MAX_PAGE)}`);
  }
  if (
    filters.before !== undefined &&
    (!Number.isSafeInteger(filters.before) || filters.before < 1)
  ) {
    throw new TypeError("journal d'audit : curseur hors bornes");
  }
  for (const date of [filters.from, filters.to]) {
    if (date !== undefined && Number.isNaN(date.getTime())) {
      throw new TypeError("journal d'audit : date invalide");
    }
  }
  for (const id of [filters.targetId, filters.actorUserId]) {
    if (id !== undefined && !UUID.test(id)) throw new TypeError("journal d'audit : UUID attendu");
  }
  const before = filters.before === undefined ? null : BigInt(filters.before);
  const rows = await db.$queryRaw<
    {
      id: string;
      chain_position: bigint;
      actor_user_id: string | null;
      action: string;
      target_type: string;
      target_id: string | null;
      reason: string;
      request_id: string | null;
      metadata: Record<string, unknown>;
      created_at: Date;
      hash: Buffer;
    }[]
  >`SELECT id::text, chain_position, actor_user_id::text, action, target_type, target_id::text,
      reason, request_id, metadata, created_at, hash
    FROM audit_log
    WHERE (${before}::bigint IS NULL OR chain_position < ${before}::bigint)
      AND (${filters.action ?? null}::text IS NULL OR action = ${filters.action ?? null}::text)
      AND (${filters.targetType ?? null}::text IS NULL
        OR target_type = ${filters.targetType ?? null}::text)
      AND (${filters.targetId ?? null}::uuid IS NULL OR target_id = ${filters.targetId ?? null}::uuid)
      AND (${filters.actorUserId ?? null}::uuid IS NULL
        OR actor_user_id = ${filters.actorUserId ?? null}::uuid)
      AND (${filters.from ?? null}::timestamptz IS NULL OR created_at >= ${filters.from ?? null}::timestamptz)
      AND (${filters.to ?? null}::timestamptz IS NULL OR created_at < ${filters.to ?? null}::timestamptz)
    ORDER BY chain_position DESC
    LIMIT ${limit + 1}::integer`;
  const page = rows.slice(0, limit).map((row): AuditLogEntry => ({
    id: row.id,
    position: position(row.chain_position, 'position'),
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    requestId: row.request_id,
    metadata: row.metadata,
    createdAt: row.created_at,
    hash: Buffer.from(row.hash).toString('hex'),
  }));
  const last = page.at(-1);
  return { entries: page, nextBefore: rows.length > limit && last ? last.position : null };
}
