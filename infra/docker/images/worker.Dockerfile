# Image du worker d'analyse des documents (lot 1.9b) : construite depuis le sous-ensemble du monorepo
# utile à @oz/worker, exécutée sur distroless (ni shell ni gestionnaire de paquets), utilisateur
# non-root 65532. sharp embarque libvips (paquet @img/sharp-linux-*, glibc) : aucune bibliothèque
# système à ajouter. Construction : docker build -f infra/docker/images/worker.Dockerfile .

# node 24.x, Debian 13 (trixie) slim
FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH TURBO_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 CI=1
RUN corepack enable
WORKDIR /repo

# Sous-ensemble du monorepo (turbo prune) : manifestes d'abord, pour le cache des dépendances.
FROM base AS prune
COPY . .
RUN pnpm install --frozen-lockfile --filter=oz \
 && pnpm exec turbo prune @oz/worker --docker --out-dir /pruned

FROM base AS build
COPY --from=prune /pruned/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /pruned/full/ .
# Fichiers racine que turbo prune n'emporte pas.
COPY --from=prune /repo/tsconfig.base.json ./
RUN pnpm exec turbo run build --filter=@oz/worker \
 && pnpm --filter=@oz/worker deploy --prod --legacy /out \
 && rm -rf /out/src /out/test /out/.turbo /out/*.md /out/tsconfig*.json /out/vitest.config.ts

# distroless nodejs24, Debian 13, utilisateur nonroot
FROM gcr.io/distroless/nodejs24-debian13@sha256:b770c59f44ed459329508a73794e6d284f6c10143f83c8012a8f775cd514eca2 AS runtime
ENV NODE_ENV=production
# L'image nonroot s'exécute déjà en 65532 : root le temps de préparer /app (propriété de root).
USER 0:0
WORKDIR /app
# Code propriété de root : l'utilisateur d'exécution le lit sans pouvoir le modifier.
COPY --from=build /out/ ./
COPY infra/docker/images/healthcheck.mjs ./healthcheck.mjs
USER 65532:65532
# Aucun port publié : la sonde de vivacité n'écoute que sur 127.0.0.1:3003 (apps/worker/src/health.ts).
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/nodejs/bin/node", "healthcheck.mjs", "http://127.0.0.1:3003/health/live"]
CMD ["dist/main.js"]
