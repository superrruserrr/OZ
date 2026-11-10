import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import {
  PLAYER_SEARCH_SORTS,
  playerSearchPageSchema,
  playerSearchQuerySchema,
  type PlayerSearchPageOutput,
  type PlayerSearchQueryOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { PlayerSearchService } from './player-search.service.js';

const text = { required: false, type: String } as const;
const integer = { required: false, type: Number } as const;

/** Recherche de joueurs (lot 1.14a, EX-116) : `@Can` au niveau du type, la portée au service. */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@Controller('players')
export class PlayerSearchController {
  constructor(private readonly players: PlayerSearchService) {}

  @Get()
  @Can('player.search')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Rechercher des joueurs',
    description:
      'Joueurs visibles du lecteur, chacun dans la vue de sa fiche, sans téléphone. Une académie ne filtre ni sur la taille, le poids, le pied fort, ni sur une autre organisation que la sienne. Un filtre sur un bloc masqué par le joueur l’exclut. L’âge se compte par année de naissance. Un mineur listé à un lecteur journalisé est inscrit au journal d’audit, visible du tuteur.',
  })
  @ApiQuery({ name: 'country', ...text, description: 'Pays (ISO 3166-1 alpha-2)' })
  @ApiQuery({ name: 'region', ...text })
  @ApiQuery({ name: 'city', ...text })
  @ApiQuery({ name: 'ageMin', ...integer })
  @ApiQuery({ name: 'ageMax', ...integer })
  @ApiQuery({ name: 'position', ...text, description: 'Poste principal ou secondaire' })
  @ApiQuery({ name: 'foot', ...text })
  @ApiQuery({ name: 'heightMin', ...integer })
  @ApiQuery({ name: 'heightMax', ...integer })
  @ApiQuery({ name: 'weightMin', ...integer })
  @ApiQuery({ name: 'weightMax', ...integer })
  @ApiQuery({ name: 'verificationLevel', ...integer, description: 'Niveau de badge minimal' })
  @ApiQuery({ name: 'organizationId', ...text })
  @ApiQuery({ name: 'q', ...text, description: 'Prénom ou nom' })
  @ApiQuery({ name: 'sort', required: false, enum: [...PLAYER_SEARCH_SORTS] })
  @ApiQuery({ name: 'order', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'limit', ...integer })
  @ApiQuery({ name: 'cursor', ...text })
  @ApiOkResponse({
    description: 'Une page de joueurs',
    schema: openApiBodySchema(playerSearchPageSchema),
  })
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description: 'Aucune recherche permise, ou critère réservé à une recherche complète',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Critère ou curseur invalide' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 120 recherches dans l’heure',
    headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
  })
  search(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(playerSearchQuerySchema)) query: PlayerSearchQueryOutput,
  ): Promise<PlayerSearchPageOutput> {
    return this.players.search(actor, query);
  }
}
