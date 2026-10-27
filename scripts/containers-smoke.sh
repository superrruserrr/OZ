#!/usr/bin/env bash
# Fumée sur les images réelles (lot 0.8a) : construit et démarre infra/docker/compose.smoke.yml,
# attend que chaque conteneur soit sain (contrôles de santé des images), lance Playwright, puis
# supprime tout, y compris en cas d'échec — après avoir affiché les journaux pour le diagnostic.
set -euo pipefail
COMPOSE=(docker compose -f infra/docker/compose.smoke.yml)

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    echo "✖ Fumée en échec ($status) : journaux des conteneurs"
    "${COMPOSE[@]}" logs --no-color --tail 200 || true
  fi
  "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

# En CI, les images viennent d'être construites et analysées par Trivy : elles sont lancées telles quelles.
if [ "${SMOKE_SKIP_BUILD:-0}" != "1" ]; then
  "${COMPOSE[@]}" build
fi
"${COMPOSE[@]}" up --detach --no-build --wait --wait-timeout 180
pnpm exec playwright test --config e2e/containers.config.ts
