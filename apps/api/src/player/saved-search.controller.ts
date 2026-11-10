import { Controller, Delete, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
  savedSearchCreateSchema,
  savedSearchListSchema,
  savedSearchOutputSchema,
  savedSearchParamsSchema,
  type SavedSearchCreateOutput,
  type SavedSearchListOutput,
  type SavedSearchOutput,
  type SavedSearchParamsInput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { SavedSearchService } from './saved-search.service.js';

const tooMany = {
  type: ApiErrorDto,
  description: 'Plus de 60 créations ou suppressions dans l’heure',
  headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
};

/** Recherches sauvegardées (lot 1.14b, EX-116 n° 3) : `@Can` au niveau du type, la portée au service. */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({
  type: ApiErrorDto,
  description: 'Aucune recherche permise, ou critère réservé à une recherche complète',
})
@Controller('players/saved-searches')
export class SavedSearchController {
  constructor(private readonly searches: SavedSearchService) {}

  @Get()
  @Can('player.search')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Lister ses recherches sauvegardées',
    description:
      'Les recherches du compte, les plus récentes d’abord : critères et tri seuls, jamais un résultat. À rejouer par `GET /players`, qui revérifie la portée.',
  })
  @ApiOkResponse({ description: 'Au plus 20', schema: openApiBodySchema(savedSearchListSchema) })
  list(@CurrentActor() actor: Actor): Promise<SavedSearchListOutput> {
    return this.searches.list(actor);
  }

  @Post()
  @Can('player.search')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Sauvegarder une recherche',
    description:
      'Nom (1 à 60 caractères), critères et tri de `GET /players`, sans pagination. Une académie ne sauvegarde pas un critère qu’elle ne peut employer. 20 au plus par compte.',
  })
  @ApiBody({ schema: openApiBodySchema(savedSearchCreateSchema) })
  @ApiCreatedResponse({
    description: 'Recherche sauvegardée',
    schema: openApiBodySchema(savedSearchOutputSchema),
  })
  @ApiConflictResponse({ type: ApiErrorDto, description: 'Déjà 20 (`SAVED_SEARCH_LIMIT`)' })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Corps invalide' })
  @ApiTooManyRequestsResponse(tooMany)
  create(
    @CurrentActor() actor: Actor,
    @ValidatedBody(savedSearchCreateSchema) input: SavedSearchCreateOutput,
  ): Promise<SavedSearchOutput> {
    return this.searches.create(actor, input);
  }

  @Delete(':id')
  @Can('player.search')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer une recherche sauvegardée' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Supprimée' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Inconnue ou d’un autre compte' })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Identifiant invalide' })
  @ApiTooManyRequestsResponse(tooMany)
  remove(
    @CurrentActor() actor: Actor,
    @Param(new ZodValidationPipe(savedSearchParamsSchema)) params: SavedSearchParamsInput,
  ): Promise<void> {
    return this.searches.remove(actor, params.id);
  }
}
