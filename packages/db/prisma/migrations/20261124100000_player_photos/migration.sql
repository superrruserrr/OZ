-- Photos du joueur (lot 1.19cd, décisions U1 et U2 du 2026-11-19) : photo de profil et galerie,
-- déposées par le coffre documentaire (type `photo`, lot 1.9 : URL signée, ClamAV, ré-encodage, EXIF
-- retiré). Six photos au plus par joueur ; bloc de visibilité `photos` masquable aux tiers.

-- 1. Bloc `photos` ajouté aux blocs réglables (aucun champ de la fiche : la galerie seule).
ALTER TABLE "players" DROP CONSTRAINT "players_visibility_blocks_check";
ALTER TABLE "players" ADD CONSTRAINT "players_visibility_blocks_check" CHECK (
  ("visibility" - ARRAY['location', 'physical', 'sport', 'photos']) = '{}'::jsonb
  AND coalesce(jsonb_typeof("visibility" -> 'location'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'physical'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'sport'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'photos'), 'boolean') = 'boolean');

-- 2. Photo de profil : une photo saine et active du même joueur, sinon rien.
ALTER TABLE "players" ADD COLUMN "profile_photo_id" UUID;
ALTER TABLE "players" ADD CONSTRAINT "players_profile_photo_id_fkey"
  FOREIGN KEY ("profile_photo_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION oz_players_profile_photo_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.profile_photo_id IS NOT NULL
     AND NEW.profile_photo_id IS DISTINCT FROM OLD.profile_photo_id
     AND NOT EXISTS (
       SELECT 1 FROM documents d
       WHERE d.id = NEW.profile_photo_id AND d.player_id = NEW.id AND d.type = 'photo'
         AND d.av_status = 'clean' AND d.deleted_at IS NULL AND d.purged_at IS NULL) THEN
    RAISE EXCEPTION 'photo de profil : photo saine du joueur attendue' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "players_profile_photo_guard" BEFORE UPDATE OF "profile_photo_id" ON "players"
  FOR EACH ROW EXECUTE FUNCTION oz_players_profile_photo_guard();

-- 3. Une photo de joueur est gardée tant qu'il la garde (échéance repoussée de 100 ans, date valide
--    pour l'export RGPD) : pas d'échéance de 90 jours. Sa suppression
--    (par le joueur, ou à la clôture du compte) ramène l'échéance à maintenant ; la purge suit.
CREATE FUNCTION oz_documents_photo_retention() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.type = 'photo' AND NEW.player_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    NEW.retention_until := now() + interval '100 years';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "documents_photo_retention" BEFORE INSERT ON "documents"
  FOR EACH ROW EXECUTE FUNCTION oz_documents_photo_retention();

-- 4. Six photos au plus (U2) : photos actives et dépôts encore ouverts, sous verrou de la fiche.
CREATE FUNCTION oz_player_photo_count(p_player uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (
    (SELECT count(*) FROM documents d
      WHERE d.player_id = p_player AND d.type = 'photo' AND d.deleted_at IS NULL
        AND d.purged_at IS NULL AND d.av_status IN ('pending', 'clean'))
    + (SELECT count(*) FROM document_uploads u
      WHERE u.player_id = p_player AND u.document_type = 'photo' AND u.status = 'issued'
        AND u.expires_at > now()))::integer
$$;

CREATE FUNCTION oz_document_uploads_photo_limit() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.document_type = 'photo' AND NEW.player_id IS NOT NULL THEN
    PERFORM 1 FROM players p WHERE p.id = NEW.player_id FOR UPDATE;
    IF oz_player_photo_count(NEW.player_id) >= 6 THEN
      RAISE EXCEPTION 'photos : six au plus par joueur' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "document_uploads_photo_limit" BEFORE INSERT ON "document_uploads"
  FOR EACH ROW EXECUTE FUNCTION oz_document_uploads_photo_limit();

-- 5. Photos d'un joueur, pour l'API qui a déjà lu la fiche sous la RLS du lecteur et décidé (comme
--    oz_player_kyc_level, D-109) : identifiant, clé, dimensions, verdict ; jamais de donnée extraite.
CREATE FUNCTION oz_player_photos(p_player uuid)
RETURNS TABLE (id uuid, storage_key text, mime_type text, width integer, height integer,
  av_status av_status, is_profile boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.storage_key, d.mime_type, d.width, d.height, d.av_status,
    coalesce(d.id = p.profile_photo_id, false), d.created_at
  FROM documents d JOIN players p ON p.id = d.player_id
  WHERE d.player_id = p_player AND d.type = 'photo' AND d.deleted_at IS NULL
    AND d.purged_at IS NULL AND d.av_status IN ('pending', 'clean', 'rejected', 'infected')
    AND p.deleted_at IS NULL
  ORDER BY coalesce(d.id = p.profile_photo_id, false) DESC, d.created_at DESC
  LIMIT 12
$$;

-- 6. Retirer une photo ou choisir la photo de profil : titulaire majeur, ou tuteur vérifié d'un
--    mineur (même règle que la visibilité), audité. NULL : inconnue, supprimée ou sans droit.
CREATE FUNCTION oz_player_photo_manager(p_player uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  target players;
BEGIN
  IF me IS NULL THEN RETURN false; END IF;
  SELECT * INTO target FROM players p WHERE p.id = p_player AND p.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
                 AND u.status IN ('pending_verification', 'active')) THEN
    RETURN false;
  END IF;
  RETURN (NOT oz_is_minor(target.birth_date) AND target.user_id = me
          AND oz_has_verified_role(ARRAY['player']::role_kind[]))
      OR (oz_is_minor(target.birth_date) AND oz_has_verified_role(ARRAY['guardian']::role_kind[])
          AND EXISTS (SELECT 1 FROM guardians g WHERE g.id = target.guardian_id AND g.user_id = me
                        AND g.deleted_at IS NULL AND g.verification_status = 'verified'));
END $$;

CREATE FUNCTION oz_player_set_profile_photo(p_player uuid, p_document uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT oz_player_photo_manager(p_player) THEN RETURN NULL; END IF;
  UPDATE players SET profile_photo_id = p_document, updated_by = oz_current_user_id()
    WHERE id = p_player;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (oz_current_user_id(), 'player.photo.profile_set', 'player', p_player,
    'Photo de profil choisie', jsonb_build_object('document', p_document));
  RETURN true;
END $$;

CREATE FUNCTION oz_player_remove_photo(p_player uuid, p_document uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT oz_player_photo_manager(p_player) THEN RETURN NULL; END IF;
  UPDATE players SET profile_photo_id = NULL, updated_by = oz_current_user_id()
    WHERE id = p_player AND profile_photo_id = p_document;
  UPDATE documents SET deleted_at = now(), retention_until = now(),
      updated_by = oz_current_user_id()
    WHERE id = p_document AND player_id = p_player AND type = 'photo' AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (oz_current_user_id(), 'player.photo.removed', 'player', p_player,
    'Photo retirée', jsonb_build_object('document', p_document));
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION oz_player_photo_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_photos(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_photo_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_set_profile_photo(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_remove_photo(uuid, uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_player_photo_count(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_photos(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_set_profile_photo(uuid, uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_remove_photo(uuid, uuid) TO oz_app;
  END IF;
END $$;
