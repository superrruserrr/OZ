-- Comptes : inscription, confirmation d'email, réinitialisation du mot de passe (lot 1.3a, EX-103).
-- Ces opérations ont lieu sans contexte utilisateur (personne n'est encore connecté) : elles passent
-- par des fonctions SECURITY DEFINER dédiées (chemin privilégié, D-059), jamais par une connexion
-- applicative qui contournerait la RLS. Les jetons et mots de passe arrivent déjà hachés : la base
-- ne voit jamais un secret en clair.

-- ---------------------------------------------------------------------------------------------
-- Jetons à usage unique envoyés par email : seule leur empreinte SHA-256 est conservée.
-- ---------------------------------------------------------------------------------------------

CREATE TYPE "auth_token_purpose" AS ENUM ('email_verification', 'password_reset');

CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "purpose" "auth_token_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "auth_tokens_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "auth_tokens_expires_at_check" CHECK ("expires_at" > "created_at")
);
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");
CREATE INDEX "auth_tokens_user_id_purpose_idx" ON "auth_tokens"("user_id", "purpose");
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "auth_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auth_tokens" FORCE ROW LEVEL SECURITY;
-- Aucun accès direct, même au titulaire : seules les fonctions ci-dessous lisent et consomment.
CREATE POLICY "auth_tokens_privileged" ON "auth_tokens" FOR ALL USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Chemin privilégié sur les comptes, leurs sessions et le journal (personne n'est connecté).
CREATE POLICY "users_privileged" ON "users" FOR ALL USING (oz_privileged()) WITH CHECK (oz_privileged());
CREATE POLICY "sessions_privileged" ON "sessions" FOR ALL USING (oz_privileged()) WITH CHECK (oz_privileged());
CREATE POLICY "audit_log_insert_privileged" ON "audit_log" FOR INSERT WITH CHECK (oz_privileged());

-- Hash PHC Argon2id (packages/auth) : la base refuse tout autre format, jamais un mot de passe en clair.
CREATE FUNCTION oz_auth_is_password_hash(p_hash text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public, pg_temp AS $$
  SELECT p_hash ~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
$$;

-- Durée de vie bornée : de 1 minute à 7 jours.
CREATE FUNCTION oz_auth_check_ttl(p_ttl interval) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_ttl IS NULL OR p_ttl < interval '1 minute' OR p_ttl > interval '7 days' THEN
    RAISE EXCEPTION 'durée de vie de jeton hors bornes' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- Empreinte de jeton : SHA-256 en hexadécimal minuscule.
CREATE FUNCTION oz_auth_check_token_hash(p_token_hash text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'empreinte de jeton mal formée' USING ERRCODE = 'check_violation';
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Inscription (EX-103 n° 1) : crée le compte en attente de vérification et son jeton de
-- confirmation. Renvoie l'identifiant, ou NULL si l'email est déjà pris (compte supprimé compris) :
-- l'API répond pareil dans les deux cas (EX-103 n° 10).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_register(p_email text, p_password_hash text, p_token_hash text, p_ttl interval)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  created uuid;
BEGIN
  IF p_password_hash IS NULL OR NOT oz_auth_is_password_hash(p_password_hash) THEN
    RAISE EXCEPTION 'hash de mot de passe Argon2id attendu' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_ttl(p_ttl);
  INSERT INTO users (email, password_hash) VALUES (lower(btrim(p_email)), p_password_hash)
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO created;
  IF created IS NULL THEN RETURN NULL; END IF;
  INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
  VALUES (created, 'email_verification', p_token_hash, now() + p_ttl);
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (created, 'user.account.registered', 'user', created, 'Inscription');
  RETURN created;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Identifiants d'un compte non supprimé, pour la vérification du mot de passe (lot 1.3b) : aucune
-- autre colonne ne sort.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_credentials(p_email text)
RETURNS TABLE (user_id uuid, password_hash text, status user_status, email_verified boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.password_hash, u.status, u.email_verified_at IS NOT NULL
  FROM users u
  WHERE u.email = lower(btrim(p_email)) AND u.deleted_at IS NULL
$$;

-- Consomme un jeton valide (une seule fois, non expiré, du bon usage) et renvoie son titulaire.
-- Le verrou de ligne de l'UPDATE sérialise deux consommations concurrentes : la seconde ne trouve
-- plus de jeton libre.
CREATE FUNCTION oz_auth_consume_token(p_token_hash text, p_purpose auth_token_purpose) RETURNS uuid
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  UPDATE auth_tokens SET consumed_at = now()
  WHERE token_hash = p_token_hash AND purpose = p_purpose AND consumed_at IS NULL AND expires_at > now()
  RETURNING user_id INTO owner;
  RETURN owner;
END $$;

-- Pose la vérification de l'email : la possession de la boîte est prouvée par le jeton.
CREATE FUNCTION oz_auth_mark_email_verified(p_user_id uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- Un compte suspendu ou clos n'est pas confirmé (l'API n'annonce pas « email confirmé »).
  UPDATE users
  SET email_verified_at = coalesce(email_verified_at, now()),
      status = CASE WHEN status = 'pending_verification' THEN 'active'::user_status ELSE status END,
      updated_at = now()
  WHERE id = p_user_id AND deleted_at IS NULL AND status IN ('pending_verification', 'active');
  RETURN FOUND;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Confirmation d'email (EX-103 n° 1, n° 9) : vrai si le jeton était valide et le compte actif.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_verify_email(p_token_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid := oz_auth_consume_token(p_token_hash, 'email_verification');
BEGIN
  IF owner IS NULL OR NOT oz_auth_mark_email_verified(owner) THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (owner, 'user.email.verified', 'user', owner, 'Confirmation de l''adresse email');
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Demande de réinitialisation : crée le jeton si un compte en attente ou actif porte cet email,
-- en invalidant les demandes précédentes. Renvoie l'identifiant du compte (l'API envoie alors
-- l'email), sinon NULL ; la réponse HTTP est la même dans les deux cas (EX-103 n° 10).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_request_password_reset(p_email text, p_token_hash text, p_ttl interval) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_ttl(p_ttl);
  SELECT id INTO owner FROM users
  WHERE email = lower(btrim(p_email)) AND deleted_at IS NULL AND status IN ('pending_verification', 'active')
  FOR UPDATE;
  IF owner IS NULL THEN RETURN NULL; END IF;
  UPDATE auth_tokens SET consumed_at = now()
  WHERE user_id = owner AND purpose = 'password_reset' AND consumed_at IS NULL;
  INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
  VALUES (owner, 'password_reset', p_token_hash, now() + p_ttl);
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (owner, 'user.password.reset_requested', 'user', owner, 'Demande de réinitialisation du mot de passe');
  RETURN owner;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Réinitialisation (EX-103 n° 1) : consomme le jeton, remplace le hash, invalide les autres jetons
-- de réinitialisation et révoque toutes les sessions ouvertes (un voleur de session est déconnecté).
-- Le jeton prouve la possession de la boîte : l'email est aussi vérifié. Renvoie l'email du compte
-- (notification « mot de passe modifié »), ou NULL si le jeton n'est pas valide.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_reset_password(p_token_hash text, p_password_hash text) RETURNS text
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
  UPDATE sessions SET revoked_at = now(), updated_at = now()
  WHERE user_id = owner AND revoked_at IS NULL;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (owner, 'user.password.reset', 'user', owner, 'Réinitialisation du mot de passe');
  RETURN address;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Mise à niveau du hash après une connexion réussie (paramètres Argon2id changés) : réservée au
-- titulaire, sous son propre contexte (posé par l'API une fois le mot de passe vérifié, lot 1.3b),
-- et conditionnelle à l'ancien hash pour ne jamais écraser un changement concurrent.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_auth_rehash_password(p_user_id uuid, p_old_hash text, p_new_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_new_hash IS NULL OR NOT oz_auth_is_password_hash(p_new_hash) THEN
    RAISE EXCEPTION 'hash de mot de passe Argon2id attendu' USING ERRCODE = 'check_violation';
  END IF;
  IF oz_current_user_id() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'mise à niveau du hash réservée au titulaire' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE users SET password_hash = p_new_hash, updated_at = now()
  WHERE id = p_user_id AND password_hash = p_old_hash AND deleted_at IS NULL
    AND status IN ('pending_verification', 'active');
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (p_user_id, 'user.password.rehashed', 'user', p_user_id, 'Mise à niveau du hachage du mot de passe');
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution : ces fonctions agissent sans utilisateur connecté (lecture d'un hash par
-- email, création de compte…). Aucun rôle ne les appelle par défaut ; seul le rôle applicatif
-- `oz_app` (créé par Terraform en prévisualisation, recette et production) les reçoit. En local,
-- l'application se connecte avec le propriétaire du schéma, qui les exécute déjà.
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_auth_register(text, text, text, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_credentials(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_consume_token(text, auth_token_purpose) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_mark_email_verified(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_verify_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_request_password_reset(text, text, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_reset_password(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_auth_rehash_password(uuid, text, text) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_auth_register(text, text, text, interval) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_credentials(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_verify_email(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_request_password_reset(text, text, interval) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_reset_password(text, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_auth_rehash_password(uuid, text, text) TO oz_app;
  END IF;
END $$;
