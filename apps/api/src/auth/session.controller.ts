import { Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { ApiConfig } from '@oz/config';
import {
  accessTokenOutputSchema,
  loginSchema,
  type AccessTokenOutput,
  type LoginInput,
} from '@oz/contracts';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/api-error.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ValidatedBody } from '../common/validation/validated-body.decorator.js';
import { API_CONFIG } from '../config/config.module.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import {
  assertTrustedOrigin,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie.js';
import {
  RetryLaterException,
  SessionService,
  type ClientContext,
  type IssuedSession,
} from './session.service.js';

const tokenResponse = { schema: openApiBodySchema(accessTokenOutputSchema) };
const COOKIE_NOTE =
  'Pose le cookie `__Host-oz_refresh` (HttpOnly, Secure, SameSite=Strict) ; le jeton d’accès reste en mémoire côté client.';

// Écoute en double pile : un client IPv4 arrive en `::ffff:a.b.c.d`, ramené en IPv4 pour que la
// troncature (/24) s'applique et non celle d'IPv6 (/48), qui ne garderait que des zéros.
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

export const clientOf = (req: Request): ClientContext => ({
  userAgent: req.header('User-Agent'),
  ip: req.ip?.replace(MAPPED_IPV4, '$1'),
});

/**
 * Sessions (lot 1.3b). Connexion publique ; rafraîchissement et déconnexion authentifiés par le seul
 * cookie, donc protégés contre la falsification de requête par la liste blanche d'origines.
 */
@ApiTags('auth')
@Controller('auth')
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Se connecter', description: COOKIE_NOTE })
  @ApiBody({ schema: openApiBodySchema(loginSchema) })
  @ApiOkResponse({ description: 'Connecté', ...tokenResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Email ou mot de passe incorrect' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Adresse email à confirmer' })
  @ApiTooManyRequestsResponse({
    type: ApiErrorDto,
    description: 'Délai exponentiel',
    headers: { 'Retry-After': { description: 'Attente en secondes', schema: { type: 'integer' } } },
  })
  async login(
    @ValidatedBody(loginSchema) input: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenOutput> {
    try {
      return this.respond(res, await this.sessions.login(input, clientOf(req)));
    } catch (error) {
      if (error instanceof RetryLaterException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Prolonger la session (rotation du jeton de rafraîchissement)',
    description: `Lit et remplace le cookie \`__Host-oz_refresh\`. Un jeton déjà utilisé révoque toutes les sessions de cet appareil. ${COOKIE_NOTE}`,
  })
  @ApiOkResponse({ description: 'Nouveau jeton d’accès', ...tokenResponse })
  @ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session expirée ou révoquée' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Origine refusée' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenOutput> {
    assertTrustedOrigin(req, this.config.corsOrigins);
    try {
      return this.respond(res, await this.sessions.refresh(readRefreshCookie(req), clientOf(req)));
    } catch (error) {
      // Seul un refus efface le cookie : une panne passagère (5xx) n'a pas consommé le jeton.
      if (error instanceof AppException && error.status === 401) clearRefreshCookie(res);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Se déconnecter de cet appareil' })
  @ApiNoContentResponse({ description: 'Déconnecté, cookie effacé' })
  @ApiForbiddenResponse({ type: ApiErrorDto, description: 'Origine refusée' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    assertTrustedOrigin(req, this.config.corsOrigins);
    try {
      await this.sessions.logout(readRefreshCookie(req));
    } finally {
      // Le navigateur oublie le jeton même si la révocation en base échoue.
      clearRefreshCookie(res);
    }
  }

  private respond(res: Response, issued: IssuedSession): AccessTokenOutput {
    setRefreshCookie(res, issued.refreshToken, issued.refreshExpiresAt, new Date());
    return issued.access;
  }
}
