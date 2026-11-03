import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DestinationStream } from 'pino';
import { Module, type DynamicModule } from '@nestjs/common';
import type { ApiConfig } from '@oz/config';
import { LoggerModule } from 'nestjs-pino';
import { loggerOptions, pathForLog, resolveRequestId } from './logging.js';

type RequestWithId = IncomingMessage & { id?: string | number | object };

@Module({})
export class LoggingModule {
  /** Logs JSON pino ; `stream` permet aux tests de capturer la sortie. */
  static forRoot(config: ApiConfig, stream?: DestinationStream): DynamicModule {
    const base = loggerOptions(config.logLevel);
    const options = {
      ...base,
      // Identifiant déjà attribué par requestIdMiddleware (premier middleware) ; repli si absent.
      genReqId: (req: RequestWithId, res: ServerResponse): string => {
        if (typeof req.id === 'string') return req.id;
        const id = resolveRequestId(req.headers['x-request-id']);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Ni en-têtes, ni adresse IP, ni paramètres de requête (jetons possibles), ni OZ ID dans les logs.
      serializers: {
        ...base.serializers,
        req: (req: RequestWithId) => ({
          id: req.id,
          method: req.method,
          url: pathForLog(req.url ?? ''),
        }),
        res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
      },
    };
    return {
      module: LoggingModule,
      imports: [LoggerModule.forRoot({ pinoHttp: stream ? [options, stream] : options })],
    };
  }
}
