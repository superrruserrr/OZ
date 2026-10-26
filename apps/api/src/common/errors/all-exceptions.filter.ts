import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { requestIdOf } from '../logging/request-id.middleware.js';
import { toApiError } from './api-error.js';

/** Filtre global : toute erreur sort au format `ApiError` ; le détail complet ne va qu'aux logs. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = requestIdOf(request);
    const { status, body } = toApiError(exception, requestId);
    const context = {
      requestId,
      method: request.method,
      path: request.path,
      status,
      code: body.code,
    };

    if (status >= 500) {
      this.logger.error({ ...context, err: exception }, 'erreur non gérée');
    } else {
      // Erreur client : pas de pile, pas de contenu de requête (évite l'inondation du niveau error).
      this.logger.info(context, 'requête refusée');
    }
    if (response.headersSent) {
      // Réponse déjà commencée (flux) : impossible de la réécrire, on coupe proprement.
      response.end();
      return;
    }
    response.status(status).json(body);
  }
}
