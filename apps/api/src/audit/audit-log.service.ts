import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '@oz/auth';
import type { AuditIntegrityOutput, AuditLogPageOutput, AuditLogQueryOutput } from '@oz/contracts';
import { latestAuditCheck, listAuditLog, withUserContext, type PrismaClient } from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';

const CURSOR = /^p:([1-9]\d{0,15})$/;

/** Curseur opaque : la position de la dernière entrée rendue, encodée en base64url. */
export function encodeCursor(position: number): string {
  return Buffer.from(`p:${String(position)}`).toString('base64url');
}

/** Position portée par le curseur ; `null` s'il n'a pas été émis par `encodeCursor`. */
export function decodeCursor(cursor: string): number | null {
  const match = CURSOR.exec(Buffer.from(cursor, 'base64url').toString('latin1'));
  if (match?.[1] === undefined) return null;
  const position = Number(match[1]);
  // Forme canonique seulement : un curseur forgé autrement est refusé.
  return Number.isSafeInteger(position) && encodeCursor(position) === cursor ? position : null;
}

const INVALID_CURSOR = (): AppException =>
  new AppException(422, 'VALIDATION_FAILED', 'Données invalides.', [
    { field: 'cursor', code: 'invalid_cursor' },
  ]);

/** Filtres reçus (noms seuls) : le journal applicatif ne porte jamais leurs valeurs. */
const FILTERS = ['action', 'targetType', 'targetId', 'actorUserId', 'from', 'to'] as const;

/**
 * Consultation du journal d'audit (lot 1.16a, EX-118 n° 1, EX-T11) par l'administrateur vérifié :
 * `audit.read_log` (CASL) puis RLS (`audit_log_admin_read`) sous le contexte de l'acteur. Pagination
 * par position décroissante, jamais `OFFSET` (EX-T20 n° 2). État de la dernière vérification (CP-23).
 */
@Injectable()
export class AuditLogService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(AuditLogService.name) private readonly logger: PinoLogger,
  ) {}

  async list(actor: Actor, query: AuditLogQueryOutput): Promise<AuditLogPageOutput> {
    const before = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (before === null) throw INVALID_CURSOR();
    await this.consume(actor);
    const page = await withUserContext(this.db, actor.userId, (tx) =>
      listAuditLog(tx, {
        limit: query.limit,
        before,
        action: query.action,
        targetType: query.targetType,
        targetId: query.targetId,
        actorUserId: query.actorUserId,
        from: query.from === undefined ? undefined : new Date(query.from),
        to: query.to === undefined ? undefined : new Date(query.to),
      }),
    );
    this.logger.info(
      {
        event: 'audit.log.read',
        filters: FILTERS.filter((name) => query[name] !== undefined),
        count: page.entries.length,
      },
      "Journal d'audit consulté",
    );
    return {
      entries: page.entries.map((entry) => ({
        id: entry.id,
        position: entry.position,
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        reason: entry.reason,
        requestId: entry.requestId,
        metadata: JSON.stringify(entry.metadata),
        createdAt: entry.createdAt.toISOString(),
        hash: entry.hash,
      })),
      nextCursor: page.nextBefore === null ? null : encodeCursor(page.nextBefore),
    };
  }

  async integrity(actor: Actor): Promise<AuditIntegrityOutput> {
    await this.consume(actor);
    const check = await withUserContext(this.db, actor.userId, (tx) => latestAuditCheck(tx));
    if (check === null) return { lastCheck: null };
    return {
      lastCheck: {
        checkedAt: check.checkedAt.toISOString(),
        headPosition: check.headPosition,
        anchorPosition: check.anchorPosition,
        isIntact: check.defectPosition === null,
        defectPosition: check.defectPosition,
      },
    };
  }

  private async consume(actor: Actor): Promise<void> {
    const decision = await this.limiter.consume('audit_log_read_account', actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
