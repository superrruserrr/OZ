import { Inject, Injectable } from '@nestjs/common';
import type { Actor } from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type { PlayerSearchPageOutput, PlayerSearchQueryOutput } from '@oz/contracts';
import { recordPlayerSearch, searchPlayers, withUserContext, type PrismaClient } from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { openSearchCursor, sealSearchCursor, searchFingerprint } from './search-cursor.js';
import { authorizeSearch, DEFAULT_DIRECTION, viewRows } from './search-rows.js';

const INVALID_CURSOR = (): AppException =>
  new AppException(422, 'VALIDATION_FAILED', 'Données invalides.', [
    { field: 'cursor', code: 'invalid_cursor' },
  ]);

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
    const { cursor, limit, sort, order, ...criteria } = query;
    const { ability, scope } = authorizeSearch(actor, criteria, this.logger);
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
      const { rows, listedMinors } = viewRows(actor, ability, found.records);
      const items = rows.map((row) => row.body);
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
