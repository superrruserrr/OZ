import { Inject, Injectable } from '@nestjs/common';
import type { Actor, RateLimitRule } from '@oz/auth';
import type {
  SavedSearchCreateOutput,
  SavedSearchListOutput,
  SavedSearchOutput,
} from '@oz/contracts';
import {
  createSavedSearch,
  deleteSavedSearch,
  listSavedSearches,
  withUserContext,
  type PrismaClient,
  type SavedSearchRecord,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { authorizeSearch } from './search-rows.js';

const LIMIT_REACHED = (): AppException =>
  new AppException(409, 'SAVED_SEARCH_LIMIT', 'Vous avez déjà 20 recherches sauvegardées.');
/** Inconnue ou d'un autre compte : même réponse. */
const NOT_FOUND = (): AppException => new AppException(404, 'NOT_FOUND', 'Ressource introuvable.');

const output = (record: SavedSearchRecord): SavedSearchOutput => ({
  id: record.id,
  name: record.name,
  criteria: record.criteria,
  sort: record.sort as SavedSearchOutput['sort'],
  ...(record.direction === null ? {} : { order: record.direction }),
  createdAt: record.createdAt.toISOString(),
});

/**
 * Recherches sauvegardées (lot 1.14b, EX-116 n° 3, D2) : critères et tri seuls, privés au compte
 * (RLS), 20 au plus (base). À la création, les critères passent par la portée du moment (D1) ; une
 * sauvegarde est rejouée par `GET /players`, donc revérifiée à chaque fois. Le journal applicatif ne
 * porte ni nom ni critère.
 */
@Injectable()
export class SavedSearchService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(SavedSearchService.name) private readonly logger: PinoLogger,
  ) {}

  async list(actor: Actor): Promise<SavedSearchListOutput> {
    authorizeSearch(actor, {}, this.logger);
    const records = await withUserContext(this.db, actor.userId, (tx) => listSavedSearches(tx));
    return { items: records.map(output) };
  }

  async create(actor: Actor, input: SavedSearchCreateOutput): Promise<SavedSearchOutput> {
    await this.limit('player_saved_search_account', actor);
    authorizeSearch(actor, input.criteria, this.logger);
    const outcome = await withUserContext(this.db, actor.userId, (tx) =>
      createSavedSearch(tx, {
        name: input.name,
        criteria: input.criteria,
        sort: input.sort,
        direction: input.order,
      }),
    );
    if (outcome.outcome === 'limit') {
      this.logger.info({ event: 'player.saved_search.limit' }, 'Sauvegarde refusée');
      throw LIMIT_REACHED();
    }
    this.logger.info({ event: 'player.saved_search.created' }, 'Recherche sauvegardée');
    return output({
      id: outcome.id,
      name: input.name,
      criteria: input.criteria,
      sort: input.sort,
      direction: input.order ?? null,
      createdAt: outcome.createdAt,
    });
  }

  async remove(actor: Actor, id: string): Promise<void> {
    await this.limit('player_saved_search_account', actor);
    authorizeSearch(actor, {}, this.logger);
    const deleted = await withUserContext(this.db, actor.userId, (tx) => deleteSavedSearch(tx, id));
    if (!deleted) throw NOT_FOUND();
    this.logger.info({ event: 'player.saved_search.deleted' }, 'Recherche sauvegardée supprimée');
  }

  private async limit(rule: RateLimitRule, actor: Actor): Promise<void> {
    const decision = await this.limiter.consume(rule, actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
