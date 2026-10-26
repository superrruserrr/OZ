import type { CorsOptionsDelegate } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ApiConfig } from '@oz/config';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { docsEnabled, isDocsPath } from '../../docs/swagger.js';

const shared = {
  strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' as const },
  xContentTypeOptions: true,
};

// Réponses JSON : rien ne doit être chargé ni intégré (§6.5).
const apiHeaders = helmet({
  ...shared,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
});

// /docs (hors production) : l'interface Swagger charge ses propres scripts et styles, jamais de tiers.
const docsHeaders = helmet({
  ...shared,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
  },
});

function permissionsPolicy(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Réponses de l'API jamais mises en cache (données personnelles, OWASP API).
  res.setHeader('Cache-Control', 'no-store');
  // La réponse dépend de l'origine (CORS) : un cache intermédiaire ne doit pas la partager.
  res.vary('Origin');
  next();
}

/** En-têtes de sécurité (§6.5, EX-T17 n° 2) et CORS en liste blanche (EX-T17 n° 3). */
export function applySecurity(app: NestExpressApplication, config: ApiConfig): void {
  app.disable('x-powered-by');
  const docs = docsEnabled(config);
  app.use((req: Request, res: Response, next: NextFunction) => {
    (docs && isDocsPath(req.path) ? docsHeaders : apiHeaders)(req, res, next);
  });
  app.use(permissionsPolicy);

  const allowed = new Set(config.corsOrigins);
  const corsDelegate: CorsOptionsDelegate<Request> = (req, callback) => {
    const origin = req.header('Origin');
    if (origin === undefined || !allowed.has(origin)) {
      // Origine absente ou non listée : aucun en-tête CORS, y compris en pré-vol.
      callback(null, { origin: false });
      return;
    }
    callback(null, {
      origin,
      credentials: true,
      methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    });
  };
  app.enableCors(corsDelegate);
}
