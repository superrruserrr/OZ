import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AccessTokenSubject } from '@oz/auth';
import {
  phoneStartOutputSchema,
  phoneStartSchema,
  phoneVerifySchema,
  type PhoneStartInput,
  type PhoneStartOutput,
  type PhoneVerifyInput,
} from '@oz/contracts';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { RateLimit } from '../common/rate-limit/rate-limit.decorator.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { CurrentUser } from './current-user.decorator.js';
import { PhoneService } from './phone.service.js';

/**
 * Vérification du téléphone (lot 1.3cc, EX-111 n° 2). Authentifiée par le jeton d'accès, sans
 * exemption : un compte à 2FA obligatoire s'enrôle d'abord. Les quotas par compte et par numéro sont
 * comptés par le service.
 */
@ApiTags('auth')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Enrôlement 2FA obligatoire' })
@UseGuards(AccessTokenGuard)
@Controller('auth/phone')
export class PhoneController {
  constructor(private readonly phone: PhoneService) {}

  @Post('start')
  @HttpCode(202)
  @RateLimit([{ rule: 'otp_start_ip', by: 'ip' }])
  @ApiOperation({
    summary: 'Envoyer un code',
    description:
      'Envoie un code à 6 chiffres par WhatsApp, puis SMS en repli ; `channel: "sms"` saute WhatsApp. L’envoi a lieu après la réponse : son sort n’y paraît pas.',
  })
  @ApiBody({ schema: openApiBodySchema(phoneStartSchema) })
  @ApiAcceptedResponse({
    description: 'Code en route',
    schema: openApiBodySchema(phoneStartOutputSchema),
  })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description: 'Indicatif non pris en charge',
  })
  start(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(phoneStartSchema) input: PhoneStartInput,
  ): Promise<PhoneStartOutput> {
    return this.phone.start(user.userId, input);
  }

  @Post('verify')
  @HttpCode(204)
  @RateLimit([{ rule: 'otp_verify_ip', by: 'ip' }])
  @ApiOperation({
    summary: 'Prouver le numéro',
    description: 'Un code juste écrit le numéro et sa date de vérification.',
  })
  @ApiBody({ schema: openApiBodySchema(phoneVerifySchema) })
  @ApiNoContentResponse({ description: 'Numéro vérifié' })
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Code incorrect ou expiré' })
  async verify(
    @CurrentUser() user: AccessTokenSubject,
    @ValidatedBody(phoneVerifySchema) input: PhoneVerifyInput,
  ): Promise<void> {
    await this.phone.verify(user.userId, input.code);
  }
}
