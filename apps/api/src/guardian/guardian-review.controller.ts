import { Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Actor } from '@oz/auth';
import {
  guardianLinkDecisionOutputSchema,
  guardianLinkDecisionSchema,
  guardianLinkQueueOutputSchema,
  guardianLinkQueueQuerySchema,
  guardianLinkReviewParamsSchema,
  guardianLinkRevocationOutputSchema,
  guardianLinkRevocationSchema,
  type GuardianLinkDecisionInput,
  type GuardianLinkDecisionOutput,
  type GuardianLinkQueueOutput,
  type GuardianLinkQueueQueryOutput,
  type GuardianLinkReviewParamsInput,
  type GuardianLinkRevocationInput,
  type GuardianLinkRevocationOutput,
} from '@oz/contracts';
import { CurrentActor } from '../authorization/actor.decorator.js';
import { Can } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { GuardianService } from './guardian.service.js';

/**
 * Revue du justificatif de lien (lot 1.7bb, R1, R2, R4) : administrateur vérifié, action
 * `kyc.decide` de la matrice. La base revérifie le rôle et refuse un décideur concerné.
 */
@ApiTags('guardians')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Réservé à l’administrateur' })
@Can('kyc.decide')
@Controller('admin/guardian-links')
export class GuardianReviewController {
  constructor(private readonly guardians: GuardianService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'File des justificatifs de lien à revoir',
    description:
      'Du plus ancien au plus récent. Les pièces se lisent par `GET /documents/:id/url` (URL signée de 5 minutes, auditée).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiOkResponse({ schema: openApiBodySchema(guardianLinkQueueOutputSchema) })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Limite invalide' })
  queue(
    @CurrentActor() actor: Actor,
    @Query(new ZodValidationPipe(guardianLinkQueueQuerySchema)) query: GuardianLinkQueueQueryOutput,
  ): Promise<GuardianLinkQueueOutput> {
    return this.guardians.linkQueue(actor, query.limit);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Approuver ou refuser un justificatif de lien',
    description:
      'Ré-authentification par mot de passe et code. Approuver pose le compte sur la fiche tuteur et accorde le rôle tuteur ; la fiche passe `in_review` (vérifiée au KYC 2 seulement). Refuser exige un motif ; au 3e refus, ou sur faux suspecté, le rattachement est clos. Avis par email au déposant.',
  })
  @ApiBody({ schema: openApiBodySchema(guardianLinkDecisionSchema) })
  @ApiOkResponse({ schema: openApiBodySchema(guardianLinkDecisionOutputSchema) })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Dépôt inconnu ou déjà décidé' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Rattachement tombé entre-temps : dépôt retiré',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Corps invalide' })
  decide(
    @CurrentActor() actor: Actor,
    @Param(new ZodValidationPipe(guardianLinkReviewParamsSchema))
    params: GuardianLinkReviewParamsInput,
    @ValidatedBody(guardianLinkDecisionSchema) input: GuardianLinkDecisionInput,
  ): Promise<GuardianLinkDecisionOutput> {
    return this.guardians.decideLink(actor, params.id, input);
  }

  @Post(':id/revocation')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Retirer un lien de tuteur approuvé par erreur (C6)',
    description:
      'Ré-authentification par mot de passe et code ; motif d’une liste fermée, journalisé. Le compte est retiré de la fiche tuteur (`declared`), les accords donnés pour l’enfant sont révoqués (dépublication immédiate), l’invitation est annulée (l’enfant peut réinviter) et le rôle tuteur retiré s’il ne sert plus. Avis par email au tuteur, sans motif.',
  })
  @ApiBody({ schema: openApiBodySchema(guardianLinkRevocationSchema) })
  @ApiOkResponse({ schema: openApiBodySchema(guardianLinkRevocationOutputSchema) })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Dépôt inconnu' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Dépôt non approuvé, ou lien déjà retiré ou tombé',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Corps invalide' })
  revoke(
    @CurrentActor() actor: Actor,
    @Param(new ZodValidationPipe(guardianLinkReviewParamsSchema))
    params: GuardianLinkReviewParamsInput,
    @ValidatedBody(guardianLinkRevocationSchema) input: GuardianLinkRevocationInput,
  ): Promise<GuardianLinkRevocationOutput> {
    return this.guardians.revokeLink(actor, params.id, input);
  }
}
