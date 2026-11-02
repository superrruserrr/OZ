import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AccessTokenSubject } from '@oz/auth';
import {
  sessionListOutputSchema,
  sessionParamsSchema,
  type SessionListOutput,
  type SessionParamsInput,
} from '@oz/contracts';
import {
  listSessions,
  revokeAllSessions,
  revokeSession,
  withUserContext,
  type PrismaClient,
} from '@oz/db';
import type { Response } from 'express';
import { AppException } from '../common/errors/api-error.js';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';
import { ZodValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { DB_CLIENT } from '../database/database.module.js';
import { openApiBodySchema } from '../docs/contract-schema.js';
import { Authenticated } from '../authorization/decorators.js';
import { CurrentUser } from './current-user.decorator.js';
import { clearRefreshCookie } from './refresh-cookie.js';
import { TwoFactorEnrollment } from './two-factor-exempt.decorator.js';

/**
 * Sessions de l'utilisateur (lot 1.3b, EX-103 n° 1 et n° 6). Authentifiées par le seul jeton d'accès
 * (en-tête, jamais envoyé d'office par le navigateur) : pas de contrôle d'origine nécessaire.
 */
@ApiTags('auth')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorDto, description: 'Session absente, expirée ou révoquée' })
@ApiForbiddenResponse({ type: ApiErrorDto, description: 'Adresse email à confirmer' })
@Authenticated()
@Controller('auth')
export class SessionsController {
  constructor(@Inject(DB_CLIENT) private readonly db: PrismaClient) {}

  @Get('sessions')
  @ApiOperation({ summary: 'Lister ses sessions actives' })
  @ApiOkResponse({ description: 'Sessions', schema: openApiBodySchema(sessionListOutputSchema) })
  async list(@CurrentUser() user: AccessTokenSubject): Promise<SessionListOutput> {
    const sessions = await withUserContext(this.db, user.userId, (tx) => listSessions(tx));
    return {
      sessions: sessions.map((session) => ({
        id: session.familyId,
        device: session.device,
        ip: session.ip,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
        current: session.familyId === user.familyId,
      })),
    };
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Révoquer une de ses sessions' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Session révoquée' })
  @ApiNotFoundResponse({ type: ApiErrorDto, description: 'Aucune session active de ce compte' })
  async revoke(
    @CurrentUser() user: AccessTokenSubject,
    @Param(new ZodValidationPipe(sessionParamsSchema)) params: SessionParamsInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const revoked = await withUserContext(this.db, user.userId, (tx) =>
      revokeSession(tx, params.id),
    );
    // Même réponse qu'elle appartienne à un autre compte ou n'existe pas.
    if (!revoked) throw new AppException(404, 'AUTH_SESSION_NOT_FOUND', 'Session introuvable.');
    if (params.id.toLowerCase() === user.familyId) clearRefreshCookie(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  @TwoFactorEnrollment()
  @ApiOperation({ summary: 'Se déconnecter de tous ses appareils' })
  @ApiNoContentResponse({ description: 'Toutes les sessions révoquées, cookie effacé' })
  async logoutAll(
    @CurrentUser() user: AccessTokenSubject,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await withUserContext(this.db, user.userId, (tx) => revokeAllSessions(tx));
    clearRefreshCookie(res);
  }
}
