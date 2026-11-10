import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type { PlayerSearchExportQueryOutput } from '@oz/contracts';
import {
  accountEmail,
  currentSubscription,
  recordListedPlayers,
  recordSearchExport,
  searchPlayers,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { searchExportCsv } from './csv.js';
import { EXPORT_ROWS_CAP, exportQuotaOf } from './export-quota.js';
import { maskEmail } from './player-profile.service.js';
import { authorizeSearch, DEFAULT_DIRECTION, SEARCH_FORBIDDEN, viewRows } from './search-rows.js';

/** Rôles dont l'organisation porte le quota (portée complète, rbac `player.search`). */
const EXPORTING_ROLES = new Set(['club', 'federation', 'recruiter']);

/** Le recruteur ne cherche qu'au KYC 3 : sans lui, son organisation ne porte aucun export. */
const exportingRole = (actor: Actor, role: string): boolean =>
  EXPORTING_ROLES.has(role) && (role !== 'recruiter' || actor.isKyc3Verified);

/** Quota du palier épuisé (design.md §5.9) : 429, palier et remise à zéro par `Retry-After`. */
export class ExportQuotaExceededException extends AppException {
  constructor(
    readonly retryAfterSeconds: number,
    tier: string,
  ) {
    super(429, 'EXPORT_QUOTA_EXCEEDED', 'Quota d’export de votre palier atteint.', [
      { field: 'tier', code: tier },
    ]);
  }
}

const ORGANIZATION_REQUIRED = (): AppException =>
  new AppException(422, 'VALIDATION_FAILED', 'Données invalides.', [
    { field: 'quotaOrganizationId', code: 'required' },
  ]);

export interface SearchExportFile {
  readonly csv: string;
  readonly exportId: string;
}

/**
 * Export CSV de la recherche (lot 1.14b, EX-116 n° 4, 7, D1, D3 à D5) : portée complète seulement
 * (l'académie n'exporte pas), mêmes critères, RLS et vue par ligne que `GET /players`, borné aux
 * lignes du palier. Le quota de l'organisation imputée est relu et tenu par la base sous verrou
 * (CP-33) ; l'API le relit aussi pour borner la recherche ; l'export est inscrit et audité, et chaque mineur listé à un lecteur
 * journalisé l'est aussi (CP-14), dans la transaction, avant la réponse. Quota épuisé : rien
 * d'inscrit ni d'audité. Le journal applicatif ne porte ni critère ni joueur.
 */
@Injectable()
export class SearchExportService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(SearchExportService.name) private readonly logger: PinoLogger,
  ) {}

  async export(actor: Actor, query: PlayerSearchExportQueryOutput): Promise<SearchExportFile> {
    const decision = await this.limiter.consume('player_search_export_account', actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const { sort, order, quotaOrganizationId, ...criteria } = query;
    const { ability, scope } = authorizeSearch(actor, criteria, this.logger);
    // D1 : la portée réduite (académie) n'exporte pas.
    if (scope.kind !== 'full') {
      this.logger.info({ event: 'player.search.export_refused' }, 'Export refusé');
      throw SEARCH_FORBIDDEN();
    }
    const isAdmin = scope.organizationIds === null;
    const organizationId = isAdmin ? null : this.organizationOf(actor, quotaOrganizationId);
    const direction = order ?? DEFAULT_DIRECTION[sort];
    const issuedAt = new Date();

    const result = await withUserContext(this.db, actor.userId, async (tx) => {
      const quota =
        organizationId === null
          ? { rows: EXPORT_ROWS_CAP }
          : exportQuotaOf(await currentSubscription(tx, organizationId));
      const found = await searchPlayers(tx, criteria, {
        sort,
        direction,
        limit: quota.rows,
        respectBlocks: !isAdmin,
      });
      const { rows, listedMinors } = viewRows(actor, ability, found.records);
      const outcome = await recordSearchExport(tx, {
        organizationId,
        rows: rows.length,
        sort,
        criteria: Object.keys(criteria).sort(),
      });
      if (outcome.outcome === 'quota_exceeded') {
        // Lève : la transaction est annulée, rien n'est inscrit ni audité.
        const seconds = Math.max(1, Math.ceil((outcome.resetAt.getTime() - Date.now()) / 1000));
        throw new ExportQuotaExceededException(seconds, outcome.tier);
      }
      await recordListedPlayers(tx, actor.userId, listedMinors, { exportId: outcome.id });
      return {
        exportId: outcome.id,
        rows: rows.map((row) => row.body),
        truncated: found.hasMore,
        email: await accountEmail(tx),
        listed: listedMinors.length,
      };
    });
    this.logger.info(
      { event: 'player.search.exported', rows: result.rows.length, listed: result.listed },
      'Export de recherche',
    );
    const csv = searchExportCsv(
      this.hmacKey(),
      {
        exportId: result.exportId,
        reader: maskEmail(result.email),
        roles: [...new Set(actor.roles.map((held) => held.role))].join(', ') || 'compte',
        issuedAt,
        rows: result.rows.length,
        truncated: result.truncated,
      },
      result.rows,
    );
    return { csv, exportId: result.exportId };
  }

  /** Organisation imputée : celle demandée parmi les siennes, ou la seule ; 422 s'il faut choisir. */
  private organizationOf(actor: Actor, requested: string | undefined): string {
    const owned = [
      ...new Set(
        actor.roles.flatMap((held) =>
          exportingRole(actor, held.role) && held.organizationId !== null
            ? [held.organizationId]
            : [],
        ),
      ),
    ];
    if (requested !== undefined) {
      if (!owned.includes(requested)) throw SEARCH_FORBIDDEN();
      return requested;
    }
    const [only, ...others] = owned;
    if (only === undefined) throw SEARCH_FORBIDDEN();
    if (others.length > 0) throw ORGANIZATION_REQUIRED();
    return only;
  }

  private hmacKey(): string {
    const key = this.config.auth?.hmacKey;
    // Le module n'est monté qu'avec FEATURE_AUTH : la clé est toujours là.
    if (key === undefined) throw new Error('Clé HMAC absente.');
    return key;
  }
}
