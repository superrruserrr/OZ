import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccessTokenSubject } from '@oz/auth';
import {
  recoveryCodesOutputSchema,
  twoFactorDisableSchema,
  twoFactorEnableSchema,
  twoFactorRecoveryCodesSchema,
  twoFactorSetupOutputSchema,
  type RecoveryCodesOutput,
  type TwoFactorDisableInput,
  type TwoFactorEnableInput,
  type TwoFactorRecoveryCodesInput,
  type TwoFactorSetupOutput,
} from '@oz/contracts';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { Authenticated } from '../authorization/decorators.js';
import { CurrentUser } from './current-user.decorator.js';
import { TwoFactorEnrollment } from './two-factor-exempt.decorator.js';
import { TwoFactorService } from './two-factor.service.js';

const NOT_PENDING = 'Aucun enrôlement en cours, ou validation en deux étapes inactive';
const REJECTED = 'Mot de passe ou code incorrect, ou 2FA obligatoire pour ce compte';
const recoveryCodes = { schema: openApiBodySchema(recoveryCodesOutputSchema) };

/**
 * 2FA TOTP de l'utilisateur (lot 1.3cb, EX-103 n° 7). Authentifiée par le seul jeton d'accès
 * (en-tête) ; les quotas par compte sont comptés par le service, qui connaît le titulaire.
 */
@ApiTags('auth')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: REJECTED })
@Authenticated()
@Controller('auth/2fa')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Post('setup')
  @HttpCode(200)
  @TwoFactorEnrollment()
  @RateLimit([{ rule: 'totp_setup_ip', by: 'ip' }])
  @ApiOperation({
    summary: 'Commencer l’enrôlement',
    description:
      'Crée un secret en attente, sans toucher à un secret actif. À montrer une fois : la réponse n’est jamais mise en cache.',
  })
  @ApiOkResponse({
    description: 'Secret, URI et QR',
    schema: openApiBodySchema(twoFactorSetupOutputSchema),
  })
  setup(@CurrentUser() user: AccessTokenSubject): Promise<TwoFactorSetupOutput> {
    return this.twoFactor.setup(user.userId);
  }

  @Post('enable')
  @HttpCode(200)
  @TwoFactorEnrollment()
  @RateLimit([{ rule: 'totp_setup_ip', by: 'ip' }])
  @ApiOperation({
    summary: 'Activer la 2FA',
    description:
      'Active le secret en attente avec un premier code ; révoque les autres sessions et rend dix codes de secours, montrés cette seule fois. Si une 2FA est déjà active (changement d’appareil), `currentCode` est exigé.',
  })
  @ApiBody({ schema: openApiBodySchema(twoFactorEnableSchema) })
  @ApiOkResponse({ description: 'Codes de secours', ...recoveryCodes })
  @ApiConflictResponse({ type: ApiErrorDto, description: NOT_PENDING })
  enable(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(twoFactorEnableSchema) input: TwoFactorEnableInput,
  ): Promise<RecoveryCodesOutput> {
    return this.twoFactor.enable(user.userId, user.familyId, input);
  }

  @Post('disable')
  @HttpCode(204)
  @RateLimit([{ rule: 'totp_setup_ip', by: 'ip' }])
  @ApiOperation({
    summary: 'Désactiver la 2FA',
    description: 'Exige le mot de passe et un code ; révoque les autres sessions.',
  })
  @ApiBody({ schema: openApiBodySchema(twoFactorDisableSchema) })
  @ApiNoContentResponse({ description: '2FA désactivée' })
  @ApiConflictResponse({ type: ApiErrorDto, description: NOT_PENDING })
  async disable(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(twoFactorDisableSchema) input: TwoFactorDisableInput,
  ): Promise<void> {
    await this.twoFactor.disable(user.userId, user.familyId, input);
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @RateLimit([{ rule: 'totp_setup_ip', by: 'ip' }])
  @ApiOperation({
    summary: 'Régénérer les codes de secours',
    description: 'L’ancien lot cesse de valoir.',
  })
  @ApiBody({ schema: openApiBodySchema(twoFactorRecoveryCodesSchema) })
  @ApiOkResponse({ description: 'Nouveaux codes de secours', ...recoveryCodes })
  @ApiConflictResponse({ type: ApiErrorDto, description: NOT_PENDING })
  regenerate(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(twoFactorRecoveryCodesSchema) input: TwoFactorRecoveryCodesInput,
  ): Promise<RecoveryCodesOutput> {
    return this.twoFactor.regenerateRecoveryCodes(user.userId, input.code);
  }
}
