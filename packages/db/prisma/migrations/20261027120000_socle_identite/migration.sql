-- Lot 1.1a — socle : identité, cloisonnement, audit (EX-101, EX-T11, décisions D2 à D6 du lot 1.1).
-- down.sql annule exactement ce qui suit. RLS, déclencheurs et fonctions sont écrits à la main (TD-002).

-- ---------------------------------------------------------------------------------------------
-- Fonctions transverses
-- ---------------------------------------------------------------------------------------------

-- updated_at tenu par la base : aucune écriture ne peut l'oublier (plan §5.1) ; created_at immuable.
CREATE FUNCTION oz_set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.created_at := OLD.created_at;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END $$;

-- Aucune suppression physique des données de personnes : suppression logique ou anonymisation (EX-101 n° 5).
CREATE FUNCTION oz_forbid_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'suppression physique interdite sur % : utiliser deleted_at ou l''anonymisation', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $$;

-- Contexte utilisateur posé par transaction (set_config('oz.user_id', …, true)) ; absent = NULL = aucun droit.
CREATE FUNCTION oz_current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('oz.user_id', true), '')::uuid
$$;

-- Chiffrement colonne (plan §6.9, D2) : la clé est toujours un paramètre lié, jamais une constante du schéma.
CREATE FUNCTION oz_check_key(key text) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF key IS NULL OR length(key) < 32 THEN
    RAISE EXCEPTION 'clé de chiffrement absente ou trop courte (32 caractères minimum)'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
END $$;

CREATE FUNCTION oz_encrypt(value text, key text) RETURNS bytea
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  options CONSTANT text := 'cipher-algo=aes256';
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  PERFORM oz_check_key(key);
  RETURN pgp_sym_encrypt(value, key, options);
END $$;

-- Une mauvaise clé lève « Wrong key or corrupt data » : jamais de texte faux.
CREATE FUNCTION oz_decrypt(value bytea, key text) RETURNS text
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  PERFORM oz_check_key(key);
  RETURN pgp_sym_decrypt(value, key);
END $$;

-- Index aveugle (HMAC-SHA-256) : recherche d'égalité et doublons sans déchiffrer. Normalisation côté application.
CREATE FUNCTION oz_blind_index(value text, key text) RETURNS bytea
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  PERFORM oz_check_key(key);
  RETURN hmac(value, key, 'sha256');
END $$;

-- ---------------------------------------------------------------------------------------------
-- Énumérations
-- ---------------------------------------------------------------------------------------------

CREATE TYPE "user_status" AS ENUM ('pending_verification', 'active', 'suspended', 'closed');
-- Sept profils d'inscription + administrateur interne (D-K03, D-K10).
CREATE TYPE "role_kind" AS ENUM ('player', 'guardian', 'academy', 'club', 'federation', 'center', 'recruiter', 'admin');
CREATE TYPE "organization_type" AS ENUM ('academy', 'club', 'federation', 'center', 'recruiter', 'agency');
-- Graphe du §5.4.
CREATE TYPE "verification_status" AS ENUM ('declared', 'pending', 'in_review', 'verified', 'rejected', 'suspended');
CREATE TYPE "guardian_relationship" AS ENUM ('mother', 'father', 'legal_guardian', 'other');
CREATE TYPE "consent_type" AS ENUM ('terms_of_service', 'privacy_policy', 'guardian_data_processing', 'guardian_profile_publication');
CREATE TYPE "player_position" AS ENUM ('goalkeeper', 'centre_back', 'full_back', 'defensive_midfielder', 'central_midfielder', 'attacking_midfielder', 'winger', 'striker');
CREATE TYPE "dominant_foot" AS ENUM ('left', 'right', 'both');

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "status" "user_status" NOT NULL DEFAULT 'pending_verification',
    "totp_secret_encrypted" BYTEA,
    "totp_enabled_at" TIMESTAMPTZ(6),
    "email_verified_at" TIMESTAMPTZ(6),
    "phone_verified_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    -- Stocké en minuscules : l'unicité simple vaut unicité insensible à la casse.
    CONSTRAINT "users_email_check" CHECK ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+$' AND length("email") <= 254),
    CONSTRAINT "users_password_hash_check" CHECK ("password_hash" IS NULL OR "password_hash" ~ '^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$')
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "type" "organization_type" NOT NULL,
    "name" TEXT NOT NULL,
    "registration_number" TEXT,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "contact_email" TEXT,
    "verification_status" "verification_status" NOT NULL DEFAULT 'declared',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizations_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "organizations_name_check" CHECK (length(btrim("name")) BETWEEN 2 AND 200),
    CONSTRAINT "organizations_contact_email_check" CHECK ("contact_email" IS NULL OR ("contact_email" = lower("contact_email") AND "contact_email" ~ '^[^@\s]+@[^@\s]+$'))
);

CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "role" "role_kind" NOT NULL,
    "organization_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id"),
    -- Rôle d'organisation : rattachement obligatoire ; rôle personnel : aucun.
    CONSTRAINT "user_roles_organization_check" CHECK (
      ("role" IN ('academy', 'club', 'federation', 'center', 'recruiter')) = ("organization_id" IS NOT NULL)
    )
);
-- Un rôle personnel n'a pas d'organisation : NULLS NOT DISTINCT pour qu'il reste unique.
CREATE UNIQUE INDEX "user_roles_user_id_role_organization_id_key" ON "user_roles"("user_id", "role", "organization_id") NULLS NOT DISTINCT;
CREATE INDEX "user_roles_organization_id_idx" ON "user_roles"("organization_id");

CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "device_fingerprint" TEXT,
    "ip" INET,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sessions_refresh_token_hash_check" CHECK ("refresh_token_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "sessions_expires_at_check" CHECK ("expires_at" > "created_at"),
    -- IP tronquée (plan §6.2) : réseau /24 en IPv4, /48 en IPv6, partie hôte à zéro.
    CONSTRAINT "sessions_ip_check" CHECK (
      "ip" IS NULL OR (
        masklen("ip") = CASE family("ip") WHEN 4 THEN 24 ELSE 48 END
        AND host("ip") = host(network("ip"))
      )
    )
);
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

CREATE TABLE "guardians" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "relationship" "guardian_relationship" NOT NULL,
    "country" TEXT NOT NULL,
    "phone_encrypted" BYTEA,
    "phone_hmac" BYTEA,
    "email_encrypted" BYTEA,
    "email_hmac" BYTEA,
    "document_number_encrypted" BYTEA,
    "document_number_hmac" BYTEA,
    "verification_status" "verification_status" NOT NULL DEFAULT 'declared',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardians_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
    CONSTRAINT "guardians_name_check" CHECK (length(btrim("first_name")) BETWEEN 1 AND 100 AND length(btrim("last_name")) BETWEEN 1 AND 100),
    -- Valeur chiffrée et empreinte vont de pair.
    CONSTRAINT "guardians_encrypted_pairs_check" CHECK (
      ("phone_encrypted" IS NULL) = ("phone_hmac" IS NULL)
      AND ("email_encrypted" IS NULL) = ("email_hmac" IS NULL)
      AND ("document_number_encrypted" IS NULL) = ("document_number_hmac" IS NULL)
    )
);
CREATE INDEX "guardians_user_id_idx" ON "guardians"("user_id");
CREATE INDEX "guardians_document_number_hmac_idx" ON "guardians"("document_number_hmac");

CREATE TABLE "players" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID,
    "oz_id" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_date" DATE NOT NULL,
    "nationality" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "city" TEXT,
    "phone_encrypted" BYTEA,
    "phone_hmac" BYTEA,
    "document_number_encrypted" BYTEA,
    "document_number_hmac" BYTEA,
    "primary_position" "player_position",
    "secondary_position" "player_position",
    "dominant_foot" "dominant_foot",
    "height_cm" SMALLINT,
    "weight_kg" SMALLINT,
    "verification_status" "verification_status" NOT NULL DEFAULT 'declared',
    "guardian_id" UUID,
    "organization_id" UUID,
    "visibility" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id"),
    -- Format §5.3 avec alphabet Crockford sans I, L, O, U (TD-017) ; génération au lot 1.2.
    CONSTRAINT "players_oz_id_check" CHECK ("oz_id" ~ '^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$'),
    CONSTRAINT "players_country_check" CHECK ("country" ~ '^[A-Z]{2}$' AND "nationality" ~ '^[A-Z]{2}$'),
    CONSTRAINT "players_name_check" CHECK (length(btrim("first_name")) BETWEEN 1 AND 100 AND length(btrim("last_name")) BETWEEN 1 AND 100),
    CONSTRAINT "players_birth_date_check" CHECK ("birth_date" >= DATE '1900-01-01'),
    CONSTRAINT "players_height_cm_check" CHECK ("height_cm" BETWEEN 80 AND 230),
    CONSTRAINT "players_weight_kg_check" CHECK ("weight_kg" BETWEEN 15 AND 150),
    CONSTRAINT "players_visibility_check" CHECK (jsonb_typeof("visibility") = 'object'),
    CONSTRAINT "players_encrypted_pairs_check" CHECK (
      ("phone_encrypted" IS NULL) = ("phone_hmac" IS NULL)
      AND ("document_number_encrypted" IS NULL) = ("document_number_hmac" IS NULL)
    )
);
CREATE UNIQUE INDEX "players_user_id_key" ON "players"("user_id");
CREATE UNIQUE INDEX "players_oz_id_key" ON "players"("oz_id");
CREATE INDEX "players_guardian_id_idx" ON "players"("guardian_id");
CREATE INDEX "players_organization_id_idx" ON "players"("organization_id");
CREATE INDEX "players_document_number_hmac_idx" ON "players"("document_number_hmac");

CREATE TABLE "consents" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "type" "consent_type" NOT NULL,
    "text_version" TEXT NOT NULL,
    "player_id" UUID,
    "granted_by_user_id" UUID,
    "granted_by_guardian_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "consents_grantor_check" CHECK ("granted_by_user_id" IS NOT NULL OR "granted_by_guardian_id" IS NOT NULL),
    -- Un consentement parental est donné par un tuteur, jamais par le mineur lui-même, pour un mineur désigné.
    CONSTRAINT "consents_guardian_grantor_check" CHECK ("type"::text NOT LIKE 'guardian\_%' OR ("granted_by_guardian_id" IS NOT NULL AND "player_id" IS NOT NULL)),
    CONSTRAINT "consents_text_version_check" CHECK (length(btrim("text_version")) BETWEEN 1 AND 50),
    CONSTRAINT "consents_revoked_at_check" CHECK ("revoked_at" IS NULL OR "revoked_at" >= "granted_at")
);
CREATE INDEX "consents_player_id_idx" ON "consents"("player_id");
CREATE INDEX "consents_granted_by_user_id_idx" ON "consents"("granted_by_user_id");
CREATE INDEX "consents_granted_by_guardian_id_idx" ON "consents"("granted_by_guardian_id");

-- Clés étrangères
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "players" ADD CONSTRAINT "players_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_granted_by_guardian_id_fkey" FOREIGN KEY ("granted_by_guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consents" ADD CONSTRAINT "consents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Déclencheurs de règles métier
-- ---------------------------------------------------------------------------------------------

-- Âge minimal de 6 ans (EX-101 n° 4) : un CHECK ne peut pas dépendre de CURRENT_DATE.
CREATE FUNCTION oz_players_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.birth_date > (CURRENT_DATE - INTERVAL '6 years')::date THEN
    RAISE EXCEPTION 'un joueur doit avoir au moins 6 ans' USING ERRCODE = 'check_violation';
  END IF;
  -- OZ ID immuable une fois émis (CP-03) ; jamais réattribué : la ligne n'est jamais supprimée.
  IF TG_OP = 'UPDATE' AND OLD.oz_id IS NOT NULL AND NEW.oz_id IS DISTINCT FROM OLD.oz_id THEN
    RAISE EXCEPTION 'OZ ID immuable une fois émis' USING ERRCODE = 'check_violation';
  END IF;
  -- Un compte n'est pas le tuteur de son propre profil : sinon un mineur s'accorde le consentement parental.
  IF NEW.user_id IS NOT NULL AND NEW.guardian_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM guardians g WHERE g.id = NEW.guardian_id AND g.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'un joueur ne peut pas être son propre tuteur' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Consentement : horodaté côté serveur (CP-13), immuable, révocation définitive.
CREATE FUNCTION oz_consents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.granted_at := clock_timestamp();
    NEW.revoked_at := NULL;
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'consentement déjà révoqué : enregistrer un nouveau consentement' USING ERRCODE = 'check_violation';
  END IF;
  -- deleted_at compris : un consentement ne se masque pas, il se révoque.
  IF (NEW.type, NEW.text_version, NEW.player_id, NEW.granted_by_user_id, NEW.granted_by_guardian_id, NEW.granted_at,
      NEW.created_at, NEW.created_by, NEW.deleted_at)
     IS DISTINCT FROM
     (OLD.type, OLD.text_version, OLD.player_id, OLD.granted_by_user_id, OLD.granted_by_guardian_id, OLD.granted_at,
      OLD.created_at, OLD.created_by, OLD.deleted_at) THEN
    RAISE EXCEPTION 'consentement immuable : seule la révocation est possible' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    NEW.revoked_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;

-- Colonnes d'autorité (CP-07, revue du lot 1.1a) : sous un contexte utilisateur, ni statut de vérification,
-- ni OZ ID, ni titulaire, ni tuteur, ni organisation de rattachement ne se choisissent ou ne changent.
-- Ces écritures passeront par un chemin privilégié et journalisé (lots 1.2 à 1.4, DEBT D-059).
CREATE FUNCTION oz_guard_authority() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  me uuid := oz_current_user_id();
BEGIN
  IF me IS NULL THEN RETURN NEW; END IF;
  -- Une suppression logique est définitive pour l'utilisateur.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'colonne d''autorité deleted_at : restauration réservée au back-office' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_TABLE_NAME = 'users' THEN
    IF (TG_OP = 'INSERT' AND (NEW.status <> 'pending_verification' OR NEW.email_verified_at IS NOT NULL
          OR NEW.phone_verified_at IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.status, NEW.email_verified_at, NEW.phone_verified_at)
          IS DISTINCT FROM (OLD.status, OLD.email_verified_at, OLD.phone_verified_at)) THEN
      RAISE EXCEPTION 'colonne d''autorité de users non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'players' THEN
    IF (TG_OP = 'INSERT' AND (NEW.verification_status <> 'declared' OR NEW.oz_id IS NOT NULL
          OR NEW.organization_id IS NOT NULL OR (NEW.user_id IS NOT NULL AND NEW.user_id <> me)
          OR (NEW.guardian_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM guardians g WHERE g.id = NEW.guardian_id AND g.user_id = me AND g.deleted_at IS NULL))))
       OR (TG_OP = 'UPDATE' AND (NEW.verification_status, NEW.oz_id, NEW.organization_id, NEW.user_id, NEW.guardian_id, NEW.birth_date)
          IS DISTINCT FROM (OLD.verification_status, OLD.oz_id, OLD.organization_id, OLD.user_id, OLD.guardian_id, OLD.birth_date))
       -- Identité certifiée : figée dès que la vérification a commencé (la date de naissance, toujours).
       OR (TG_OP = 'UPDATE' AND OLD.verification_status <> 'declared'
          AND (NEW.first_name, NEW.last_name, NEW.nationality, NEW.document_number_encrypted, NEW.document_number_hmac)
          IS DISTINCT FROM (OLD.first_name, OLD.last_name, OLD.nationality, OLD.document_number_encrypted, OLD.document_number_hmac)) THEN
      RAISE EXCEPTION 'colonne d''autorité de players non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'guardians' THEN
    IF (TG_OP = 'INSERT' AND NEW.verification_status <> 'declared')
       OR (TG_OP = 'UPDATE' AND (NEW.verification_status, NEW.user_id) IS DISTINCT FROM (OLD.verification_status, OLD.user_id))
       OR (TG_OP = 'UPDATE' AND OLD.verification_status <> 'declared'
          AND (NEW.first_name, NEW.last_name, NEW.document_number_encrypted, NEW.document_number_hmac)
          IS DISTINCT FROM (OLD.first_name, OLD.last_name, OLD.document_number_encrypted, OLD.document_number_hmac)) THEN
      RAISE EXCEPTION 'colonne d''autorité de guardians non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Une nouvelle adresse n'est pas vérifiée, sauf si la même requête (chemin privilégié) pose sa vérification.
CREATE FUNCTION oz_reset_email_verification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email_verified_at IS NOT DISTINCT FROM OLD.email_verified_at THEN
    NEW.email_verified_at := NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "users_guard_authority" BEFORE INSERT OR UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION oz_guard_authority();
-- Nommé après users_guard_authority : les déclencheurs BEFORE s'exécutent par ordre alphabétique.
CREATE TRIGGER "users_reset_email_verification" BEFORE UPDATE OF "email" ON "users" FOR EACH ROW EXECUTE FUNCTION oz_reset_email_verification();
CREATE TRIGGER "players_guard_authority" BEFORE INSERT OR UPDATE ON "players" FOR EACH ROW EXECUTE FUNCTION oz_guard_authority();
CREATE TRIGGER "guardians_guard_authority" BEFORE INSERT OR UPDATE ON "guardians" FOR EACH ROW EXECUTE FUNCTION oz_guard_authority();
CREATE TRIGGER "players_guard" BEFORE INSERT OR UPDATE ON "players" FOR EACH ROW EXECUTE FUNCTION oz_players_guard();
CREATE TRIGGER "consents_guard" BEFORE INSERT OR UPDATE ON "consents" FOR EACH ROW EXECUTE FUNCTION oz_consents_guard();

CREATE TRIGGER "users_set_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "organizations_set_updated_at" BEFORE UPDATE ON "organizations" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "user_roles_set_updated_at" BEFORE UPDATE ON "user_roles" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "sessions_set_updated_at" BEFORE UPDATE ON "sessions" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "guardians_set_updated_at" BEFORE UPDATE ON "guardians" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "players_set_updated_at" BEFORE UPDATE ON "players" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "consents_set_updated_at" BEFORE UPDATE ON "consents" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();

CREATE TRIGGER "users_forbid_delete" BEFORE DELETE ON "users" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "organizations_forbid_delete" BEFORE DELETE ON "organizations" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "guardians_forbid_delete" BEFORE DELETE ON "guardians" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "players_forbid_delete" BEFORE DELETE ON "players" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "consents_forbid_delete" BEFORE DELETE ON "consents" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "users_forbid_truncate" BEFORE TRUNCATE ON "users" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "organizations_forbid_truncate" BEFORE TRUNCATE ON "organizations" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "guardians_forbid_truncate" BEFORE TRUNCATE ON "guardians" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "players_forbid_truncate" BEFORE TRUNCATE ON "players" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "consents_forbid_truncate" BEFORE TRUNCATE ON "consents" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();

-- ---------------------------------------------------------------------------------------------
-- Journal d'audit (EX-T11, D4) : partitionné par mois, chaîné par SHA-256, immuable
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "audit_log" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    -- Valeurs par défaut factices, toujours remplacées par le déclencheur oz_audit_chain.
    "chain_position" BIGINT NOT NULL DEFAULT 0,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" UUID,
    "reason" TEXT NOT NULL,
    "request_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "prev_hash" BYTEA NOT NULL DEFAULT '',
    "hash" BYTEA NOT NULL DEFAULT '',
    -- transaction_timestamp() (= now()) : Prisma le laisse à la base, au lieu d'envoyer l'heure du client.
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT transaction_timestamp(),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id", "created_at"),
    CONSTRAINT "audit_log_action_check" CHECK ("action" ~ '^[a-z_]+\.[a-z_]+\.[a-z_]+$'),
    CONSTRAINT "audit_log_target_type_check" CHECK ("target_type" ~ '^[a-z_]+$'),
    CONSTRAINT "audit_log_reason_check" CHECK (length(btrim("reason")) BETWEEN 1 AND 1000),
    CONSTRAINT "audit_log_metadata_check" CHECK (jsonb_typeof("metadata") = 'object')
) PARTITION BY RANGE ("created_at");
CREATE INDEX "audit_log_chain_position_idx" ON "audit_log"("chain_position");
CREATE INDEX "audit_log_target_idx" ON "audit_log"("target_type", "target_id");
CREATE INDEX "audit_log_actor_user_id_idx" ON "audit_log"("actor_user_id");
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Tête de chaîne : une ligne unique, verrouillée à chaque insertion (sérialisation de la chaîne).
CREATE TABLE "audit_chain_state" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "last_position" BIGINT NOT NULL,
    "last_hash" BYTEA NOT NULL,

    CONSTRAINT "audit_chain_state_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_chain_state_singleton_check" CHECK ("id")
);
-- Origine de la chaîne : 32 octets nuls.
INSERT INTO "audit_chain_state" ("id", "last_position", "last_hash") VALUES (true, 0, '\x0000000000000000000000000000000000000000000000000000000000000000');

-- Contenu canonique haché : indépendant du fuseau de la session. Arguments scalaires : dans un
-- déclencheur, NEW a le type de la partition, pas celui de audit_log.
CREATE FUNCTION oz_audit_hash(
  p_prev_hash bytea, p_id uuid, p_position bigint, p_actor uuid, p_action text, p_target_type text,
  p_target_id uuid, p_reason text, p_request_id text, p_metadata jsonb, p_created_at timestamptz
) RETURNS bytea
LANGUAGE sql IMMUTABLE AS $$
  SELECT digest(
    p_prev_hash || convert_to(
      jsonb_build_array(
        p_id, p_position, p_actor, p_action, p_target_type, p_target_id, p_reason, p_request_id,
        p_metadata, to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
      )::text,
      'UTF8'
    ),
    'sha256'
  )
$$;

-- SECURITY DEFINER : le rôle applicatif n'a aucun droit sur la tête de chaîne, seul ce déclencheur l'écrit.
CREATE FUNCTION oz_audit_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  head audit_chain_state;
BEGIN
  -- Horodatage serveur : une valeur fournie est refusée (la ligne est déjà routée vers sa partition,
  -- un déclencheur ne peut pas la déplacer).
  IF NEW.created_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'horodatage du journal d''audit fourni par le client : refusé' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO head FROM audit_chain_state WHERE id FOR UPDATE;
  NEW.chain_position := head.last_position + 1;
  NEW.prev_hash := head.last_hash;
  NEW.hash := oz_audit_hash(NEW.prev_hash, NEW.id, NEW.chain_position, NEW.actor_user_id, NEW.action,
    NEW.target_type, NEW.target_id, NEW.reason, NEW.request_id, NEW.metadata, NEW.created_at);
  UPDATE audit_chain_state SET last_position = NEW.chain_position, last_hash = NEW.hash WHERE id;
  RETURN NEW;
END $$;

CREATE FUNCTION oz_audit_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'journal d''audit immuable : % refusé', TG_OP USING ERRCODE = 'restrict_violation';
END $$;

-- Première position en défaut (NULL si la chaîne est intègre) : hachages, continuité, tête de chaîne.
-- Droits de l'appelant : une vue partielle (RLS) produit un défaut, jamais un faux « intègre ».
CREATE FUNCTION oz_audit_verify_chain() RETURNS bigint
LANGUAGE plpgsql STABLE AS $$
DECLARE
  entry audit_log;
  expected_position bigint := 1;
  expected_prev bytea := '\x0000000000000000000000000000000000000000000000000000000000000000';
  head audit_chain_state;
BEGIN
  FOR entry IN SELECT * FROM audit_log ORDER BY chain_position LOOP
    IF entry.chain_position <> expected_position OR entry.prev_hash <> expected_prev
       OR entry.hash <> oz_audit_hash(entry.prev_hash, entry.id, entry.chain_position, entry.actor_user_id,
            entry.action, entry.target_type, entry.target_id, entry.reason, entry.request_id,
            entry.metadata, entry.created_at) THEN
      RETURN expected_position;
    END IF;
    expected_position := expected_position + 1;
    expected_prev := entry.hash;
  END LOOP;
  SELECT * INTO head FROM audit_chain_state WHERE id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tête de chaîne d''audit inaccessible : vérification impossible' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF head.last_position <> expected_position - 1 OR head.last_hash <> expected_prev THEN
    RETURN expected_position;
  END IF;
  RETURN NULL;
END $$;

-- Partitions du mois courant et des n suivants ; chacune protégée contre TRUNCATE (un TRUNCATE direct
-- d'une partition ne déclenche pas celui du parent). Idempotente ; planification mensuelle au lot 1.16.
CREATE FUNCTION oz_audit_ensure_partitions(months_ahead integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  month_start date;
  partition_name text;
BEGIN
  FOR i IN 0..months_ahead LOOP
    month_start := (date_trunc('month', (now() AT TIME ZONE 'UTC')) + make_interval(months => i))::date;
    partition_name := format('audit_log_%s', to_char(month_start, 'YYYY_MM'));
    IF to_regclass(partition_name) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        (month_start::timestamp AT TIME ZONE 'UTC'),
        ((month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'UTC')
      );
      EXECUTE format(
        'CREATE TRIGGER audit_log_forbid_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION oz_audit_immutable()',
        partition_name
      );
      -- La RLS du parent ne s'applique pas à une partition interrogée directement : forcée sans politique.
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', partition_name);
    END IF;
  END LOOP;
END $$;

CREATE TABLE "audit_log_default" PARTITION OF "audit_log" DEFAULT;
CREATE TRIGGER "audit_log_forbid_truncate" BEFORE TRUNCATE ON "audit_log_default" FOR EACH STATEMENT EXECUTE FUNCTION oz_audit_immutable();
ALTER TABLE "audit_log_default" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log_default" FORCE ROW LEVEL SECURITY;
SELECT oz_audit_ensure_partitions(3);

CREATE TRIGGER "audit_log_chain" BEFORE INSERT ON "audit_log" FOR EACH ROW EXECUTE FUNCTION oz_audit_chain();
CREATE TRIGGER "audit_log_immutable" BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION oz_audit_immutable();
CREATE TRIGGER "audit_log_forbid_truncate" BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION oz_audit_immutable();
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM PUBLIC;
REVOKE ALL ON "audit_chain_state" FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- Row Level Security (EX-101 n° 3, D3) : forcée, refus par défaut. Matrice des rôles au lot 1.4.
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_roles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardians" FORCE ROW LEVEL SECURITY;
ALTER TABLE "players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "players" FORCE ROW LEVEL SECURITY;
ALTER TABLE "consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;
-- Activée sans politique ni FORCE : invisible du rôle applicatif, écrite par le seul déclencheur propriétaire.
ALTER TABLE "audit_chain_state" ENABLE ROW LEVEL SECURITY;

-- Une ligne supprimée logiquement reste visible de son titulaire (PostgreSQL contrôle aussi la nouvelle
-- ligne d'un UPDATE avec la politique de lecture : la masquer interdirait la suppression logique) ; sa
-- restauration est refusée par oz_guard_authority, et un compte supprimé est refusé à la connexion (lot 1.3).
-- Les accès par rattachement (tuteur, organisation) ignorent les lignes supprimées.
-- Chacun son compte ; l'inscription pose d'abord son propre identifiant comme contexte.
CREATE POLICY "users_self" ON "users" FOR ALL
  USING ("id" = oz_current_user_id()) WITH CHECK ("id" = oz_current_user_id());
-- Ses rôles actifs en lecture seule : aucune attribution par soi-même (CP-07).
CREATE POLICY "user_roles_self_read" ON "user_roles" FOR SELECT
  USING ("user_id" = oz_current_user_id() AND "deleted_at" IS NULL);
CREATE POLICY "sessions_self" ON "sessions" FOR ALL
  USING ("user_id" = oz_current_user_id()) WITH CHECK ("user_id" = oz_current_user_id());
CREATE POLICY "organizations_member_read" ON "organizations" FOR SELECT
  USING ("deleted_at" IS NULL AND "id" IN (
    SELECT "organization_id" FROM "user_roles" WHERE "user_id" = oz_current_user_id() AND "deleted_at" IS NULL));
CREATE POLICY "guardians_self" ON "guardians" FOR ALL
  USING ("user_id" = oz_current_user_id()) WITH CHECK ("user_id" = oz_current_user_id());
-- Le titulaire du profil et son tuteur actif ; réattributions bloquées par oz_guard_authority.
CREATE POLICY "players_owner" ON "players" FOR ALL
  USING ("user_id" = oz_current_user_id() OR "guardian_id" IN (
    SELECT "id" FROM "guardians" WHERE "user_id" = oz_current_user_id() AND "deleted_at" IS NULL))
  WITH CHECK ("user_id" = oz_current_user_id() OR "guardian_id" IN (
    SELECT "id" FROM "guardians" WHERE "user_id" = oz_current_user_id() AND "deleted_at" IS NULL));
-- En son nom pour son propre profil, ou comme tuteur actif pour le mineur rattaché à ce tuteur.
CREATE POLICY "consents_grantor" ON "consents" FOR ALL
  USING ("granted_by_user_id" = oz_current_user_id() OR "granted_by_guardian_id" IN (
    SELECT "id" FROM "guardians" WHERE "user_id" = oz_current_user_id() AND "deleted_at" IS NULL))
  WITH CHECK (
    ("granted_by_guardian_id" IS NULL AND "granted_by_user_id" = oz_current_user_id()
      AND ("player_id" IS NULL OR "player_id" IN (SELECT "id" FROM "players" WHERE "user_id" = oz_current_user_id())))
    OR ("granted_by_guardian_id" IN (
          SELECT "id" FROM "guardians" WHERE "user_id" = oz_current_user_id() AND "deleted_at" IS NULL)
      AND ("granted_by_user_id" IS NULL OR "granted_by_user_id" = oz_current_user_id())
      AND ("player_id" IS NULL OR "player_id" IN (
        SELECT p."id" FROM "players" p WHERE p."guardian_id" = "consents"."granted_by_guardian_id")))
  );
-- Écriture au nom de l'utilisateur courant seulement ; lecture réservée au back-office (lot 1.16).
CREATE POLICY "audit_log_insert_self" ON "audit_log" FOR INSERT
  WITH CHECK (oz_current_user_id() IS NOT NULL AND "actor_user_id" = oz_current_user_id());
