import { Controller, Get, Header, Param, Patch, StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import {
  playerProfileOutputSchema,
  playerVisibilityInputSchema,
  playerVisibilityOutputSchema,
  type PlayerProfileOutput,
  type PlayerVisibilityInput,
  type PlayerVisibilityOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { PlayerProfileService } from './player-profile.service.js';

const NOT_FOUND = 'Joueur inconnu ou hors de vos droits';
const DOCUMENTS_LIMIT = 'Plus de 20 QR, cartes ou exports dans l’heure';
/** PDF en pièce jointe, nom de fichier sans OZ ID ni nom. */
const pdf = (body: Buffer, filename: string): StreamableFile =>
  new StreamableFile(body, {
    type: 'application/pdf',
    disposition: `attachment; filename="${filename}"`,
  });
const retryAfter = {
  'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
} as const;

/**
 * Fiche joueur (lot 1.13a, EX-115). `@Can` décide au niveau du type ; le service décide ensuite sur
 * le joueur et répond 404 sans droit. OZ ID non validé ici : mal formé, il reçoit le même 404.
 */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@Controller('players')
export class PlayerProfileController {
  constructor(private readonly players: PlayerProfileService) {}

  @Get(':ozId')
  @Can('player.read_public')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Lire une fiche joueur',
    description:
      'Fiche sérialisée selon la vue du lecteur : titulaire, tuteur, organisation de rattachement, administrateur ou tiers. Un tiers ne voit ni la date de naissance complète, ni le téléphone, ni les blocs masqués. Une lecture par un administrateur est inscrite au journal d’audit.',
  })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiOkResponse({
    description: 'Fiche du joueur',
    schema: openApiBodySchema(playerProfileOutputSchema),
  })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'Aucun rôle ne permet de lire une fiche',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 300 lectures dans l’heure',
    headers: retryAfter,
  })
  read(@CurrentActor() actor: Actor, @Param('ozId') ozId: string): Promise<PlayerProfileOutput> {
    return this.players.read(actor, ozId);
  }

  @Get(':ozId/qr.svg')
  @Can('player.read_public')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'image/svg+xml')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  @ApiOperation({
    summary: 'QR du profil (SVG)',
    description:
      'QR vers la page du profil (`/joueur/<OZ ID>`), délivré à qui peut lire la fiche. Aucune donnée personnelle dans l’URL.',
  })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiProduces('image/svg+xml')
  @ApiOkResponse({ description: 'SVG autonome, sans script ni lien' })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'Aucun rôle ne permet de lire une fiche',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: DOCUMENTS_LIMIT,
    headers: retryAfter,
  })
  async qr(@CurrentActor() actor: Actor, @Param('ozId') ozId: string): Promise<StreamableFile> {
    const svg = await this.players.qr(actor, ozId);
    return new StreamableFile(Buffer.from(svg, 'utf8'), { type: 'image/svg+xml' });
  }

  @Get(':ozId/card.pdf')
  @Can('profile.card')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Carte OZ ID (PDF, format carte bancaire)',
    description:
      'Réservée au titulaire majeur et au tuteur vérifié d’un mineur : OZ ID, nom, badge à la date d’édition, QR du profil. Le statut en ligne fait foi. Chaque édition est inscrite au journal d’audit.',
  })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Carte en pièce jointe' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Ni joueur ni tuteur' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: DOCUMENTS_LIMIT,
    headers: retryAfter,
  })
  async card(@CurrentActor() actor: Actor, @Param('ozId') ozId: string): Promise<StreamableFile> {
    return pdf(await this.players.card(actor, ozId), 'carte-oz-id.pdf');
  }

  @Get(':ozId/profile.pdf')
  @Can('player.read_public')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exporter la fiche en PDF filigrané',
    description:
      'La vue du lecteur, champ pour champ, filigranée à son nom (email masqué), son rôle et l’instant, sur chaque page. Chaque export est inscrit au journal d’audit.',
  })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Fiche en pièce jointe' })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'Aucun rôle ne permet de lire une fiche',
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: DOCUMENTS_LIMIT,
    headers: retryAfter,
  })
  async exportPdf(
    @CurrentActor() actor: Actor,
    @Param('ozId') ozId: string,
  ): Promise<StreamableFile> {
    return pdf(await this.players.exportPdf(actor, ozId), 'fiche-joueur-oz.pdf');
  }

  @Patch(':ozId/visibility')
  @Can('profile.set_visibility')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Régler les blocs visibles des tiers',
    description:
      'Réservé au titulaire majeur et au tuteur vérifié d’un mineur. `false` masque le bloc aux tiers ; les blocs absents gardent leur réglage. Chaque réglage est inscrit au journal d’audit.',
  })
  @ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
  @ApiBody({ schema: openApiBodySchema(playerVisibilityInputSchema) })
  @ApiOkResponse({
    description: 'Réglage complet après mise à jour',
    schema: openApiBodySchema(playerVisibilityOutputSchema),
  })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Ni joueur ni tuteur' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Blocs inconnus ou absents' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 30 réglages dans l’heure',
    headers: retryAfter,
  })
  setVisibility(
    @CurrentActor() actor: Actor,
    @Param('ozId') ozId: string,
    @ValidatedBody(playerVisibilityInputSchema) input: PlayerVisibilityInput,
  ): Promise<PlayerVisibilityOutput> {
    return this.players.setVisibility(actor, ozId, input);
  }
}
