-- 2FA TOTP (lot 1.3cb, EX-103 n° 7, §6.2) : secret chiffré par oz_encrypt, codes de secours en
-- empreinte HMAC, dernier pas accepté conservé pour qu'un code ne serve qu'une fois (D2). L'état 2FA
-- ne change que par les fonctions ci-dessous (chemin privilégié D-059) : la vérification a lieu avant
-- l'ouverture de session, sans contexte utilisateur. La clé de chiffrement est un paramètre de
-- fonction : elle n'est stockée nulle part en base. Le calcul du code reste dans l'API (`@oz/auth`) ;
-- la base garantit l'atomicité de l'anti-rejeu et de la consommation des codes de secours.

ALTER TABLE "users"
  -- Secret en attente : posé par l'enrôlement, actif seulement après un premier code valide.
  ADD COLUMN "totp_pending_secret_encrypted" BYTEA,
  -- Dernier pas de temps accepté (RFC 6238) : tout code d'un pas égal ou antérieur est refusé.
  ADD COLUMN "totp_last_step" BIGINT,
  ADD CONSTRAINT "users_totp_enabled_check" CHECK (("totp_enabled_at" IS NULL) = ("totp_secret_encrypted" IS NULL)),
  ADD CONSTRAINT "users_totp_last_step_check" CHECK ("totp_last_step" IS NULL OR "totp_last_step" >= 0);

ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason_check";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_reason_check" CHECK (
  "revoked_reason" IN ('rotated', 'logout', 'revoked_by_user', 'logout_all', 'reuse_detected', 'password_reset', 'two_factor_changed')
);

-- Codes de secours (D5) : seule l'empreinte HMAC est conservée.
CREATE TABLE "auth_recovery_codes" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_recovery_codes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_recovery_codes_code_hash_check" CHECK ("code_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "auth_recovery_codes_user_id_code_hash_key" ON "auth_recovery_codes"("user_id", "code_hash");
ALTER TABLE "auth_recovery_codes" ADD CONSTRAINT "auth_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auth_recovery_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_recovery_codes" FORCE ROW LEVEL SECURITY;
-- Aucun accès direct, même au titulaire : seules les fonctions ci-dessous lisent et consomment.
CREATE POLICY "auth_recovery_codes_privileged" ON "auth_recovery_codes" FOR ALL USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Les colonnes TOTP sont des colonnes d'autorité : même le titulaire ne les change pas directement
-- (désactiver sa 2FA par un simple UPDATE annulerait le second facteur). Déclencheur à part :
-- oz_guard_authority reste inchangée. Compte créé sous contexte utilisateur : aucune 2FA préremplie.
CREATE FUNCTION oz_users_guard_totp() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NULL OR oz_privileged() THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND (NEW.totp_secret_encrypted, NEW.totp_pending_secret_encrypted, NEW.totp_enabled_at, NEW.totp_last_step)
        IS DISTINCT FROM (NULL::bytea, NULL::bytea, NULL::timestamptz, NULL::bigint))
     OR (TG_OP = 'UPDATE' AND (NEW.totp_secret_encrypted, NEW.totp_pending_secret_encrypted, NEW.totp_enabled_at, NEW.totp_last_step)
        IS DISTINCT FROM (OLD.totp_secret_encrypted, OLD.totp_pending_secret_encrypted, OLD.totp_enabled_at, OLD.totp_last_step)) THEN
    RAISE EXCEPTION 'colonne d''autorité TOTP non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "users_guard_totp" BEFORE INSERT OR UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION oz_users_guard_totp();

-- Secret TOTP : 160 bits en base32.
CREATE FUNCTION oz_auth_check_totp_secret(p_secret text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_secret IS NULL OR p_secret !~ '^[A-Z2-7]{32}$' THEN
    RAISE EXCEPTION 'secret TOTP mal formé' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Lot complet de dix empreintes HMAC distinctes.
CREATE FUNCTION oz_auth_check_recovery_hashes(p_hashes text[]) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_hashes IS NULL OR cardinality(p_hashes) <> 10
     OR (SELECT count(DISTINCT h) FROM unnest(p_hashes) h WHERE h ~ '^[0-9a-f]{64}$') <> 10 THEN
    RAISE EXCEPTION 'lot de codes de secours mal formé' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Lecture des rôles sans contexte utilisateur : avec un propriétaire de fonctions non superutilisateur,
-- la RLS forcée rendrait sinon « aucun rôle », donc une 2FA jamais obligatoire.
CREATE POLICY "user_roles_privileged_read" ON "user_roles" FOR SELECT USING (oz_privileged());

-- Rôles dont la 2FA est obligatoire (EX-103 n° 7 : admins OZ, centres, fédérations). Lue par la garde
-- d'accès sous contexte utilisateur : SECURITY DEFINER, sans autre donnée que ce booléen.
CREATE FUNCTION oz_auth_totp_required(p_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles r
    WHERE r.user_id = p_user_id AND r.deleted_at IS NULL AND r.role IN ('admin', 'center', 'federation')
  )
$$;

-- Toutes les familles du compte sauf celle de l'appareil qui change sa 2FA (D7).
CREATE FUNCTION oz_auth_totp_revoke_others(p_user_id uuid, p_keep_family uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_sessions_lock_family(f.family_id)
  FROM (SELECT DISTINCT s.family_id FROM sessions s
        WHERE s.user_id = p_user_id AND s.revoked_at IS NULL AND s.family_id IS DISTINCT FROM p_keep_family
        ORDER BY 1) f;
  UPDATE sessions s SET revoked_at = now(), revoked_reason = 'two_factor_changed'
  WHERE s.user_id = p_user_id AND s.revoked_at IS NULL AND s.family_id IS DISTINCT FROM p_keep_family;
END $$;

-- ---------------------------------------------------------------------------------------------
-- État 2FA d'un compte qui peut tenir une session (aucune ligne sinon : compte suspendu, clos, non
-- vérifié). Rend les secrets en clair à l'API, seule à calculer les codes.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_totp_state(p_user_id uuid, p_key text)
RETURNS TABLE (secret text, pending_secret text, last_step bigint, required boolean, credential_stamp text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT oz_auth_can_hold_session(p_user_id) THEN RETURN; END IF;
  RETURN QUERY
    SELECT oz_decrypt(u.totp_secret_encrypted, p_key), oz_decrypt(u.totp_pending_secret_encrypted, p_key),
           u.totp_last_step, oz_auth_totp_required(u.id),
           -- Change avec le mot de passe : un défi de connexion ne survit pas à sa réinitialisation.
           encode(digest(coalesce(u.password_hash, ''), 'sha256'), 'hex')
    FROM users u WHERE u.id = p_user_id;
END $$;

-- Enrôlement : remplace le secret en attente, jamais le secret actif.
CREATE FUNCTION oz_auth_totp_begin(p_user_id uuid, p_secret text, p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_auth_check_totp_secret(p_secret);
  IF NOT oz_auth_can_hold_session(p_user_id) THEN RETURN false; END IF;
  UPDATE users SET totp_pending_secret_encrypted = oz_encrypt(p_secret, p_key), updated_at = now()
  WHERE id = p_user_id;
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Activation ou changement d'appareil : le secret en attente devient actif si c'est bien celui qui
-- vient d'être vérifié (un enrôlement concurrent l'a peut-être remplacé). Pose le lot de codes de
-- secours, note le pas du premier code, révoque les autres sessions (D7).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_totp_enable(
  p_user_id uuid, p_secret text, p_step bigint, p_hashes text[], p_key text, p_keep_family uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account users%ROWTYPE;
BEGIN
  PERFORM oz_auth_check_totp_secret(p_secret);
  PERFORM oz_auth_check_recovery_hashes(p_hashes);
  SELECT * INTO account FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT oz_auth_can_hold_session(p_user_id)
     OR oz_decrypt(account.totp_pending_secret_encrypted, p_key) IS DISTINCT FROM p_secret THEN
    RETURN false;
  END IF;
  UPDATE users
  SET totp_secret_encrypted = totp_pending_secret_encrypted, totp_pending_secret_encrypted = NULL,
      totp_enabled_at = now(), totp_last_step = p_step, updated_at = now()
  WHERE id = p_user_id;
  DELETE FROM auth_recovery_codes WHERE user_id = p_user_id;
  INSERT INTO auth_recovery_codes (user_id, code_hash) SELECT p_user_id, h FROM unnest(p_hashes) h;
  PERFORM oz_auth_totp_revoke_others(p_user_id, p_keep_family);
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (p_user_id, CASE WHEN account.totp_enabled_at IS NULL THEN 'user.totp.enabled' ELSE 'user.totp.changed' END,
          'user', p_user_id, 'Second facteur activé par le titulaire');
  RETURN true;
END $$;

-- Désactivation (D6, D7) : « required » si un rôle l'impose, « disabled » sinon, « inactive » si
-- rien n'était actif ou si le compte ne peut plus tenir de session.
CREATE FUNCTION oz_auth_totp_disable(p_user_id uuid, p_keep_family uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account users%ROWTYPE;
BEGIN
  SELECT * INTO account FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR account.totp_enabled_at IS NULL OR NOT oz_auth_can_hold_session(p_user_id) THEN
    RETURN 'inactive';
  END IF;
  IF oz_auth_totp_required(p_user_id) THEN RETURN 'required'; END IF;
  UPDATE users
  SET totp_secret_encrypted = NULL, totp_pending_secret_encrypted = NULL, totp_enabled_at = NULL,
      totp_last_step = NULL, updated_at = now()
  WHERE id = p_user_id;
  DELETE FROM auth_recovery_codes WHERE user_id = p_user_id;
  PERFORM oz_auth_totp_revoke_others(p_user_id, p_keep_family);
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (p_user_id, 'user.totp.disabled', 'user', p_user_id, 'Second facteur désactivé par le titulaire');
  RETURN 'disabled';
END $$;

-- Anti-rejeu (D2) : atomique, deux vérifications simultanées du même code n'en acceptent qu'une.
CREATE FUNCTION oz_auth_totp_consume_step(p_user_id uuid, p_step bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE users SET totp_last_step = p_step
  WHERE id = p_user_id AND totp_enabled_at IS NOT NULL
    AND (totp_last_step IS NULL OR totp_last_step < p_step);
  RETURN FOUND;
END $$;

-- Code de secours : usage unique ; rend le nombre de codes restants, ou NULL si le code est refusé.
CREATE FUNCTION oz_auth_totp_consume_recovery(p_user_id uuid, p_hash text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  remaining integer;
BEGIN
  PERFORM oz_auth_check_token_hash(p_hash);
  UPDATE auth_recovery_codes SET consumed_at = now()
  WHERE user_id = p_user_id AND code_hash = p_hash AND consumed_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*) INTO remaining FROM auth_recovery_codes WHERE user_id = p_user_id AND consumed_at IS NULL;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (p_user_id, 'user.totp.recovery_used', 'user', p_user_id, 'Code de secours utilisé');
  RETURN remaining;
END $$;

-- Régénération du lot (D5) : l'ancien lot cesse de valoir, entièrement.
CREATE FUNCTION oz_auth_totp_replace_recovery(p_user_id uuid, p_hashes text[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_auth_check_recovery_hashes(p_hashes);
  PERFORM 1 FROM users WHERE id = p_user_id AND totp_enabled_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  DELETE FROM auth_recovery_codes WHERE user_id = p_user_id;
  INSERT INTO auth_recovery_codes (user_id, code_hash) SELECT p_user_id, h FROM unnest(p_hashes) h;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (p_user_id, 'user.totp.recovery_replaced', 'user', p_user_id, 'Codes de secours régénérés');
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution : même règle qu'aux lots 1.3a et 1.3b (D-066).
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_auth_check_totp_secret(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_check_recovery_hashes(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_required(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_revoke_others(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_state(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_begin(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_enable(uuid, text, bigint, text[], text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_disable(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_consume_step(uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_consume_recovery(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_totp_replace_recovery(uuid, text[]) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_auth_totp_required(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_state(uuid, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_begin(uuid, text, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_enable(uuid, text, bigint, text[], text, uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_disable(uuid, uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_consume_step(uuid, bigint) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_consume_recovery(uuid, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_totp_replace_recovery(uuid, text[]) TO oz_app;
  END IF;
END $$;
