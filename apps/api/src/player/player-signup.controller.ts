import { Body, Controller, Get, Header, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AccessTokenSubject } from '@oz/auth';
import {
  SIGNUP_STEPS,
  signupAffiliationSchema,
  signupCompleteOutputSchema,
  signupGuardianSchema,
  signupIdentitySchema,
  signupSportSchema,
  signupStatusOutputSchema,
  signupStepParamsSchema,
  type SignupCompleteOutput,
  type SignupStatusOutput,
  type SignupStepParams,
} from '@oz/contracts';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Authenticated } from '../authorization/decorators.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { PlayerSignupService } from './player-signup.service.js';

const STEP_SCHEMAS = {
  identity: signupIdentitySchema,
  sport: signupSportSchema,
  affiliation: signupAffiliationSchema,
  guardian: signupGuardianSchema,
} as const;

const tooMany = {
  type: ApiErrorDto,
  description: 'Plus de 120 enregistrements dans l’heure',
  headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
};
const completed = {
  type: ApiErrorDto,
  description: 'Le compte a déjà sa fiche (`SIGNUP_ALREADY_COMPLETED`)',
};

/**
 * Inscription joueur (lot 1.7a, EX-107) : routes `authenticated`, le titulaire venant de la session
 * (le compte n'a encore aucun rôle). Réponses jamais mises en cache : elles portent des données
 * personnelles.
 */
@ApiTags('players')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@Authenticated()
@Controller('players/signup')
export class PlayerSignupController {
  constructor(private readonly signup: PlayerSignupService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Relire son inscription en cours',
    description:
      'Étapes enregistrées, minorité calculée par le serveur et étapes manquantes : reprise après une interruption. Brouillon conservé 30 jours après la dernière saisie.',
  })
  @ApiOkResponse({ schema: openApiBodySchema(signupStatusOutputSchema) })
  @ApiConflictResponse(completed)
  read(@CurrentUser() user: AccessTokenSubject): Promise<SignupStatusOutput> {
    return this.signup.read(user.userId);
  }

  @Put(':step')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Enregistrer une étape',
    description: `Étapes : ${SIGNUP_STEPS.join(', ')}. Chaque étape remplace la précédente saisie du même nom ; contenu chiffré en base.`,
  })
  @ApiParam({ name: 'step', enum: SIGNUP_STEPS })
  @ApiBody({ schema: openApiBodySchema(signupIdentitySchema) })
  @ApiOkResponse({ schema: openApiBodySchema(signupStatusOutputSchema) })
  @ApiConflictResponse(completed)
  @ApiUnprocessableEntityResponse({ type: ApiErrorDto, description: 'Étape ou corps invalide' })
  @ApiTooManyRequestsResponse(tooMany)
  async save(
    @CurrentUser() user: AccessTokenSubject,
    @Param(new ZodValidationPipe(signupStepParamsSchema)) params: SignupStepParams,
    // Contrat choisi selon l'étape : validé ici (C2) avant tout appel au service.
    @Body() body: unknown,
  ): Promise<SignupStatusOutput> {
    const data: Record<string, unknown> = await new ZodValidationPipe(
      STEP_SCHEMAS[params.step],
    ).transform(body);
    return this.signup.save(user.userId, params.step, data);
  }

  @Post('complete')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Finaliser l’inscription et recevoir son OZ ID',
    description:
      'Crée la fiche (statut `declared`), le tuteur déclaré d’un mineur et le rôle joueur, puis émet l’OZ ID, en une transaction. Un mineur sans étape tuteur est refusé (`SIGNUP_GUARDIAN_REQUIRED`).',
  })
  @ApiOkResponse({ schema: openApiBodySchema(signupCompleteOutputSchema) })
  @ApiConflictResponse(completed)
  @ApiUnprocessableEntityResponse({
    type: ApiErrorDto,
    description:
      'Étapes manquantes (`SIGNUP_INCOMPLETE`, `SIGNUP_GUARDIAN_REQUIRED`), dans `details`',
  })
  @ApiTooManyRequestsResponse(tooMany)
  complete(@CurrentUser() user: AccessTokenSubject): Promise<SignupCompleteOutput> {
    return this.signup.complete(user.userId);
  }
}
