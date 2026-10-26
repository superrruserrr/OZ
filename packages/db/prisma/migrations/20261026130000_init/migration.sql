-- Lot 0.6 — migration initiale. down.sql annule exactement ce qui suit.

-- Extensions (plan §5.1) : chiffrement colonne, recherche floue, recherche sans accents. Fournies par le
-- provisionnement de la base ; exigées ici sans être supprimées par down.sql (docs/db/migrations.md).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- UUIDv7 (RFC 9562) : 48 bits d'horodatage en millisecondes, puis aléa ; triable dans le temps.
-- PostgreSQL 16 n'a pas uuidv7() (natif à partir de 18, voir DEBT D-005).
CREATE FUNCTION oz_uuid_v7() RETURNS uuid
LANGUAGE sql VOLATILE PARALLEL SAFE
AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex'
  )::uuid
$$;

-- CreateTable
CREATE TABLE "system_settings" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");
