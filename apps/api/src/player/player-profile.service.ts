import { Inject, Injectable } from '@nestjs/common';
import {
  abilityFor,
  authorizationReason,
  playerSubject,
  playerViewFor,
  serializeView,
  type Actor,
  type PlayerViewData,
} from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import type {
  PlayerProfileOutput,
  PlayerVisibilityInput,
  PlayerVisibilityOutput,
} from '@oz/contracts';
import {
  playerPhone,
  playerProfileByOzId,
  recordPlayerProfileView,
  setPlayerVisibility,
  withUserContext,
  type PlayerVisibility,
  type PrismaClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { PLAYER_NOT_FOUND } from './errors.js';

const READS = ['profile.read', 'player.read_public', 'player.read_minor'] as const;

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Fiche joueur (lot 1.13a, EX-115) : lue par OZ ID sous la RLS du lecteur, sérialisée selon sa vue
 * (EX-104), blocs masqués aux tiers. Une lecture journalisée (cellule `logged`) est auditée dans la
 * même transaction : sans audit, aucune fiche. Le journal applicatif ne porte ni OZ ID ni donnée.
 */
@Injectable()
export class PlayerProfileService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(PlayerProfileService.name) private readonly logger: PinoLogger,
  ) {}

  /** Inconnu, mal formé, supprimé, caché par la RLS ou sans vue : même 404. */
  async read(actor: Actor, ozId: string): Promise<PlayerProfileOutput> {
    const decision = await this.limiter.consume('player_profile_read_account', actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const profile = await withUserContext(this.db, actor.userId, async (tx) => {
      const found = await playerProfileByOzId(tx, ozId);
      if (found === null) return null;
      const { checkedAt, ...access } = found.access;
      const subject = playerSubject(access, checkedAt);
      const ability = abilityFor(actor);
      const view = playerViewFor(actor, ability, subject, found.visibility);
      if (view === null) return null;
      const phone = view.fields.includes('phone')
        ? await playerPhone(tx, found.id, this.encryptionKey())
        : undefined;
      if (
        READS.some(
          (action) =>
            ability.can(action, subject) &&
            authorizationReason(ability, action, subject) === 'audit',
        )
      ) {
        await recordPlayerProfileView(tx, actor.userId, found.id, view.name);
      }
      const data: PlayerViewData = {
        ...found.data,
        id: found.id,
        birthDate: isoDate(found.access.birthDate),
        birthYear: found.access.birthDate.getUTCFullYear(),
        verificationStatus: found.access.verificationStatus,
        verificationLevel: found.kycLevel,
        organizationId: found.access.organizationId,
        ...(phone === undefined ? {} : { phone }),
      };
      return { id: found.id, view: view.name, body: serializeView(view, data) };
    });
    if (profile === null) {
      this.logger.info({ event: 'player.profile.refused' }, 'Fiche refusée');
      throw PLAYER_NOT_FOUND();
    }
    this.logger.info(
      { event: 'player.profile.read', playerId: profile.id, view: profile.view },
      'Fiche lue',
    );
    return profile.body as PlayerProfileOutput;
  }

  /** Titulaire majeur ou tuteur vérifié d'un mineur ; sinon le même 404 qu'un joueur inconnu. */
  async setVisibility(
    actor: Actor,
    ozId: string,
    input: PlayerVisibilityInput,
  ): Promise<PlayerVisibilityOutput> {
    const decision = await this.limiter.consume('player_visibility_update_account', actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
    const updated = await withUserContext(this.db, actor.userId, async (tx) => {
      const found = await playerProfileByOzId(tx, ozId);
      if (found === null) return null;
      const { checkedAt, ...access } = found.access;
      if (!abilityFor(actor).can('profile.set_visibility', playerSubject(access, checkedAt))) {
        return null;
      }
      // La base redécide (titulaire majeur, tuteur vérifié) et audite l'écriture.
      const blocks = Object.fromEntries(
        Object.entries(input).filter(([, flag]) => flag !== undefined),
      ) as PlayerVisibility;
      const visibility = await setPlayerVisibility(tx, found.id, blocks);
      return visibility === null ? null : { id: found.id, visibility };
    });
    if (updated === null) {
      this.logger.info({ event: 'player.visibility.refused' }, 'Réglage refusé');
      throw PLAYER_NOT_FOUND();
    }
    this.logger.info(
      { event: 'player.visibility.updated', playerId: updated.id, blocks: Object.keys(input) },
      'Visibilité réglée',
    );
    return updated.visibility;
  }

  private encryptionKey(): string {
    const key = this.config.auth?.columnEncryptionKey;
    // Le module n'est monté qu'avec FEATURE_AUTH : la clé est toujours là.
    if (key === undefined) throw new Error('Clé de chiffrement des colonnes absente.');
    return key;
  }
}
