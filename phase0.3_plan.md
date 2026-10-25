# Phase 0.3: Squelette d'API NestJS

## Summary

| # | Task | Requirements |
|---|------|-------------|
| 1 | `apps/api` NestJS + `packages/config` : configuration typée validée par Zod, démarrage refusé si invalide | EX-003 n° 1, TD-001 |
| 2 | Filtre d'exceptions global → format d'erreur normalisé | EX-003 n° 2, EX-T07 n° 2 |
| 3 | `requestId` de bout en bout + logs JSON (pino) sans donnée personnelle | EX-T19, EX-T11 (préparation) |
| 4 | `/health` (base, Redis, stockage) ; Swagger `/docs` en local et recette seulement | EX-003 n° 3-4, EX-T07 n° 1 |
| 5 | En-têtes de sécurité (§6.5) et CORS en liste blanche | EX-T17 n° 2-3 |

## Dependencies

- [x] Lot 0.2 mergé dans `develop` (PR #2, `f75a9a8`) : PostgreSQL, Redis, SeaweedFS disponibles via `pnpm dev:up`
- [ ] Docker Desktop lancé (tests d'intégration Testcontainers, TD-006)
- [ ] Branche `feat/p0-api-skeleton` créée depuis `develop` (porte aussi la suppression de `phase0.2_plan.md`)

### Décisions d'implémentation (prises au plan, à consigner dans `DEPENDENCIES.md`)

| Sujet | Choix | Raison |
|---|---|---|
| Version NestJS | **12.2** (`@nestjs/core`, `common`, `platform-express`, `testing`) | ESM natif comme le monorepo ; TD-001 fixait 11 comme plancher. Risque : majeure récente (août 2026) |
| Adaptateur HTTP | Express (`@nestjs/platform-express`) | Écosystème le plus large (helmet, téléversements au lot 1.9) ; Fastify non requis à ce stade |
| Logs | `nestjs-pino` 5 + `pino` 10 + `pino-http` 11 | JSON structuré, propagation par `AsyncLocalStorage`, `redact` intégré |
| En-têtes | `helmet` 8 | Couvre CSP, HSTS, nosniff, Referrer-Policy ; `Permissions-Policy` ajouté à la main |
| Validation de configuration | `zod` 4 (TD-001 : 3.24+ comme plancher) | Même bibliothèque que `packages/contracts` (lot 0.5) |
| Sondes de santé | `pg`, `ioredis`, `@aws-sdk/client-s3` | Clients légers ; Prisma arrive au lot 0.6 ; le SDK S3 sert ensuite au lot 1.9 |
| Swagger | `@nestjs/swagger` 12 | OpenAPI natif (EX-T07) |
| Tests | `supertest`, `testcontainers` (+ modules PostgreSQL, Redis), `unplugin-swc` + `@swc/core` | Vitest/esbuild n'émet pas les métadonnées de décorateurs nécessaires à l'injection Nest : SWC les émet |
| Variable d'environnement ajoutée | `APP_ENV` = `local` \| `preview` \| `staging` \| `production` ; `API_PORT` ; `CORS_ORIGINS` | `NODE_ENV=production` est aussi vrai en recette : `APP_ENV` décide de l'exposition de `/docs` |

**Contrainte TypeScript :** `apps/api` active `experimentalDecorators` et `emitDecoratorMetadata`. Avec `verbatimModuleSyntax`, tout type injecté par constructeur doit être importé comme **valeur** (pas `import type`), sinon l'injection échoue à l'exécution : couvert par les tests d'intégration.

---

## Tasks

### Task 1: Application NestJS et configuration typée

**What:** Remplacer le squelette neutre de `apps/api` par une application NestJS 12 qui refuse de démarrer si sa configuration est invalide.

**Files:**
- Create: `packages/config/src/api-config.ts` — schéma Zod de la configuration API (`NODE_ENV`, `APP_ENV`, `API_PORT`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `CORS_ORIGINS`) ; `loadApiConfig(env)` renvoie un objet typé et gelé, ou lève une erreur listant **les noms** des variables invalides, **jamais leurs valeurs**
- Modify: `packages/config/src/index.ts` — exports ; `packages/config/package.json` — dépendance `zod`
- Create: `apps/api/src/main.ts` (amorçage, arrêt propre sur `SIGTERM`), `apps/api/src/app.module.ts`, `apps/api/src/config/config.module.ts` (fournit la configuration chargée une fois)
- Modify: `apps/api/package.json` (dépendances Nest, scripts `dev`, `start`), `apps/api/tsconfig.json` (décorateurs)
- Modify: `.env.example` — `APP_ENV=local`, `API_PORT=3001`, `CORS_ORIGINS=http://localhost:3000`
- Create: `apps/api/vitest.config.ts` — transformation SWC

**AC:**
- [ ] Avec un `.env` valide, `pnpm --filter @oz/api start` démarre et écoute sur `API_PORT` (EX-003 n° 1)
- [ ] Avec `DATABASE_URL` absent ou `API_PORT=abc`, le démarrage échoue avec un code non nul et un message qui **nomme** les variables fautives sans afficher aucune valeur (EX-003 n° 1, EX-T19)
- [ ] `loadApiConfig` refuse `APP_ENV` hors liste et `CORS_ORIGINS` contenant `*`
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm lint` verts pour `@oz/api` et `@oz/config`

---

### Task 2: Format d'erreur normalisé

**What:** Un filtre global transforme toute erreur en un corps unique `{ code, message, requestId, details? }`, sans fuite d'information interne.

**Files:**
- Create: `apps/api/src/common/errors/api-error.ts` — type `ApiError` (conforme à `naming_conventions.md`) et classe `AppException(status, code, message, details?)`
- Create: `apps/api/src/common/errors/all-exceptions.filter.ts` — `HttpException` → statut et code dérivé (`NOT_FOUND`, `BAD_REQUEST`…), `ZodError` → 422 `VALIDATION_FAILED` avec `details: [{ field, code }]`, `AppException` → son code, tout le reste → 500 `INTERNAL_ERROR` au message générique ; journalisation de l'erreur complète côté serveur avec `requestId`
- Modify: `apps/api/src/main.ts` — enregistrement du filtre

**AC:**
- [ ] Une route inconnue renvoie 404 `{ code: "NOT_FOUND", message, requestId }` (EX-003 n° 2)
- [ ] Une erreur non prévue renvoie 500 `INTERNAL_ERROR` sans pile, sans texte d'exception, sans chemin de fichier (EX-T07 n° 2, §6.4 A05)
- [ ] Une `ZodError` renvoie 422 avec `details` listant les champs, sans les valeurs reçues
- [ ] Le `requestId` du corps est identique à l'en-tête `X-Request-Id` de la réponse et à celui du log de l'erreur

---

### Task 3: `requestId` et logs JSON

**What:** Chaque requête porte un identifiant propagé jusqu'aux logs, et aucun log ne contient de donnée personnelle.

**Files:**
- Create: `apps/api/src/common/logging/logging.module.ts` — `nestjs-pino` : JSON, niveau depuis `LOG_LEVEL`, `genReqId` (reprend `X-Request-Id` entrant **seulement** s'il correspond à `^[A-Za-z0-9-]{8,64}$`, sinon UUID neuf), en-tête `X-Request-Id` renvoyé, `redact` des en-têtes `authorization`, `cookie`, `set-cookie` et des champs `password`, `email`, `phone`, `birthDate`, `token`, `secret` (où qu'ils soient)
- Create: `apps/api/src/common/logging/redact-paths.ts` — liste exportée et testée
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts` — `bufferLogs`, logger Nest remplacé par pino

**AC:**
- [ ] Chaque ligne de log de requête est un JSON contenant `req.id` (EX-T19 n° 1)
- [ ] Un `X-Request-Id` entrant valide est conservé ; un entrant malformé (trop long, caractères spéciaux, injection de saut de ligne) est remplacé
- [ ] Un log contenant `authorization`, `cookie`, `password`, `email`, `phone` affiche `[Redacted]` (EX-T19 n° 2)
- [ ] Aucun `console.*` dans `apps/api` (règle ESLint existante)

---

### Task 4: `/health` et `/docs`

**What:** Exposer l'état de l'API et de ses dépendances, et la documentation OpenAPI hors production.

**Files:**
- Create: `apps/api/src/health/health.controller.ts`, `health.service.ts`, `health.module.ts` — sondes base (`SELECT 1` via `pg`), Redis (`PING` via `ioredis`), stockage (`HeadBucket` via `@aws-sdk/client-s3`), chacune avec délai maximal de 2 s, exécutées en parallèle
- Create: `apps/api/src/docs/swagger.ts` — `/docs` et `/docs-json` montés **uniquement** si `APP_ENV` ∈ {`local`, `preview`, `staging`}
- Modify: `apps/api/src/app.module.ts`, `apps/api/src/main.ts`

**AC:**
- [ ] `GET /health` renvoie 200 `{ status: "ok", checks: { database: "up", redis: "up", storage: "up" } }` quand tout répond (EX-003 n° 3)
- [ ] Si une dépendance est arrêtée ou dépasse 2 s, `GET /health` renvoie 503 avec `status: "degraded"` et la dépendance en `down`, **sans** nom d'hôte, message d'erreur ni pile dans la réponse ; le détail est journalisé
- [ ] `/health` documenté comme seul endpoint public sans authentification (commentaire + OpenAPI)
- [ ] `/docs` et `/docs-json` répondent en `APP_ENV=local` ; ils renvoient 404 en `APP_ENV=production` (EX-003 n° 4)
- [ ] `/docs-json` est un OpenAPI 3 valide qui décrit `/health` avec ses réponses 200 et 503 et le schéma d'erreur (EX-T07 n° 1)

---

### Task 5: En-têtes de sécurité et CORS

**What:** Appliquer les en-têtes du §6.5 et n'accepter que les origines déclarées.

**Files:**
- Create: `apps/api/src/common/security/security.ts` — `helmet` (CSP `default-src 'none'; frame-ancestors 'none'` pour les réponses JSON, CSP adaptée à `/docs` seulement, HSTS 2 ans + `includeSubDomains` + `preload`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`), `Permissions-Policy: camera=(), microphone=(), geolocation=()` ajouté, en-tête `X-Powered-By` supprimé
- Create: `apps/api/src/common/security/cors.ts` — liste blanche depuis `CORS_ORIGINS` ; origine absente de la liste → aucun en-tête `Access-Control-Allow-Origin` ; `credentials: true` (cookie de rafraîchissement, §6.2)
- Modify: `apps/api/src/main.ts`

**AC:**
- [ ] Toute réponse porte `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Content-Security-Policy` et pas de `X-Powered-By` (EX-T17 n° 2)
- [ ] Une requête depuis une origine listée reçoit `Access-Control-Allow-Origin` égal à cette origine ; une origine non listée n'en reçoit aucun (EX-T17 n° 3)
- [ ] Un pré-vol `OPTIONS` d'une origine non listée ne reçoit aucun en-tête CORS

---

## Tests

| Test | File | Verifies |
|------|------|---------|
| Configuration valide, invalide, valeurs jamais affichées | `packages/config/src/api-config.test.ts` | Task 1 |
| Démarrage refusé avec configuration invalide (processus réel) | `apps/api/test/bootstrap.int.test.ts` | Task 1 |
| Filtre : 404, 422 Zod, 500 générique, cohérence du `requestId` | `apps/api/test/errors.int.test.ts` | Task 2 |
| `X-Request-Id` accepté / remplacé ; masquage des champs sensibles dans les logs | `apps/api/src/common/logging/redact-paths.test.ts`, `apps/api/test/logging.int.test.ts` | Task 3 |
| `/health` 200 avec PostgreSQL, Redis et SeaweedFS réels (Testcontainers), 503 dépendance arrêtée | `apps/api/test/health.int.test.ts` | Task 4 |
| `/docs` présent en local, 404 en production ; OpenAPI valide | `apps/api/test/docs.int.test.ts` | Task 4 |
| En-têtes de sécurité ; CORS liste blanche et pré-vol | `apps/api/test/security.int.test.ts` | Task 5 |
| Dépendances consignées (R12) | `pnpm lint` (`scripts/check-dependencies.mjs`) | Toutes |
