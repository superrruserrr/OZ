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
  auditIntegritySchema,
  auditLogPageSchema,
  auditLogQuerySchema,
  type AuditIntegrityOutput,
  type AuditLogPageOutput,
  type AuditLogQueryOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { AuditLogService } from './audit-log.service.js';

const TOO_MANY = {
  type: ApiErrorDto,
  description: 'Plus de 600 consultations dans l’heure',
  headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
};

/** Journal d'audit (lot 1.16a, EX-118 n° 1) : administrateur vérifié seulement. */
@ApiTags('audit')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Réservé à l’administrateur' })
@Can('audit.read_log')
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly audit: AuditLogService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Consulter le journal d’audit',
    description:
      'Entrées de la plus récente à la plus ancienne, page par page. Repasser `nextCursor` en `cursor` pour la page suivante.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'actorUserId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'from', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiQuery({ name: 'to', required: false, schema: { type: 'string', format: 'date-time' } })
  @ApiOkResponse({
    description: 'Une page du journal',
    schema: openApiBodySchema(auditLogPageSchema),
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Filtre ou curseur invalide' })
  @ApiTooManyRequestsResponse(TOO_MANY)
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQueryOutput,
  ): Promise<AuditLogPageOutput> {
    return this.audit.list(actor, query);
  }

  @Get('integrity')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'État de la dernière vérification de la chaîne',
    description:
      'Résultat de la dernière vérification par le worker, contre la dernière ancre externe ; `lastCheck` vaut `null` si la chaîne n’a jamais été vérifiée.',
  })
  @ApiOkResponse({
    description: 'Dernière vérification',
    schema: openApiBodySchema(auditIntegritySchema),
  })
  @ApiTooManyRequestsResponse(TOO_MANY)
  integrity(@CurrentActor() actor: Actor): Promise<AuditIntegrityOutput> {
    return this.audit.integrity(actor);
  }
}
