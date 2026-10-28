import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import {
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type RegisterInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@oz/contracts';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { AuthService } from './auth.service.js';

const status = (value: string) => ({
  schema: { type: 'object', properties: { status: { type: 'string', enum: [value] } } },
});

/**
 * Comptes (lot 1.3a). Routes publiques par nature (personne n'est connecté), montées seulement si
 * FEATURE_AUTH=true. Réponses identiques que le compte existe ou non (EX-103 n° 10).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(202)
  @ApiOperation({ summary: 'Créer un compte (email de confirmation envoyé)' })
  @ApiBody({ schema: openApiBodySchema(registerSchema) })
  @ApiAcceptedResponse({ description: 'Demande prise en compte', ...status('accepted') })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description: 'Données invalides ou mot de passe compromis',
  })
  async register(
    @ValidatedBody(registerSchema) input: RegisterInput,
  ): Promise<{ status: 'accepted' }> {
    await this.auth.register(input);
    return { status: 'accepted' };
  }

  @Post('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: "Confirmer l'adresse email (jeton reçu par email)" })
  @ApiBody({ schema: openApiBodySchema(verifyEmailSchema) })
  @ApiOkResponse({ description: 'Adresse confirmée', ...status('verified') })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Lien invalide ou expiré' })
  async verifyEmail(
    @ValidatedBody(verifyEmailSchema) input: VerifyEmailInput,
  ): Promise<{ status: 'verified' }> {
    await this.auth.verifyEmail(input);
    return { status: 'verified' };
  }

  @Post('password/forgot')
  @HttpCode(202)
  @ApiOperation({ summary: 'Demander un lien de réinitialisation' })
  @ApiBody({ schema: openApiBodySchema(requestPasswordResetSchema) })
  @ApiAcceptedResponse({ description: 'Demande prise en compte', ...status('accepted') })
  async forgotPassword(
    @ValidatedBody(requestPasswordResetSchema) input: RequestPasswordResetInput,
  ): Promise<{ status: 'accepted' }> {
    await this.auth.requestPasswordReset(input);
    return { status: 'accepted' };
  }

  @Post('password/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Choisir un nouveau mot de passe (jeton reçu par email)' })
  @ApiBody({ schema: openApiBodySchema(resetPasswordSchema) })
  @ApiOkResponse({ description: 'Mot de passe modifié, sessions fermées', ...status('reset') })
  @ApiBadRequestResponse({ type: ApiErrorDto, description: 'Lien invalide ou expiré' })
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description: 'Données invalides ou mot de passe compromis',
  })
  async resetPassword(
    @ValidatedBody(resetPasswordSchema) input: ResetPasswordInput,
  ): Promise<{ status: 'reset' }> {
    await this.auth.resetPassword(input);
    return { status: 'reset' };
  }
}
