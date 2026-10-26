#!/usr/bin/env bash
# CI, job migrations (EX-T09.2, R9) : sur une base PostgreSQL vierge, toutes les migrations en up, puis
# chacune annulée (down) jusqu'à la dernière, puis de nouveau up. Chaque étape est jugée sur sa sortie,
# pas seulement sur son code de retour (la CLI Prisma 7 peut réussir sans rien faire).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL requise}"
: "${APP_ENV:?APP_ENV requis}"

expect_output() {
  local pattern="$1"
  shift
  local output
  output="$("$@" 2>&1)" || {
    printf '%s\n' "$output"
    return 1
  }
  printf '%s\n' "$output"
  grep -qE "$pattern" <<<"$output" || {
    echo "✖ Sortie inattendue (attendu : $pattern)"
    return 1
  }
}

# Extensions provisionnées avec la base, comme `pnpm dev:up` et Terraform (lot 0.8).
for extension in pgcrypto pg_trgm unaccent; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS $extension;"
done

expect_output 'successfully applied|No pending migrations' pnpm db:migrate
expect_output 'up to date' pnpm db:status

count="$(find packages/db/prisma/migrations -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
for _ in $(seq "$count"); do
  expect_output '✓ Migration annulée' pnpm db:rollback
done
expect_output 'Aucune migration appliquée' pnpm db:rollback

expect_output 'successfully applied' pnpm db:migrate
expect_output 'up to date' pnpm db:status
echo "✓ ${count} migration(s) vérifiée(s) en up → down → up."
