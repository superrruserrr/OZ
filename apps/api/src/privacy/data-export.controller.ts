import { Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
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
  dataExportDownloadOutputSchema,
  dataExportOutputSchema,
  dataExportRequestInputSchema,
  dataExportStatusOutputSchema,
  type DataExportDownloadOutput,
  type DataExportOutput,
  type DataExportRequestInput,
  type DataExportStatusOutput,
} from '@oz/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { TwoFactorEnrollment } from '../auth/two-factor-exempt.decorator.js';
import { Authenticated } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { DataExportService } from './data-export.service.js';

const output = { schema: openApiBodySchema(dataExportOutputSchema) };
const retryAfter = {
  'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
} as const;

/**
 * Export des données personnelles du compte (lot 1.16ba, EX-118 n° 2). Toute personne exporte ses
 * propres données, rôle ou non : la route est `authenticated`, le titulaire vient de la session.
 */
@ApiTags('privacy')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@Authenticated()
// Droit d'accès RGPD ouvert à une session restreinte (2FA obligatoire non activée, lot 1.16cba) :
// la demande exige toujours le mot de passe ; le téléchargement suit (risque accepté, auth.md).
@TwoFactorEnrollment()
@Controller('account/data-export')
export class DataExportController {
  constructor(private readonly exports: DataExportService) {}

  @Post()
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Demander l’export de ses données',
    description:
      'Ré-authentification par mot de passe, plus le code TOTP ou de secours si la validation en deux étapes est active. Une demande à la fois, au plus une par 24 heures ; `GET` donne l’instant de la prochaine possible. Un email d’alerte part au titulaire.',
  })
  @ApiBody({ schema: openApiBodySchema(dataExportRequestInputSchema) })
  @ApiAcceptedResponse({ description: 'Demande enregistrée', ...output })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Mot de passe ou code incorrect' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description:
      'Export en cours ou prêt (`DATA_EXPORT_ACTIVE`), ou moins de 24 heures depuis la dernière demande (`DATA_EXPORT_TOO_SOON`)',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Corps invalide' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 10 demandes dans l’heure, ou délai du mot de passe',
    headers: retryAfter,
  })
  request(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(dataExportRequestInputSchema) input: DataExportRequestInput,
  ): Promise<DataExportOutput> {
    return this.exports.request(user.userId, input);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Suivre sa dernière demande d’export' })
  @ApiOkResponse({
    description: 'Dernière demande, `latest: null` si aucune',
    schema: openApiBodySchema(dataExportStatusOutputSchema),
  })
  latest(@CurrentUser() user: AccessTokenSubject): Promise<DataExportStatusOutput> {
    return this.exports.latest(user.userId);
  }

  @Get('download')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Télécharger son archive d’export',
    description:
      'URL signée de 5 minutes vers l’archive JSON prête et non échue (7 jours après « prête »). Chaque délivrance est journalisée.',
  })
  @ApiOkResponse({
    description: 'URL signée et échéance',
    schema: openApiBodySchema(dataExportDownloadOutputSchema),
  })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Aucune archive prête' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 30 délivrances dans l’heure',
    headers: retryAfter,
  })
  download(@CurrentUser() user: AccessTokenSubject): Promise<DataExportDownloadOutput> {
    return this.exports.download(user.userId);
  }
}
