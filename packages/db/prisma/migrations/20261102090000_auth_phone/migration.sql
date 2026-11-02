-- Téléphone du compte (lot 1.3cc, TD-012, EX-111 n° 2) : numéro chiffré par oz_encrypt, empreinte par
-- oz_blind_index pour le contrôle de doublon du KYC (lot 1.10). Pas d'unicité : un numéro peut être
-- partagé (D2). Le numéro n'est écrit qu'une fois prouvé par un code (D5), par la fonction ci-dessous
-- (chemin privilégié D-059) ; les clés sont des paramètres, stockées nulle part en base.

-- Aucun numéro n'existait : une date de vérification antérieure ne prouve rien.
-- RLS forcée : sans ce relâchement, oz_migrator ne verrait aucune ligne (0 mise à jour, sans erreur).
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
UPDATE "users" SET "phone_verified_at" = NULL WHERE "phone_verified_at" IS NOT NULL;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "users"
  ADD COLUMN "phone_encrypted" BYTEA,
  ADD COLUMN "phone_hmac" BYTEA,
  ADD CONSTRAINT "users_phone_pair_check" CHECK (("phone_encrypted" IS NULL) = ("phone_hmac" IS NULL)),
  ADD CONSTRAINT "users_phone_verified_check" CHECK ("phone_verified_at" IS NULL OR "phone_hmac" IS NOT NULL);

CREATE INDEX "users_phone_hmac_idx" ON "users"("phone_hmac");

-- Colonnes d'autorité, comme phone_verified_at : sinon le titulaire changerait de numéro sans preuve
-- en gardant son statut vérifié.
CREATE FUNCTION oz_users_guard_phone() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NULL OR oz_privileged() THEN RETURN NEW; END IF;
  IF (TG_OP = 'INSERT' AND (NEW.phone_encrypted, NEW.phone_hmac) IS DISTINCT FROM (NULL::bytea, NULL::bytea))
     OR (TG_OP = 'UPDATE' AND (NEW.phone_encrypted, NEW.phone_hmac) IS DISTINCT FROM (OLD.phone_encrypted, OLD.phone_hmac)) THEN
    RAISE EXCEPTION 'colonne d''autorité téléphone non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "users_guard_phone" BEFORE INSERT OR UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION oz_users_guard_phone();

-- Écrit numéro, empreinte et date en une fois. Rend « verified » (premier numéro), « changed » (un
-- autre numéro remplace un numéro vérifié), « same » (même numéro, date rafraîchie), NULL si le
-- compte ne peut plus tenir de session. Le numéro n'entre jamais au journal.
CREATE FUNCTION oz_auth_set_verified_phone(
  p_user_id uuid, p_phone text, p_encryption_key text, p_blind_index_key text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account users%ROWTYPE;
  digest bytea;
  outcome text;
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'numéro mal formé' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO account FROM users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR NOT oz_auth_can_hold_session(p_user_id) THEN RETURN NULL; END IF;
  digest := oz_blind_index(p_phone, p_blind_index_key);
  outcome := CASE
    WHEN account.phone_hmac IS NULL OR account.phone_verified_at IS NULL THEN 'verified'
    WHEN account.phone_hmac = digest THEN 'same'
    ELSE 'changed'
  END;
  UPDATE users
  SET phone_encrypted = oz_encrypt(p_phone, p_encryption_key), phone_hmac = digest,
      phone_verified_at = now(), updated_at = now()
  WHERE id = p_user_id;
  IF outcome <> 'same' THEN
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
    VALUES (p_user_id, 'user.phone.' || outcome, 'user', p_user_id, 'Numéro prouvé par un code');
  END IF;
  RETURN outcome;
END $$;

-- Droits d'exécution : même règle qu'aux lots 1.3a à 1.3cb (D-066).
REVOKE EXECUTE ON FUNCTION oz_auth_set_verified_phone(uuid, text, text, text) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_auth_set_verified_phone(uuid, text, text, text) TO oz_app;
  END IF;
END $$;
