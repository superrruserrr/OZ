import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { ApiConfig } from '@oz/config';
import { ApiErrorDto } from '../common/errors/api-error.dto.js';

const DOCS_ENVIRONMENTS: ReadonlySet<ApiConfig['appEnv']> = new Set([
  'local',
  'preview',
  'staging',
]);

/** La documentation n'est montée que hors production (EX-003 n° 4). */
export function docsEnabled(config: ApiConfig): boolean {
  return DOCS_ENVIRONMENTS.has(config.appEnv);
}

/** Chemins servis par Swagger, et eux seuls (pas un simple préfixe : /documents reste une route API). */
export function isDocsPath(path: string): boolean {
  return (
    path === '/docs' || path.startsWith('/docs/') || path === '/docs-json' || path === '/docs-yaml'
  );
}

/** Monte /docs et /docs-json hors production uniquement (EX-003 n° 4). */
export function setupSwagger(app: INestApplication, config: ApiConfig): boolean {
  if (!docsEnabled(config)) return false;
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('API OZ').setVersion('0.3.0').build(),
    { extraModels: [ApiErrorDto] },
  );
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  return true;
}
