-- Fiche joueur (lot 1.13a, EX-115 n° 1 à 3) : visibilité par bloc réglée par le titulaire majeur ou
-- le tuteur vérifié d'un mineur, par une fonction privilégiée auditée (D-059) ; niveau de badge
-- calculé par la base. Les blocs ne s'appliquent qu'aux lecteurs tiers (vue publique).

-- Trois blocs booléens, rien d'autre : `location` (région, ville), `physical` (taille, poids),
-- `sport` (postes, pied fort). Absent : visible.
ALTER TABLE "players" ADD CONSTRAINT "players_visibility_blocks_check" CHECK (
  ("visibility" - ARRAY['location', 'physical', 'sport']) = '{}'::jsonb
  AND coalesce(jsonb_typeof("visibility" -> 'location'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'physical'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'sport'), 'boolean') = 'boolean');

-- Sous contexte utilisateur, la visibilité ne s'écrit que par oz_player_set_visibility : la
-- politique `players_owner` laisserait sinon un mineur régler lui-même la sienne.
CREATE FUNCTION oz_players_visibility_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NULL OR oz_privileged() THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND NEW.visibility <> '{}'::jsonb)
     OR (TG_OP = 'UPDATE' AND NEW.visibility IS DISTINCT FROM OLD.visibility) THEN
    RAISE EXCEPTION 'visibilité réglable par oz_player_set_visibility seulement'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "players_visibility_guard" BEFORE INSERT OR UPDATE ON "players"
  FOR EACH ROW EXECUTE FUNCTION oz_players_visibility_guard();

-- Niveau du badge (EX-115 n° 2, EX-111) : 2 identité vérifiée, 1 email et téléphone du compte
-- titulaire vérifiés, 0 sinon (joueur sans compte compris, D-109). Lu par identifiant de joueur,
-- jamais par compte : la fonction ne rend qu'un niveau, jamais une date ni une coordonnée.
CREATE FUNCTION oz_player_kyc_level(p_player uuid)
RETURNS smallint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (CASE
    WHEN p.verification_status = 'verified' THEN 2
    WHEN EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = p.user_id AND u.deleted_at IS NULL
        AND u.email_verified_at IS NOT NULL AND u.phone_verified_at IS NOT NULL) THEN 1
    ELSE 0 END)::smallint
  FROM players p WHERE p.id = p_player AND p.deleted_at IS NULL
$$;

-- Réglage de la visibilité (EX-115 n° 3) : titulaire majeur, ou tuteur vérifié d'un mineur. Les
-- blocs reçus remplacent les mêmes blocs ; les autres sont conservés. Inconnu, supprimé ou sans
-- droit : NULL, sans distinction. Chaque réglage est audité (blocs et valeurs seuls).
CREATE FUNCTION oz_player_set_visibility(p_player uuid, p_visibility jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  target players;
  minor boolean;
  result jsonb;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'visibilité : contexte utilisateur requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_visibility IS NULL OR jsonb_typeof(p_visibility) <> 'object' OR p_visibility = '{}'::jsonb THEN
    RAISE EXCEPTION 'visibilité : au moins un bloc attendu' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO target FROM players p WHERE p.id = p_player AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  minor := oz_is_minor(target.birth_date);
  -- Même règle que CASL, redécidée ici : compte en état, rôle tenu, lien établi.
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
                 AND u.status IN ('pending_verification', 'active')) THEN
    RETURN NULL;
  END IF;
  IF NOT ((NOT minor AND target.user_id = me AND oz_has_verified_role(ARRAY['player']::role_kind[]))
          OR (minor AND oz_has_verified_role(ARRAY['guardian']::role_kind[]) AND EXISTS (
            SELECT 1 FROM guardians g
            WHERE g.id = target.guardian_id AND g.user_id = me AND g.deleted_at IS NULL
              AND g.verification_status = 'verified'))) THEN
    RETURN NULL;
  END IF;
  -- Clés et types vérifiés par la contrainte `players_visibility_blocks_check`.
  UPDATE players SET visibility = visibility || p_visibility, updated_by = me
    WHERE id = target.id RETURNING visibility INTO result;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'player.visibility.updated', 'player', target.id,
    CASE WHEN minor THEN 'Visibilité réglée par le tuteur' ELSE 'Visibilité réglée par le titulaire' END,
    jsonb_build_object('blocks', p_visibility));
  RETURN result;
END $$;

REVOKE EXECUTE ON FUNCTION oz_player_kyc_level(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_set_visibility(uuid, jsonb) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_player_kyc_level(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_set_visibility(uuid, jsonb) TO oz_app;
  END IF;
END $$;
