import { Inject, Injectable } from '@nestjs/common';
import {
  abilityFor,
  authorizationReason,
  playerSubject,
  playerViewFor,
  refusedSearchCriteria,
  searchScopeFor,
  serializeView,
  type Actor,
  type PlayerSubject,
  type AppAbility,
} from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type {
  PlayerProfileOutput,
  PlayerSearchPageOutput,
  PlayerSearchQueryOutput,
  PlayerSearchSortOutput,
} from '@oz/contracts';
import { recordPlayerSearch, searchPlayers, withUserContext, type PrismaClient } from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { openSearchCursor, sealSearchCursor, searchFingerprint } from './search-cursor.js';
import { profileViewData } from './view-data.js';

const READS = ['profile.read', 'player.read_public', 'player.read_minor'] as const;

/** Sens par défaut (D6) : alphabétique et par âge croissants ; récents et pertinents d'abord. */
const DEFAULT_DIRECTION: Readonly<Record<PlayerSearchSortOutput, 'asc' | 'desc'>> = {
  name: 'asc',
  birthYear: 'asc',
  recent: 'desc',
  relevance: 'desc',
};

const SEARCH_FORBIDDEN = (): AppException =>
  new AppException(403, 'FORBIDDEN', 'Action non autorisée.');
const CRITERIA_FORBIDDEN = (fields: readonly string[]): AppException =>
  new AppException(
    403,
    'SEARCH_CRITERIA_FORBIDDEN',
    'Critères réservés à une recherche complète.',
    fields.map((field) => ({ field, code: 'criteria_forbidden' })),
  );
const INVALID_CURSOR = (): AppException =>
  new AppException(422, 'VALIDATION_FAILED', 'Données invalides.', [
    { field: 'cursor', code: 'invalid_cursor' },
  ]);

/** Lecture journalisée (cellule `logged`, `kyc3+logged`) : le mineur listé est audité (D3). */
function auditedRead(ability: AppAbility, subject: PlayerSubject): boolean {
  return READS.some(
    (action) =>
      ability.can(action, subject) && authorizationReason(ability, action, subject) === 'audit',
  );
}

/**
 * Recherche de joueurs (lot 1.14a, EX-116) : portée relue en base (CASL), critères avancés refusés
 * à la portée réduite (D1), requête sous la RLS du lecteur, puis chaque ligne repasse par la même
 * décision et la même vue que sa fiche (CP-10, CP-12). Le téléphone n'est jamais listé : il reste
 * sur la fiche. Recherche et mineurs listés à un lecteur journalisé sont audités dans la transaction
 * (D3, CP-14). Le journal applicatif ne porte ni critère ni joueur.
 */
@Injectable()
export class PlayerSearchService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(PlayerSearchService.name) private readonly logger: PinoLogger,
  ) {}

  async search(actor: Actor, query: PlayerSearchQueryOutput): Promise<PlayerSearchPageOutput> {
    const decision = await this.limiter.consume('player_search_account', actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const ability = abilityFor(actor);
    const scope = searchScopeFor(actor, ability);
    if (scope === null) throw SEARCH_FORBIDDEN();
    const { cursor, limit, sort, order, ...criteria } = query;
    const refused = refusedSearchCriteria(scope, criteria);
    if (refused.length > 0) {
      this.logger.info({ event: 'player.search.refused', criteria: refused }, 'Recherche refusée');
      throw CRITERIA_FORBIDDEN(refused);
    }
    const direction = order ?? DEFAULT_DIRECTION[sort];
    // Lié aussi à la portée : un changement de rôle invalide le curseur.
    const position = {
      sort,
      direction,
      fingerprint: searchFingerprint({ ...criteria, scope: scope.kind }),
    };
    const afterId =
      cursor === undefined
        ? undefined
        : (openSearchCursor(this.hmacKey(), actor.userId, cursor, position) ?? undefined);
    if (cursor !== undefined && afterId === undefined) throw INVALID_CURSOR();
    const isAdmin = scope.organizationIds === null;

    const page = await withUserContext(this.db, actor.userId, async (tx) => {
      const found = await searchPlayers(tx, criteria, {
        sort,
        direction,
        limit,
        afterId,
        respectBlocks: !isAdmin,
      });
      if (found.anchorLost) return null;
      const items: PlayerProfileOutput[] = [];
      const listedMinors: string[] = [];
      for (const record of found.records) {
        const { checkedAt, ...access } = record.access;
        const subject = playerSubject(access, checkedAt);
        const view = playerViewFor(actor, ability, subject, record.visibility);
        // Sans vue, la ligne n'est pas sérialisée (filet derrière la RLS).
        if (view === null) continue;
        if (subject.isMinor && auditedRead(ability, subject)) listedMinors.push(record.id);
        const body = serializeView(view, profileViewData(record)) as PlayerProfileOutput;
        items.push(body);
      }
      await recordPlayerSearch(
        tx,
        actor.userId,
        { sort, criteria: Object.keys(criteria).sort(), results: items.length },
        listedMinors,
      );
      const last = found.records.at(-1);
      return {
        items,
        nextCursor:
          found.hasMore && last !== undefined
            ? sealSearchCursor(this.hmacKey(), actor.userId, { ...position, afterId: last.id })
            : null,
        listed: listedMinors.length,
      };
    });
    // Dernière ligne devenue invisible entre deux pages : curseur périmé, la recherche reprend.
    if (page === null) throw INVALID_CURSOR();
    this.logger.info(
      { event: 'player.search.performed', results: page.items.length, listed: page.listed },
      'Recherche effectuée',
    );
    return { items: page.items, nextCursor: page.nextCursor };
  }

  private hmacKey(): string {
    const key = this.config.auth?.hmacKey;
    // Le module n'est monté qu'avec FEATURE_AUTH : la clé est toujours là.
    if (key === undefined) throw new Error('Clé HMAC absente.');
    return key;
  }
}
