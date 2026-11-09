# Image Next.js (lot 0.8a) pour apps/web ou apps/admin : sortie `standalone` (serveur Node minimal,
# fichiers statiques recopiés par scripts/next-standalone-assets.mjs), distroless, non-root 65532.
# Construction : docker build -f infra/docker/images/next.Dockerfile --build-arg APP=web .
ARG APP=web

# node 24.x, Debian 13 (trixie) slim
FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 CI=1
RUN corepack enable
WORKDIR /repo

FROM base AS prune
ARG APP
COPY . .
RUN pnpm install --frozen-lockfile --filter=oz \
 && pnpm exec turbo prune "@oz/${APP}" --docker --out-dir /pruned

FROM base AS build
ARG APP
COPY --from=prune /pruned/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /pruned/full/ .
# Fichiers racine que turbo prune n'emporte pas.
COPY --from=prune /repo/tsconfig.base.json /repo/scripts/next-standalone-assets.mjs ./
RUN mkdir -p scripts && mv next-standalone-assets.mjs scripts/ \
 && pnpm exec turbo run build --filter="@oz/${APP}" \
 && mkdir -p /writable/cache

# distroless nodejs24, Debian 13, utilisateur nonroot
FROM gcr.io/distroless/nodejs24-debian13@sha256:b770c59f44ed459329508a73794e6d284f6c10143f83c8012a8f775cd514eca2 AS runtime
ARG APP
# D-013 : l'adresse d'écoute est imposée par next-start.mjs (un HOSTNAME défini par l'orchestrateur
# ferait boucler ou tomber le serveur autonome) ; HOSTNAME reste aussi fixé ici par défaut.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 OZ_APP=${APP}
# Code propriété de root (lecture seule pour l'utilisateur d'exécution) ; seul le cache de Next,
# écrit à l'exécution, appartient à l'utilisateur 65532. L'image nonroot tourne déjà en 65532 :
# root le temps de préparer /app.
USER 0:0
COPY --from=build /repo/apps/${APP}/.next/standalone/ /app/
# Copie du dossier parent : le dossier `cache` lui-même appartient alors à 65532.
COPY --from=build --chown=65532:65532 /writable/ /app/apps/${APP}/.next/
COPY infra/docker/images/healthcheck.mjs infra/docker/images/next-start.mjs /app/
WORKDIR /app
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/nodejs/bin/node", "/app/healthcheck.mjs", "http://127.0.0.1:3000/robots.txt"]
CMD ["/app/next-start.mjs"]
