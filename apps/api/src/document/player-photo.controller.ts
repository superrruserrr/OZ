import { Controller, Delete, Get, Header, HttpCode, Param, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import {
  documentReadOutputSchema,
  playerPhotosOutputSchema,
  playerProfilePhotoInputSchema,
  type DocumentReadOutput,
  type PlayerPhotosOutput,
  type PlayerProfilePhotoInput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { PlayerPhotoService } from './player-photo.service.js';

const NOT_FOUND = 'Joueur ou photo inconnus, ou hors de vos droits';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Identifiant mal formé : le même 404 qu'une photo inconnue, sans lecture. */
const photoId = (value: string): string => (UUID.test(value) ? value : '');
const retryAfter = {
  'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
} as const;

/**
 * Photos du joueur (lot 1.19cd). Dépôt par `POST /documents/upload` (type `photo`) ; ici la liste,
 * l'URL de lecture, la photo de profil et le retrait. Routes fixes (`me`) avant `:ozId`.
 */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
@ApiTooManyRequestsResponse({
  type: ApiErrorDto,
  description: 'Trop de requêtes',
  headers: retryAfter,
})
@Controller('players')
export class PlayerPhotoController {
  constructor(private readonly photos: PlayerPhotoService) {}

  @Get('me/photos')
  @Can('profile.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Lister ses photos',
    description: 'Toute la galerie du titulaire, analyses en cours et refus compris (six au plus).',
  })
  @ApiOkResponse({ schema: openApiBodySchema(playerPhotosOutputSchema) })
  listOwn(@CurrentActor() actor: Actor): Promise<PlayerPhotosOutput> {
    return this.photos.list(actor, null);
  }

  @Put('me/profile-photo')
  @Can('profile.update')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Choisir sa photo de profil',
    description:
      'Une photo saine de sa galerie, ou `null` pour revenir aux initiales. Titulaire majeur ; redécidé et audité par la base.',
  })
  @ApiBody({ schema: openApiBodySchema(playerProfilePhotoInputSchema) })
  @ApiOkResponse({ schema: openApiBodySchema(playerPhotosOutputSchema) })
  setProfile(
    @CurrentActor() actor: Actor,
    @ValidatedBody(playerProfilePhotoInputSchema) input: PlayerProfilePhotoInput,
  ): Promise<PlayerPhotosOutput> {
    return this.photos.setProfile(actor, input.documentId);
  }

  @Delete('me/photos/:photoId')
  @Can('profile.update')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Retirer une photo',
    description: 'Suppression logique, fichier purgé ensuite par le worker ; auditée.',
  })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Photo retirée' })
  async remove(@CurrentActor() actor: Actor, @Param('photoId') id: string): Promise<void> {
    await this.photos.remove(actor, photoId(id));
  }

  @Get('me/photos/:photoId/url')
  @Can('profile.read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'URL de lecture d’une de ses photos (5 minutes, auditée)' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOkResponse({ schema: openApiBodySchema(documentReadOutputSchema) })
  ownUrl(@CurrentActor() actor: Actor, @Param('photoId') id: string): Promise<DocumentReadOutput> {
    return this.photos.url(actor, null, photoId(id));
  }

  @Get(':ozId/photos')
  @Can('player.read_public')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Lister les photos d’un joueur',
    description:
      'Selon la vue du lecteur : un tiers ne voit que les photos saines, et aucune si le bloc `photos` est masqué.',
  })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiOkResponse({ schema: openApiBodySchema(playerPhotosOutputSchema) })
  list(@CurrentActor() actor: Actor, @Param('ozId') ozId: string): Promise<PlayerPhotosOutput> {
    return this.photos.list(actor, ozId);
  }

  @Get(':ozId/photos/:photoId/url')
  @Can('player.read_public')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'URL de lecture d’une photo d’un joueur (5 minutes, auditée)' })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiParam({ name: 'photoId', format: 'uuid' })
  @ApiOkResponse({ schema: openApiBodySchema(documentReadOutputSchema) })
  url(
    @CurrentActor() actor: Actor,
    @Param('ozId') ozId: string,
    @Param('photoId') id: string,
  ): Promise<DocumentReadOutput> {
    return this.photos.url(actor, ozId, photoId(id));
  }
}
