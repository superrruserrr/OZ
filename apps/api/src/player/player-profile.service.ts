import { Inject, Injectable } from '@nestjs/common';
import {
  abilityFor,
  authorizationReason,
  playerSubject,
  playerViewFor,
  serializeView,
  type Actor,
  type RateLimitRule,
} from '@oz/auth';
import type { ApiConfig } from '@oz/config';
import { profileQrSvg, profileUrl } from '@oz/core';
import type {
  PlayerProfileOutput,
  PlayerVisibilityInput,
  PlayerVisibilityOutput,
} from '@oz/contracts';
import {
  accountEmail,
  playerPhone,
  playerProfileByOzId,
  playerProfileOfUser,
  recordPlayerDocument,
  recordPlayerProfileView,
  setPlayerVisibility,
  withUserContext,
  type PlayerProfileRecord,
  type PlayerVisibility,
  type PrismaClient,
  type TransactionClient,
} from '@oz/db';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { API_CONFIG } from '../config/config.module.js';
import { DB_CLIENT } from '../database/database.module.js';
import { PLAYER_NOT_FOUND } from './errors.js';
import { cardPdf } from './pdf/card.js';
import { profilePdf } from './pdf/profile.js';
import { profileViewData } from './view-data.js';

interface PresentedProfile {
  readonly id: string;
  readonly ozId: string;
  readonly view: string;
  readonly body: PlayerProfileOutput;
}

const READS = ['profile.read', 'player.read_public', 'player.read_minor'] as const;

/** Email masqué du filigrane : première lettre, puis le domaine (`j***@example.test`). */
export function maskEmail(email: string | null): string {
  if (email === null) return 'compte OZ';
  const at = email.lastIndexOf('@');
  return at < 1 ? 'compte OZ' : `${email.slice(0, 1)}***${email.slice(at)}`;
}

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
    await this.limit('player_profile_read_account', actor);
    const profile = await withUserContext(this.db, actor.userId, (tx) =>
      this.resolve(tx, actor, ozId),
    );
    if (profile === null) {
      this.logger.info({ event: 'player.profile.refused' }, 'Fiche refusée');
      throw PLAYER_NOT_FOUND();
    }
    this.logger.info(
      { event: 'player.profile.read', playerId: profile.id, view: profile.view },
      'Fiche lue',
    );
    return profile.body;
  }

  /**
   * Sa propre fiche (D-133) : le site relit l'OZ ID du titulaire sans le connaître. Même vue et même
   * limite que la lecture par OZ ID ; aucune fiche (tuteur, inscription en cours) : 404.
   */
  async readOwn(actor: Actor): Promise<PlayerProfileOutput> {
    await this.limit('player_profile_read_account', actor);
    const profile = await withUserContext(this.db, actor.userId, async (tx) => {
      const found = await playerProfileOfUser(tx, actor.userId);
      return found === null ? null : this.present(tx, actor, found);
    });
    if (profile === null) {
      this.logger.info({ event: 'player.profile.own_missing' }, 'Aucune fiche pour ce compte');
      throw PLAYER_NOT_FOUND();
    }
    this.logger.info(
      { event: 'player.profile.read', playerId: profile.id, view: profile.view },
      'Fiche lue',
    );
    return profile.body;
  }

  /** QR du profil (EX-115 n° 4) pour qui peut lire la fiche ; l'URL ne porte que l'OZ ID. */
  async qr(actor: Actor, ozId: string): Promise<string> {
    await this.limit('player_document_account', actor);
    const baseUrl = this.profileBase();
    // Le QR ne porte que l'OZ ID, déjà connu du demandeur : pas de lecture journalisée.
    const profile = await withUserContext(this.db, actor.userId, (tx) =>
      this.resolve(tx, actor, ozId, false),
    );
    if (profile === null) throw this.refused('qr');
    this.logger.info({ event: 'player.qr.issued', playerId: profile.id }, 'QR délivré');
    return profileQrSvg(profile.ozId, { baseUrl });
  }

  /** Carte OZ ID (EX-119) : titulaire majeur ou tuteur vérifié d'un mineur, auditée. */
  async card(actor: Actor, ozId: string): Promise<Buffer> {
    await this.limit('player_document_account', actor);
    const baseUrl = this.profileBase();
    const issuedAt = new Date();
    const card = await withUserContext(this.db, actor.userId, async (tx) => {
      const found = await playerProfileByOzId(tx, ozId);
      if (found === null) return null;
      const { checkedAt, ...access } = found.access;
      if (!abilityFor(actor).can('profile.card', playerSubject(access, checkedAt))) return null;
      await recordPlayerDocument(tx, actor.userId, found.id, 'player.card.issued', 'card');
      return {
        id: found.id,
        data: found.data,
        kycLevel: found.kycLevel,
        status: found.access.verificationStatus,
      };
    });
    if (card === null) throw this.refused('card');
    this.logger.info({ event: 'player.card.issued', playerId: card.id }, 'Carte éditée');
    return cardPdf({
      ozId: card.data.ozId,
      firstName: card.data.firstName,
      lastName: card.data.lastName,
      verificationLevel: card.kycLevel,
      verificationStatus: card.status,
      profileUrl: profileUrl(card.data.ozId, { baseUrl }),
      issuedAt,
    });
  }

  /** Export PDF de la vue du lecteur (EX-115 n° 5, D1), filigrané à son nom, audité. */
  async exportPdf(actor: Actor, ozId: string): Promise<Buffer> {
    await this.limit('player_document_account', actor);
    const issuedAt = new Date();
    const profile = await withUserContext(this.db, actor.userId, async (tx) => {
      const resolved = await this.resolve(tx, actor, ozId, false);
      if (resolved === null) return null;
      await recordPlayerDocument(
        tx,
        actor.userId,
        resolved.id,
        'player.profile.exported',
        resolved.view,
      );
      return { ...resolved, email: await accountEmail(tx) };
    });
    if (profile === null) throw this.refused('export');
    this.logger.info(
      { event: 'player.profile.exported', playerId: profile.id, view: profile.view },
      'Fiche exportée',
    );
    return profilePdf(profile.body, {
      reader: maskEmail(profile.email),
      // Tous les rôles du lecteur : celui qui fonde la vue en fait partie.
      role: [...new Set(actor.roles.map((held) => held.role))].join(', ') || 'compte',
      issuedAt,
    });
  }

  /**
   * Vue du lecteur sous sa RLS ; une lecture journalisée (cellule `logged`) est auditée dans la
   * transaction quand `auditView` (l'export a son propre audit).
   */
  private async resolve(
    tx: TransactionClient,
    actor: Actor,
    ozId: string,
    auditView = true,
  ): Promise<PresentedProfile | null> {
    const found = await playerProfileByOzId(tx, ozId);
    return found === null ? null : this.present(tx, actor, found, auditView);
  }

  /** Vue du lecteur sur une fiche déjà lue sous sa RLS ; `null` sans vue. */
  private async present(
    tx: TransactionClient,
    actor: Actor,
    found: PlayerProfileRecord,
    auditView = true,
  ): Promise<PresentedProfile | null> {
    const { checkedAt, ...access } = found.access;
    const subject = playerSubject(access, checkedAt);
    const ability = abilityFor(actor);
    const view = playerViewFor(actor, ability, subject, found.visibility);
    if (view === null) return null;
    const phone = view.fields.includes('phone')
      ? await playerPhone(tx, found.id, this.encryptionKey())
      : undefined;
    if (
      auditView &&
      READS.some(
        (action) =>
          ability.can(action, subject) && authorizationReason(ability, action, subject) === 'audit',
      )
    ) {
      await recordPlayerProfileView(tx, actor.userId, found.id, view.name);
    }
    const data = profileViewData(found, phone);
    return {
      id: found.id,
      ozId: found.data.ozId,
      view: view.name,
      body: serializeView(view, data) as PlayerProfileOutput,
    };
  }

  private async limit(rule: RateLimitRule, actor: Actor): Promise<void> {
    const decision = await this.limiter.consume(rule, actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }

  private refused(document: 'qr' | 'card' | 'export'): Error {
    this.logger.info({ event: 'player.document.refused', document }, 'Document refusé');
    return PLAYER_NOT_FOUND();
  }

  /** Base des profils : `/joueur/<OZ ID>` sous l'application web (design.md §11). */
  private profileBase(): string {
    const appUrl = this.config.auth?.appUrl;
    if (appUrl === undefined) throw new Error('APP_URL absente.');
    return `${appUrl.replace(/\/+$/, '')}/joueur`;
  }

  /** Titulaire majeur ou tuteur vérifié d'un mineur ; sinon le même 404 qu'un joueur inconnu. */
  async setVisibility(
    actor: Actor,
    ozId: string,
    input: PlayerVisibilityInput,
  ): Promise<PlayerVisibilityOutput> {
    await this.limit('player_visibility_update_account', actor);
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
