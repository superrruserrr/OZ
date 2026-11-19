import { Inject, Injectable } from '@nestjs/common';
import { abilityFor, playerSubject, playerViewFor, type Actor, type RateLimitRule } from '@oz/auth';
import type { DocumentReadOutput, PlayerPhotosOutput } from '@oz/contracts';
import {
  playerPhotos,
  playerProfileByOzId,
  playerProfileOfUser,
  recordDocumentRead,
  removePlayerPhoto,
  setPlayerProfilePhoto,
  withUserContext,
  type PlayerPhoto,
  type PlayerProfileRecord,
  type PrismaClient,
  type TransactionClient,
} from '@oz/db';
import type { DocumentStorage } from '@oz/storage';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { RateLimitedException } from '../common/rate-limit/rate-limited.exception.js';
import { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DB_CLIENT } from '../database/database.module.js';
import { READ_URL_SECONDS } from './document-read.service.js';
import { DOCUMENT_STORAGE } from './document.tokens.js';
import { OWN_PROFILE_NOT_FOUND } from '../player/errors.js';
import { DOCUMENT_NOT_FOUND, PHOTO_NOT_SET } from './errors.js';

/** Vues qui voient toute la galerie (analyses en cours et refus) : titulaire et tuteur. */
const OWNERS = new Set(['PlayerSelfView', 'PlayerGuardianView']);

interface Gallery {
  readonly playerId: string;
  readonly manageable: boolean;
  readonly photos: readonly PlayerPhoto[];
}

/**
 * Photos du joueur (lot 1.19cd, U1 et U2). La fiche est lue sous la RLS du lecteur et sa vue décide :
 * sans vue, 404 ; titulaire et tuteur voient toute la galerie, le majeur et le tuteur la gèrent ; un tiers ne voit que
 * les photos saines, et rien si le bloc `photos` est masqué. Chaque image est servie par une URL
 * signée de 5 minutes, la lecture auditée avant que l'URL n'existe.
 */
@Injectable()
export class PlayerPhotoService {
  constructor(
    @Inject(DB_CLIENT) private readonly db: PrismaClient,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly limiter: RateLimiter,
    @InjectPinoLogger(PlayerPhotoService.name) private readonly logger: PinoLogger,
  ) {}

  /** `ozId` absent : sa propre fiche. */
  async list(actor: Actor, ozId: string | null): Promise<PlayerPhotosOutput> {
    await this.limit('player_profile_read_account', actor);
    const gallery = await withUserContext(this.db, actor.userId, (tx) =>
      this.gallery(tx, actor, ozId),
    );
    // Sa propre galerie sans fiche (tuteur, inscription en cours) : le code de `GET /players/me`.
    if (gallery === null) throw ozId === null ? OWN_PROFILE_NOT_FOUND() : DOCUMENT_NOT_FOUND();
    return {
      limit: 6,
      manageable: gallery.manageable,
      items: gallery.photos.map((photo) => ({
        id: photo.id,
        status: photo.status,
        isProfile: photo.isProfile,
        width: photo.width,
        height: photo.height,
      })),
    };
  }

  /** URL de lecture d'une photo saine de la galerie visible du lecteur. */
  async url(actor: Actor, ozId: string | null, photoId: string): Promise<DocumentReadOutput> {
    await this.limit('document_read_account', actor);
    const photo = await withUserContext(this.db, actor.userId, async (tx) => {
      const gallery = await this.gallery(tx, actor, ozId);
      const found = gallery?.photos.find((item) => item.id === photoId && item.status === 'clean');
      if (found === undefined) return null;
      await recordDocumentRead(tx, actor.userId, { id: found.id, type: 'photo' });
      return found;
    });
    if (photo === null) {
      this.logger.info({ event: 'player.photo.read_refused' }, 'Photo refusée');
      throw DOCUMENT_NOT_FOUND();
    }
    const signed = await this.storage.presignGet({
      key: photo.storageKey,
      contentType: photo.mimeType,
      expiresInSeconds: READ_URL_SECONDS,
    });
    this.logger.info({ event: 'player.photo.read', documentId: photo.id }, 'Photo servie');
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  /** Photo de profil choisie (ou retirée) par le titulaire majeur ; la base redécide et audite. */
  async setProfile(actor: Actor, documentId: string | null): Promise<PlayerPhotosOutput> {
    await this.limit('player_profile_update_account', actor);
    const done = await withUserContext(this.db, actor.userId, async (tx) => {
      const gallery = await this.gallery(tx, actor, null);
      if (gallery === null || !gallery.manageable) return false;
      if (
        documentId !== null &&
        !gallery.photos.some((photo) => photo.id === documentId && photo.status === 'clean')
      ) {
        return false;
      }
      return setPlayerProfilePhoto(tx, gallery.playerId, documentId);
    });
    if (!done) throw PHOTO_NOT_SET();
    this.logger.info({ event: 'player.photo.profile_set' }, 'Photo de profil choisie');
    return this.list(actor, null);
  }

  /** Retrait d'une photo de sa galerie : suppression logique, purge du fichier par le worker. */
  async remove(actor: Actor, documentId: string): Promise<void> {
    await this.limit('player_profile_update_account', actor);
    const done = await withUserContext(this.db, actor.userId, async (tx) => {
      const gallery = await this.gallery(tx, actor, null);
      if (gallery === null || !gallery.manageable) return false;
      if (!gallery.photos.some((photo) => photo.id === documentId)) return false;
      return removePlayerPhoto(tx, gallery.playerId, documentId);
    });
    if (!done) throw DOCUMENT_NOT_FOUND();
    this.logger.info({ event: 'player.photo.removed', documentId }, 'Photo retirée');
  }

  private async gallery(
    tx: TransactionClient,
    actor: Actor,
    ozId: string | null,
  ): Promise<Gallery | null> {
    const found: PlayerProfileRecord | null =
      ozId === null
        ? await playerProfileOfUser(tx, actor.userId)
        : await playerProfileByOzId(tx, ozId);
    if (found === null) return null;
    const { checkedAt, ...access } = found.access;
    const ability = abilityFor(actor);
    const subject = playerSubject(access, checkedAt);
    const view = playerViewFor(actor, ability, subject);
    if (view === null) return null;
    // Gérer la galerie suit la règle de la visibilité : titulaire majeur, tuteur vérifié d'un mineur.
    const manageable = ability.can('profile.set_visibility', subject);
    const owner = OWNERS.has(view.name);
    if (view.name === 'PlayerPublicView' && found.visibility.photos === false) {
      return { playerId: found.id, manageable, photos: [] };
    }
    const photos = await playerPhotos(tx, found.id);
    return {
      playerId: found.id,
      manageable,
      photos: owner ? photos : photos.filter((photo) => photo.status === 'clean'),
    };
  }

  private async limit(rule: RateLimitRule, actor: Actor): Promise<void> {
    const decision = await this.limiter.consume(rule, actor.userId);
    if (!decision.allowed) throw new RateLimitedException(decision.retryAfterSeconds);
  }
}
