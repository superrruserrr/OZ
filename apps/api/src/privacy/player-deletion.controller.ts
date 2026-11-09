import { Controller, Delete, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
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
  accountDeletionOutputSchema,
  accountDeletionRequestInputSchema,
  accountDeletionStatusOutputSchema,
  type AccountDeletionOutput,
  type AccountDeletionRequestInput,
  type AccountDeletionStatusOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { PlayerDeletionService } from './player-deletion.service.js';

const NOT_FOUND = 'Joueur inconnu ou hors de vos droits';
const tooMany = {
  type: ApiErrorDto,
  description: 'Plus de 10 demandes ou annulations dans l’heure, ou délai du mot de passe',
  headers: {
    'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
  },
};

/**
 * Suppression de la fiche d'un enfant mineur par son tuteur vérifié (lot 1.16cbb, EX-118 n° 3).
 * `@Can` décide au niveau du type ; le service décide sur la fiche et répond 404 sans droit.
 */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Pas tuteur, ou mot de passe incorrect' })
@ApiNotFoundResponse({ type: ApiErrorDto, description: NOT_FOUND })
@ApiParam({ name: 'ozId', example: 'OZ-CM-26-7K4M9Q-M' })
@Controller('players/:ozId/deletion')
export class PlayerDeletionController {
  constructor(private readonly deletions: PlayerDeletionService) {}

  @Post()
  @Can('profile.delete')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Demander la suppression de la fiche de son enfant',
    description:
      'Tuteur vérifié d’un mineur. Ré-authentification par mot de passe, plus le code TOTP ou de secours si la validation en deux étapes est active. La fiche est masquée aux tiers puis anonymisée 30 jours plus tard, avec le compte de l’enfant s’il en a un, sauf annulation par le tuteur. Emails au tuteur et à l’enfant.',
  })
  @ApiBody({ schema: openApiBodySchema(accountDeletionRequestInputSchema) })
  @ApiAcceptedResponse({
    description: 'Suppression programmée',
    schema: openApiBodySchema(accountDeletionOutputSchema),
  })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Suppression déjà programmée (`ACCOUNT_DELETION_PENDING`)',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Corps invalide' })
  @ApiTooManyRequestsResponse(tooMany)
  request(
    @CurrentActor() actor: Actor,
    @Param('ozId') ozId: string,
    @ValidatedBody(accountDeletionRequestInputSchema) input: AccountDeletionRequestInput,
  ): Promise<AccountDeletionOutput> {
    return this.deletions.request(actor, ozId, input);
  }

  @Get()
  @Can('profile.delete')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Suivre la suppression programmée de la fiche de son enfant' })
  @ApiOkResponse({
    description: 'Demande en attente, `pending: null` si aucune',
    schema: openApiBodySchema(accountDeletionStatusOutputSchema),
  })
  status(
    @CurrentActor() actor: Actor,
    @Param('ozId') ozId: string,
  ): Promise<AccountDeletionStatusOutput> {
    return this.deletions.status(actor, ozId);
  }

  @Delete()
  @Can('profile.delete')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Annuler la suppression programmée de la fiche de son enfant',
    description: 'Le tuteur seul, jusqu’à l’exécution. Emails au tuteur et à l’enfant.',
  })
  @ApiNoContentResponse({ description: 'Suppression annulée' })
  @ApiTooManyRequestsResponse(tooMany)
  cancel(@CurrentActor() actor: Actor, @Param('ozId') ozId: string): Promise<void> {
    return this.deletions.cancel(actor, ozId);
  }
}
