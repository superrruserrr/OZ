import { Controller, Delete, Get, Header, HttpCode, Post } from '@nestjs/common';
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
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AccessTokenSubject } from '@oz/auth';
import {
  accountDeletionOutputSchema,
  accountDeletionRequestInputSchema,
  accountDeletionStatusOutputSchema,
  type AccountDeletionOutput,
  type AccountDeletionRequestInput,
  type AccountDeletionStatusOutput,
} from '@oz/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Authenticated } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { AccountDeletionService } from './account-deletion.service.js';

const retryAfter = {
  'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
} as const;
const tooMany = {
  type: ApiErrorDto,
  description: 'Plus de 10 demandes ou annulations dans l’heure, ou délai du mot de passe',
  headers: retryAfter,
};

/**
 * Suppression du compte (lot 1.16ca, EX-118 n° 3). Toute personne supprime son propre compte, rôle
 * ou non : les routes sont `authenticated`, le titulaire vient de la session.
 */
@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@Authenticated()
@Controller('account/deletion')
export class AccountDeletionController {
  constructor(private readonly deletions: AccountDeletionService) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Demander la suppression de son compte',
    description:
      'Ré-authentification par mot de passe, plus le code TOTP ou de secours si la validation en deux étapes est active. Toutes les sessions sont fermées ; les données sont anonymisées 30 jours plus tard, sauf annulation après reconnexion. Un email part au titulaire.',
  })
  @ApiBody({ schema: openApiBodySchema(accountDeletionRequestInputSchema) })
  @ApiAcceptedResponse({
    description: 'Suppression programmée',
    schema: openApiBodySchema(accountDeletionOutputSchema),
  })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Mot de passe ou code incorrect' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Suppression déjà programmée (`ACCOUNT_DELETION_PENDING`)',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Corps invalide' })
  @ApiTooManyRequestsResponse(tooMany)
  request(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(accountDeletionRequestInputSchema) input: AccountDeletionRequestInput,
  ): Promise<AccountDeletionOutput> {
    return this.deletions.request(user.userId, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Suivre la suppression programmée de son compte' })
  @ApiOkResponse({
    description: 'Demande en attente, `pending: null` si aucune',
    schema: openApiBodySchema(accountDeletionStatusOutputSchema),
  })
  status(@CurrentUser() user: AccessTokenSubject): Promise<AccountDeletionStatusOutput> {
    return this.deletions.status(user.userId);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Annuler la suppression programmée de son compte',
    description: 'Possible jusqu’à l’échéance. Un email confirme l’annulation au titulaire.',
  })
  @ApiNoContentResponse({ description: 'Suppression annulée' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Aucune suppression programmée' })
  @ApiTooManyRequestsResponse(tooMany)
  cancel(@CurrentUser() user: AccessTokenSubject): Promise<void> {
    return this.deletions.cancel(user.userId);
  }
}
