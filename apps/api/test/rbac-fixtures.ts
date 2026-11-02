import type { NestExpressApplication } from '@nestjs/platform-express';
import type { RbacRoute } from '@oz/auth';

interface RouterLayer {
  readonly route?: { readonly path: string; readonly methods: Record<string, boolean> };
}

// Swagger se monte hors contrôleur et hors production (EX-003 n° 4), voir `docs/security/rbac.md` :
// ces routes-là, et elles seules, sans préfixe qui masquerait une route de l'API.
const DOCUMENTATION = new Set([
  '/docs',
  '/docs/',
  '/docs-json',
  '/docs-yaml',
  '/docs/LICENSE',
  '/docs/docs/swagger-ui-init.js',
]);
const SWAGGER_ASSET = /^\/docs\/(swagger-ui[\w.-]*|index\.html)$/;
const isDocumentation = (method: string, path: string): boolean =>
  method === 'get' && (DOCUMENTATION.has(path) || SWAGGER_ASSET.test(path));
// Passe-partout posé par Nest pour ses middlewares `forRoutes('*')` : pas une route de l'API.
const MIDDLEWARE_SPLAT = '{/*splat}';

/** Routes réellement montées, lues dans le routeur Express : `METHODE /chemin`. */
export function mountedRoutes(app: NestExpressApplication): string[] {
  const router = (
    app.getHttpAdapter().getInstance() as unknown as { router: { stack: RouterLayer[] } }
  ).router;
  return router.stack.flatMap(({ route }) =>
    route === undefined || route.path === MIDDLEWARE_SPLAT
      ? []
      : Object.keys(route.methods)
          .filter((method) => !isDocumentation(method, route.path))
          .map((method) => `${method.toUpperCase()} ${route.path}`),
  );
}

/** Routes montées absentes de la matrice : une seule fait échouer la suite. */
export function undeclaredRoutes(
  app: NestExpressApplication,
  routes: readonly RbacRoute[],
): string[] {
  const declared = new Set(routes.map(({ method, path }) => `${method} ${path}`));
  return mountedRoutes(app).filter((route) => !declared.has(route));
}
