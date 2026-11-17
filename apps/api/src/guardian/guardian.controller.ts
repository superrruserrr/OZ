import { Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AccessTokenSubject } from '@oz/auth';
import {
  guardianChildrenOutputSchema,
  guardianInvitationAcceptOutputSchema,
  guardianInvitationOutputSchema,
  guardianInvitationPreviewOutputSchema,
  guardianInvitationTokenSchema,
  type GuardianChildrenOutput,
  type GuardianInvitationAcceptOutput,
  type GuardianInvitationOutput,
  type GuardianInvitationPreviewOutput,
  type GuardianInvitationTokenInput,
} from '@oz/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Authenticated, Public } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { GuardianService } from './guardian.service.js';

const retryAfter = {
  'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } },
} as const;
const unauthorized = { type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' };
const invalid = { type: ApiErrorDto, description: 'Invitation inconnue, expirée ou déjà utilisée' };

/**
 * Tuteur légal (lot 1.7ba, EX-108). Le rattachement passe toujours par une invitation émise depuis
 * le compte de l'enfant (D4) ; l'accepter ne vérifie ni ne publie rien (D3).
 */
@ApiTags('guardians')
@Controller()
export class GuardianController {
  constructor(private readonly guardians: GuardianService) {}

  @Post('players/me/guardian/invitation')
  @HttpCode(202)
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Inviter son tuteur légal (joueur mineur)',
    description:
      'Émet une invitation pour le tuteur déclaré à l’inscription ; la précédente est annulée. Avec une adresse email, OZ envoie le lien au tuteur. Sans adresse, le lien est rendu ici, une seule fois, pour que le joueur le transmette lui-même. Valable 7 jours.',
  })
  @ApiAcceptedResponse({ schema: openApiBodySchema(guardianInvitationOutputSchema) })
  @ApiUnauthorizedResponse(unauthorized)
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Compte inutilisable' })
  @ApiConflictResponse({
    type: ApiErrorDto,
    description: 'Joueur majeur, sans tuteur déclaré, ou tuteur déjà rattaché',
  })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 3 invitations dans l’heure',
    headers: retryAfter,
  })
  invite(@CurrentUser() user: AccessTokenSubject): Promise<GuardianInvitationOutput> {
    return this.guardians.invite(user.userId);
  }

  @Post('guardians/invitations/read')
  @HttpCode(200)
  @Public()
  @RateLimit([{ rule: 'guardian_invitation_ip', by: 'ip' }])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Aperçu d’une invitation de tuteur',
    description:
      'Sans session : rend le prénom de l’enfant et le lien déclaré, rien d’autre. Le jeton voyage dans le corps, jamais dans l’adresse.',
  })
  @ApiBody({ schema: openApiBodySchema(guardianInvitationTokenSchema) })
  @ApiOkResponse({ schema: openApiBodySchema(guardianInvitationPreviewOutputSchema) })
  @ApiBadRequestResponse(invalid)
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Jeton mal formé' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 10 essais dans l’heure',
    headers: retryAfter,
  })
  preview(
    @ValidatedBody(guardianInvitationTokenSchema) input: GuardianInvitationTokenInput,
  ): Promise<GuardianInvitationPreviewOutput> {
    return this.guardians.preview(input.token);
  }

  @Post('guardians/invitations/accept')
  @HttpCode(200)
  @Authenticated()
  @RateLimit([{ rule: 'guardian_invitation_ip', by: 'ip' }])
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Accepter une invitation de tuteur',
    description:
      'Le compte connecté (email vérifié, pas un joueur mineur) devient le tuteur en attente de l’enfant. Aucun rôle ni droit sur la fiche n’est accordé avant la vérification du lien ; la fiche reste non publiée.',
  })
  @ApiBody({ schema: openApiBodySchema(guardianInvitationTokenSchema) })
  @ApiOkResponse({ schema: openApiBodySchema(guardianInvitationAcceptOutputSchema) })
  @ApiBadRequestResponse(invalid)
  @ApiUnauthorizedResponse(unauthorized)
  @ApiForbiddenResponse({
    type: ApiErrorDto,
    description:
      'L’enfant lui-même, ou compte qui ne peut pas devenir tuteur (non vérifié, joueur mineur)',
  })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Jeton mal formé' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Plus de 10 essais dans l’heure',
    headers: retryAfter,
  })
  accept(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(guardianInvitationTokenSchema) input: GuardianInvitationTokenInput,
  ): Promise<GuardianInvitationAcceptOutput> {
    return this.guardians.accept(user.userId, input.token);
  }

  @Get('guardians/me/children')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lister ses enfants (tuteur, en attente ou vérifié)',
    description:
      'Enfants mineurs dont le compte est le tuteur, en attente de vérification ou vérifié : prénom, statut et publication ; le nom et l’OZ ID seulement pour un tuteur vérifié. Un compte sans enfant reçoit une liste vide ; un enfant devenu majeur n’y figure plus.',
  })
  @ApiOkResponse({ schema: openApiBodySchema(guardianChildrenOutputSchema) })
  @ApiUnauthorizedResponse(unauthorized)
  children(@CurrentUser() user: AccessTokenSubject): Promise<GuardianChildrenOutput> {
    return this.guardians.children(user.userId);
  }
}
