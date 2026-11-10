-- Recherche v1 (lot 1.14a, EX-116 n° 1, 2, 5) : index des filtres et des tris de la recherche de
-- joueurs. Aucune donnée ni politique modifiée : la recherche lit `players` sous la RLS du lecteur.
-- Expressions désaccentuées en minuscules, identiques à celles de `searchPlayers` (@oz/db).

-- Lieu : pays, puis région et ville sans accents ni casse.
CREATE INDEX "players_search_place_idx" ON "players"
  ("country", lower(oz_unaccent("region")), lower(oz_unaccent("city")))
  WHERE "deleted_at" IS NULL;

-- Âge par année de naissance (D5) : plage de dates de naissance.
CREATE INDEX "players_search_birth_idx" ON "players" ("birth_date") WHERE "deleted_at" IS NULL;

-- Tri par nom (clé de pagination : nom, prénom, identifiant).
CREATE INDEX "players_search_name_idx" ON "players"
  (lower(oz_unaccent("last_name")), lower(oz_unaccent("first_name")), "id")
  WHERE "deleted_at" IS NULL;

-- Tri par date de création, du plus récent au plus ancien.
CREATE INDEX "players_created_at_id_idx" ON "players" ("created_at", "id");

-- Texte libre (D2) : prénom et nom seulement, similarité de mots par trigrammes.
CREATE INDEX "players_search_full_name_trgm_idx" ON "players"
  USING GIN (lower(oz_unaccent("first_name" || ' ' || "last_name")) gin_trgm_ops);

-- Tri par année de naissance, puis nom (clé de pagination complète).
CREATE INDEX "players_search_year_name_idx" ON "players"
  ((extract(year FROM "birth_date")::int), lower(oz_unaccent("last_name")),
   lower(oz_unaccent("first_name")), "id")
  WHERE "deleted_at" IS NULL;

-- Minorité intégrable par le planificateur (lot 1.14a, charge EX-116 n° 5) : sans `SET search_path`,
-- une fonction SQL simple est développée dans la requête au lieu d'être appelée à chaque ligne de la
-- politique de lecture (deux appels imbriqués par ligne). Même règle, appels qualifiés : correcte
-- sous un `search_path` vide (restauration pg_dump). Fonctions natives seules dans le corps.
ALTER FUNCTION oz_is_minor_at(date, date) RESET search_path;
ALTER FUNCTION oz_is_minor(date) RESET search_path;
CREATE OR REPLACE FUNCTION oz_is_minor(birth date) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT public.oz_is_minor_at(birth, (now() AT TIME ZONE 'UTC')::date)
$$;
