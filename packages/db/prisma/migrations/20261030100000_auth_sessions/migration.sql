-- Sessions : connexion, rotation du jeton de rafraîchissement, détection de réutilisation et
-- révocation (lot 1.3b, EX-103 n° 3 à 6, design §5.7). Une famille naît à chaque connexion ; chaque
-- rafraîchissement consomme la ligne courante et en crée une nouvelle dans la même famille. Au plus une
-- ligne valide par famille : un jeton déjà consommé qui revient trahit un vol, et toute la famille
-- tombe. Ouverture, rotation et déconnexion par cookie ont lieu sans contexte utilisateur (le jeton
-- d'accès a expiré) : chemin privilégié D-059. La liste et la révocation par l'utilisateur passent par
-- la RLS (`sessions_self_read`, `sessions_self_revoke`). Tout chemin qui consomme ou révoque une
-- famille prend d'abord son verrou (oz_sessions_lock_family) : une rotation et un rejeu concurrents ne
-- peuvent pas se croiser sans que la famille tombe.

-- Motif de fin d'une ligne : « rotated » = consommée par un rafraîchissement (seul cas où la famille
-- reste ouverte) ; tous les autres motifs ferment la famille entière.
ALTER TABLE "sessions"
  ADD COLUMN "revoked_reason" TEXT,
  -- Fin absolue de la famille (D1 du lot 1.3b : 90 jours) : la rotation ne la prolonge jamais.
  ADD COLUMN "family_expires_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "sessions_revoked_reason_check" CHECK (
    "revoked_reason" IN ('rotated', 'logout', 'revoked_by_user', 'logout_all', 'reuse_detected', 'password_reset')
  ),
  ADD CONSTRAINT "sessions_revoked_consistency_check" CHECK (("revoked_at" IS NULL) = ("revoked_reason" IS NULL)),
  ADD CONSTRAINT "sessions_family_expires_at_check" CHECK (
    "family_expires_at" IS NULL OR "family_expires_at" >= "expires_at"
  ),
  -- Libellé d'appareil déduit du User-Agent par l'API (« Firefox · macOS ») : jamais l'en-tête brut.
  ADD CONSTRAINT "sessions_user_agent_check" CHECK ("user_agent" IS NULL OR char_length("user_agent") <= 100);

-- Le titulaire lit et révoque ses sessions, rien d'autre : seules les fonctions privilégiées créent
-- une session (jeton choisi par le serveur, famille bornée). Remplace `sessions_self` (FOR ALL).
DROP POLICY "sessions_self" ON "sessions";
CREATE POLICY "sessions_self_read" ON "sessions" FOR SELECT
  USING ("user_id" = oz_current_user_id());
CREATE POLICY "sessions_self_revoke" ON "sessions" FOR UPDATE
  USING ("user_id" = oz_current_user_id()) WITH CHECK ("user_id" = oz_current_user_id());

-- Une ligne de session ne change que pour finir (révocation) ou noter son dernier usage : ni
-- résurrection, ni changement de titulaire, de famille, de jeton ou d'échéance, quel que soit l'auteur
-- (`created_at` est déjà figé par oz_set_updated_at). Hors chemin privilégié (titulaire sous RLS), seule
-- la révocation elle-même est permise, avec un motif de titulaire : ni effacement logique qui
-- masquerait un rejeu, ni IP, appareil ou motif réservé (« rotated », « reuse_detected »…).
CREATE FUNCTION oz_sessions_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT oz_privileged() AND (
       OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
       OR NEW.revoked_reason NOT IN ('revoked_by_user', 'logout_all')
       OR (NEW.deleted_at, NEW.ip, NEW.user_agent, NEW.device_fingerprint, NEW.last_used_at)
          IS DISTINCT FROM (OLD.deleted_at, OLD.ip, OLD.user_agent, OLD.device_fingerprint, OLD.last_used_at)) THEN
    RAISE EXCEPTION 'session : seule la révocation est permise' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND (
       NEW.revoked_at IS DISTINCT FROM OLD.revoked_at OR NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason)
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.family_id IS DISTINCT FROM OLD.family_id
     OR NEW.refresh_token_hash IS DISTINCT FROM OLD.refresh_token_hash
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.family_expires_at IS DISTINCT FROM OLD.family_expires_at THEN
    RAISE EXCEPTION 'session : seule la révocation est permise' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "sessions_guard" BEFORE UPDATE ON "sessions" FOR EACH ROW EXECUTE FUNCTION oz_sessions_guard();

-- Verrou transactionnel d'une famille : sérialise rotation, rejeu, déconnexion et révocations.
CREATE FUNCTION oz_sessions_lock_family(p_family_id uuid) RETURNS void
LANGUAGE sql VOLATILE SET search_path = public, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('oz.sessions.family:' || p_family_id::text, 0))
$$;

-- IP tronquée (plan §6.2) : réseau /24 en IPv4, /48 en IPv6, partie hôte à zéro.
CREATE FUNCTION oz_auth_truncate_ip(p_ip inet) RETURNS inet
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public, pg_temp AS $$
  SELECT network(set_masklen(p_ip, CASE family(p_ip) WHEN 4 THEN 24 ELSE 48 END))::inet
$$;

-- Durées : rafraîchissement de 1 à 30 jours, famille de 1 à 90 jours et jamais plus courte.
CREATE FUNCTION oz_auth_check_session_ttl(p_ttl interval, p_family_ttl interval) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_ttl IS NULL OR p_ttl < interval '1 day' OR p_ttl > interval '30 days'
     OR p_family_ttl IS NULL OR p_family_ttl < p_ttl OR p_family_ttl > interval '90 days' THEN
    RAISE EXCEPTION 'durée de session hors bornes' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Compte autorisé à ouvrir ou prolonger une session : actif, email vérifié, non supprimé (EX-103 n° 9).
CREATE FUNCTION oz_auth_can_hold_session(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id AND deleted_at IS NULL AND status = 'active' AND email_verified_at IS NOT NULL
  )
$$;

-- ---------------------------------------------------------------------------------------------
-- Connexion (EX-103 n° 1) : appelée après vérification du mot de passe. Ouvre une famille neuve.
-- `known_device` dit si ce libellé d'appareil a déjà ouvert une session du compte depuis 90 jours
-- (notification « nouvelle connexion », D5). Aucune ligne si le compte ne peut pas se connecter.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_open_session(
  p_user_id uuid, p_token_hash text, p_device text, p_ip inet, p_ttl interval, p_family_ttl interval
)
RETURNS TABLE (session_id uuid, family_id uuid, expires_at timestamptz, known_device boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  created sessions%ROWTYPE;
  known boolean;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_session_ttl(p_ttl, p_family_ttl);
  IF NOT oz_auth_can_hold_session(p_user_id) THEN RETURN; END IF;
  -- Une famille volée (réutilisation détectée) ne rend pas l'appareil du voleur « connu ».
  known := p_device IS NOT NULL AND EXISTS (
    SELECT 1 FROM sessions s
    WHERE s.user_id = p_user_id AND s.user_agent = p_device AND s.created_at > now() - interval '90 days'
      AND s.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM sessions r WHERE r.family_id = s.family_id AND r.revoked_reason = 'reuse_detected')
  );
  INSERT INTO sessions (user_id, family_id, refresh_token_hash, user_agent, ip, expires_at, family_expires_at, last_used_at)
  VALUES (p_user_id, oz_uuid_v7(), p_token_hash, p_device, oz_auth_truncate_ip(p_ip),
          now() + p_ttl, now() + p_family_ttl, now())
  RETURNING * INTO created;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (p_user_id, 'user.session.opened', 'session', created.id, 'Connexion');
  RETURN QUERY SELECT created.id, created.family_id, created.expires_at, known;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Rafraîchissement (EX-103 n° 4, n° 5) : `outcome` vaut
--   « rotated » : ligne consommée et remplacée dans la même famille (nouvelle ligne renvoyée) ;
--   « reuse »   : jeton déjà consommé alors que la famille vivait encore → famille entière révoquée,
--                 journalisée ; l'API alerte le titulaire ;
--   « invalid » : jeton inconnu, expiré, révoqué avec sa famille, ou compte qui ne peut plus se connecter.
-- Le verrou de ligne sérialise deux rafraîchissements concurrents du même jeton : le second voit la
-- ligne consommée et révoque la famille (D3 du lot 1.3b : aucune fenêtre de grâce).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_rotate_session(p_token_hash text, p_new_hash text, p_ip inet, p_ttl interval)
RETURNS TABLE (outcome text, user_id uuid, family_id uuid, session_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_row sessions%ROWTYPE;
  created sessions%ROWTYPE;
  revoked integer;
  next_expiry timestamptz;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_token_hash(p_new_hash);
  PERFORM oz_auth_check_session_ttl(p_ttl, p_ttl);
  SELECT * INTO current_row FROM sessions s
  WHERE s.refresh_token_hash = p_token_hash AND s.deleted_at IS NULL;
  IF FOUND THEN
    -- Famille verrouillée, puis ligne relue : un rejeu concurrent d'une rotation voit la ligne créée.
    PERFORM oz_sessions_lock_family(current_row.family_id);
    SELECT * INTO current_row FROM sessions s WHERE s.id = current_row.id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF current_row.revoked_at IS NOT NULL THEN
    IF current_row.revoked_reason = 'rotated' THEN
      UPDATE sessions s SET revoked_at = now(), revoked_reason = 'reuse_detected'
      WHERE s.family_id = current_row.family_id AND s.revoked_at IS NULL;
      GET DIAGNOSTICS revoked = ROW_COUNT;
      -- Famille déjà fermée (déconnexion, révocation antérieure) : rien à révoquer ni à signaler.
      IF revoked > 0 THEN
        INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
        VALUES (current_row.user_id, 'user.session.reuse_detected', 'session', current_row.id,
                'Réutilisation d''un jeton de rafraîchissement : famille de sessions révoquée');
        RETURN QUERY SELECT 'reuse'::text, current_row.user_id, current_row.family_id, NULL::uuid, NULL::timestamptz;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- Ligne sans terme de famille (antérieure au lot 1.3b) : son échéance courante devient ce terme.
  next_expiry := least(now() + p_ttl, coalesce(current_row.family_expires_at, current_row.expires_at));
  IF current_row.expires_at <= now() OR next_expiry <= now()
     OR NOT oz_auth_can_hold_session(current_row.user_id) THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE sessions s SET revoked_at = now(), revoked_reason = 'rotated', last_used_at = now()
  WHERE s.id = current_row.id;
  INSERT INTO sessions (user_id, family_id, refresh_token_hash, user_agent, ip, expires_at, family_expires_at, last_used_at)
  VALUES (current_row.user_id, current_row.family_id, p_new_hash, current_row.user_agent,
          coalesce(oz_auth_truncate_ip(p_ip), current_row.ip), next_expiry,
          coalesce(current_row.family_expires_at, next_expiry), now())
  RETURNING * INTO created;
  RETURN QUERY SELECT 'rotated'::text, created.user_id, created.family_id, created.id, created.expires_at;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Déconnexion de l'appareil courant (EX-103 n° 1) : révoque la famille du jeton présenté, qu'il soit
-- courant ou déjà consommé par une rotation (le titulaire qui se déconnecte pendant qu'un voleur fait
-- tourner la famille la ferme quand même). Renvoie le titulaire, ou NULL (rien à fermer).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_logout(p_token_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_row sessions%ROWTYPE;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  SELECT * INTO current_row FROM sessions s
  WHERE s.refresh_token_hash = p_token_hash AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM oz_sessions_lock_family(current_row.family_id);
  SELECT * INTO current_row FROM sessions s
  WHERE s.id = current_row.id AND (s.revoked_at IS NULL OR s.revoked_reason = 'rotated') FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE sessions s SET revoked_at = now(), revoked_reason = 'logout'
  WHERE s.family_id = current_row.family_id AND s.revoked_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (current_row.user_id, 'user.session.revoked', 'session', current_row.id, 'Déconnexion');
  RETURN current_row.user_id;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Réinitialisation du mot de passe (lot 1.3a) : même comportement, motif de révocation renseigné.
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION oz_auth_reset_password(p_token_hash text, p_password_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid;
  address text;
BEGIN
  IF p_password_hash IS NULL OR NOT oz_auth_is_password_hash(p_password_hash) THEN
    RAISE EXCEPTION 'hash de mot de passe Argon2id attendu' USING ERRCODE = 'check_violation';
  END IF;
  owner := oz_auth_consume_token(p_token_hash, 'password_reset');
  IF owner IS NULL THEN RETURN NULL; END IF;
  -- Un compte suspendu ou clos depuis la demande ne change plus de mot de passe.
  UPDATE users
  SET password_hash = p_password_hash,
      email_verified_at = coalesce(email_verified_at, now()),
      status = CASE WHEN status = 'pending_verification' THEN 'active'::user_status ELSE status END,
      updated_at = now()
  WHERE id = owner AND deleted_at IS NULL AND status IN ('pending_verification', 'active')
  RETURNING email INTO address;
  IF address IS NULL THEN RETURN NULL; END IF;
  UPDATE auth_tokens SET consumed_at = now()
  WHERE user_id = owner AND purpose = 'password_reset' AND consumed_at IS NULL;
  PERFORM oz_sessions_lock_family(f.family_id)
  FROM (SELECT DISTINCT s.family_id FROM sessions s WHERE s.user_id = owner AND s.revoked_at IS NULL ORDER BY 1) f;
  UPDATE sessions SET revoked_at = now(), revoked_reason = 'password_reset', updated_at = now()
  WHERE user_id = owner AND revoked_at IS NULL;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (owner, 'user.password.reset', 'user', owner, 'Réinitialisation du mot de passe');
  RETURN address;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution : même règle qu'au lot 1.3a (D-066) ; les fonctions internes restent fermées.
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_sessions_lock_family(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_truncate_ip(inet) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_check_session_ttl(interval, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_can_hold_session(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_open_session(uuid, text, text, inet, interval, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_rotate_session(text, text, inet, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_logout(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_reset_password(text, text) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_auth_open_session(uuid, text, text, inet, interval, interval) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_rotate_session(text, text, inet, interval) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_logout(text) TO oz_app;
    -- Le titulaire verrouille ses familles avant de les révoquer sous RLS (rôle applicatif).
    GRANT EXECUTE ON FUNCTION oz_sessions_lock_family(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_reset_password(text, text) TO oz_app;
  END IF;
END $$;
