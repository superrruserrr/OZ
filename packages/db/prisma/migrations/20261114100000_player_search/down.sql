-- Retour arrière du lot 1.14a : index de la recherche retirés, minorité rétablie avec son
-- `search_path` figé.

CREATE OR REPLACE FUNCTION oz_is_minor(birth date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT oz_is_minor_at(birth, (now() AT TIME ZONE 'UTC')::date)
$$;
ALTER FUNCTION oz_is_minor_at(date, date) SET search_path = public, pg_temp;
DROP INDEX "players_search_year_name_idx";

DROP INDEX "players_search_full_name_trgm_idx";
DROP INDEX "players_created_at_id_idx";
DROP INDEX "players_search_name_idx";
DROP INDEX "players_search_birth_idx";
DROP INDEX "players_search_place_idx";
