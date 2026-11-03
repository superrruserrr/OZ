import { Controller, Get, Header, Param, Patch } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
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
