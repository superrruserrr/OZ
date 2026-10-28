import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiConfig } from '@oz/config';
import { Logger } from 'nestjs-pino';
import { AppModule, type AppOptions } from './app.module.js';
import { requestIdMiddleware } from './common/logging/request-id.middleware.js';
import { applySecurity } from './common/security/security.js';
import { API_CONFIG } from './config/config.module.js';
import { setupSwagger } from './docs/swagger.js';

/** Applique à une application Nest la configuration transverse commune (production et tests). */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get<ApiConfig>(API_CONFIG);
  app.useLogger(app.get(Logger));
  // `req.ip` : dernier client avant les mandataires de confiance (TRUST_PROXY), jamais un en-tête
  // `X-Forwarded-For` envoyé par le client lui-même.
  app.set('trust proxy', config.trustProxy);
  app.enableShutdownHooks();
  app.use(requestIdMiddleware);
  applySecurity(app, config);
  setupSwagger(app, config);
}

/** Construit l'application à partir d'une configuration déjà validée (utilisé par main.ts et les tests). */
export async function createApp(
  config: ApiConfig,
  options: AppOptions = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, options), {
    bufferLogs: true,
  });
  configureApp(app);
  return app;
}
