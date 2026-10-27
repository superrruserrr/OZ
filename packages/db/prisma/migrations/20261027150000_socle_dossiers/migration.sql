-- Lot 1.1b — dossiers, opérations, recherche (EX-101, plan §5.2 ; décisions D2, D3, D6 du lot 1.1).
-- down.sql annule exactement ce qui suit. RLS, déclencheurs et fonctions sont écrits à la main (TD-002).

-- ---------------------------------------------------------------------------------------------
-- Énumérations
-- ---------------------------------------------------------------------------------------------

CREATE TYPE "document_type" AS ENUM ('birth_certificate', 'identity_document', 'photo', 'license', 'video', 'organization_registration');
CREATE TYPE "av_status" AS ENUM ('pending', 'clean', 'infected', 'error');
CREATE TYPE "kyc_status" AS ENUM ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'expired');
CREATE TYPE "import_source" AS ENUM ('csv', 'xlsx');
CREATE TYPE "import_status" AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE "notification_channel" AS ENUM ('email', 'sms', 'in_app');
CREATE TYPE "notification_status" AS ENUM ('queued', 'sent', 'failed', 'cancelled');
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');
CREATE TYPE "payment_provider" AS ENUM ('stripe', 'cinetpay', 'manual');

-- ---------------------------------------------------------------------------------------------
-- Documents (plan §5.2, §6.6) : métadonnées seulement, le fichier est dans le stockage objet
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "type" "document_type" NOT NULL,
    "player_id" UUID,
    "guardian_id" UUID,
    "organization_id" UUID,
    "uploaded_by" UUID NOT NULL,
    -- Clé d'objet, jamais une URL : les liens sont signés à la demande (§6.6).
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "av_status" "av_status" NOT NULL DEFAULT 'pending',
    "av_checked_at" TIMESTAMPTZ(6),
    -- Extraction OCR chiffrée : jamais utilisée seule pour décider (§5.2).
    "ocr_extract_encrypted" BYTEA,
    "document_number_encrypted" BYTEA,
    "document_number_hmac" BYTEA,
    "retention_until" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "documents_subject_check" CHECK (num_nonnulls("player_id", "guardian_id", "organization_id") = 1),
    CONSTRAINT "documents_storage_key_check" CHECK ("storage_key" ~ '^[a-z0-9][a-z0-9_.-]*(/[a-z0-9_.-]+)*$' AND length("storage_key") <= 512),
    CONSTRAINT "documents_mime_type_check" CHECK ("mime_type" ~ '^[a-z]+/[a-z0-9.+-]+$' AND length("mime_type") <= 100),
    CONSTRAINT "documents_size_bytes_check" CHECK ("size_bytes" BETWEEN 1 AND 52428800),
    CONSTRAINT "documents_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "documents_retention_until_check" CHECK ("retention_until" > "created_at"),
    CONSTRAINT "documents_encrypted_pairs_check" CHECK (("document_number_encrypted" IS NULL) = ("document_number_hmac" IS NULL))
);
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");
-- Documents recyclés : même fichier soumis pour plusieurs sujets (§6.10).
CREATE INDEX "documents_sha256_idx" ON "documents"("sha256");
CREATE INDEX "documents_document_number_hmac_idx" ON "documents"("document_number_hmac");
CREATE INDEX "documents_player_id_idx" ON "documents"("player_id");
CREATE INDEX "documents_guardian_id_idx" ON "documents"("guardian_id");
CREATE INDEX "documents_organization_id_idx" ON "documents"("organization_id");
CREATE INDEX "documents_uploaded_by_idx" ON "documents"("uploaded_by");

-- ---------------------------------------------------------------------------------------------
-- Dossiers KYC (plan §5.2, §5.4 ; CP-16)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "kyc_cases" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "player_id" UUID,
    "organization_id" UUID,
    "level" SMALLINT NOT NULL,
    "status" "kyc_status" NOT NULL DEFAULT 'draft',
    "checks" JSONB NOT NULL DEFAULT '[]',
    "submitted_at" TIMESTAMPTZ(6),
    "decided_by" UUID,
    "second_decided_by" UUID,
    "decision_reason" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "kyc_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "kyc_cases_subject_check" CHECK (num_nonnulls("player_id", "organization_id") = 1),
    CONSTRAINT "kyc_cases_level_check" CHECK ("level" BETWEEN 0 AND 3),
    CONSTRAINT "kyc_cases_checks_check" CHECK (jsonb_typeof("checks") = 'array'),
    -- Une décision est toujours attribuée, motivée et horodatée ; un brouillon n'en a aucune.
    CONSTRAINT "kyc_cases_decision_check" CHECK (
      "status" NOT IN ('approved', 'rejected')
      OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL AND "decision_reason" IS NOT NULL)),
    CONSTRAINT "kyc_cases_draft_check" CHECK (
      "status" <> 'draft' OR ("decided_by" IS NULL AND "second_decided_by" IS NULL AND "decided_at" IS NULL)),
    CONSTRAINT "kyc_cases_decision_reason_check" CHECK ("decision_reason" IS NULL OR length(btrim("decision_reason")) BETWEEN 1 AND 2000),
    -- Quatre yeux : deux administrateurs distincts (CP-16).
    CONSTRAINT "kyc_cases_second_decider_check" CHECK (
      "second_decided_by" IS NULL OR ("decided_by" IS NOT NULL AND "second_decided_by" <> "decided_by"))
);
CREATE INDEX "kyc_cases_player_id_idx" ON "kyc_cases"("player_id");
CREATE INDEX "kyc_cases_organization_id_idx" ON "kyc_cases"("organization_id");
CREATE INDEX "kyc_cases_status_idx" ON "kyc_cases"("status");

-- Pièces jointes à un dossier : elles concernent son sujet (ou le tuteur du joueur).
CREATE TABLE "kyc_case_documents" (
    "kyc_case_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "kyc_case_documents_pkey" PRIMARY KEY ("kyc_case_id", "document_id")
);
CREATE INDEX "kyc_case_documents_document_id_idx" ON "kyc_case_documents"("document_id");

-- ---------------------------------------------------------------------------------------------
-- Imports en masse (plan §5.2 ; CP-26)
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "imports" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "organization_id" UUID NOT NULL,
    "source" "import_source" NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "file_storage_key" TEXT,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "status" "import_status" NOT NULL DEFAULT 'pending',
    "rows_total" INTEGER NOT NULL DEFAULT 0,
    "rows_ok" INTEGER NOT NULL DEFAULT 0,
    "rows_rejected" INTEGER NOT NULL DEFAULT 0,
    "rows_duplicate" INTEGER NOT NULL DEFAULT 0,
    "report_key" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "imports_file_name_check" CHECK (length(btrim("file_name")) BETWEEN 1 AND 255),
    CONSTRAINT "imports_file_sha256_check" CHECK ("file_sha256" ~ '^[0-9a-f]{64}$'),
    -- Clés d'objet, jamais des URL (§6.6).
    CONSTRAINT "imports_storage_keys_check" CHECK (
      ("file_storage_key" IS NULL OR ("file_storage_key" ~ '^[a-z0-9][a-z0-9_.-]*(/[a-z0-9_.-]+)*$' AND length("file_storage_key") <= 512))
      AND ("report_key" IS NULL OR ("report_key" ~ '^[a-z0-9][a-z0-9_.-]*(/[a-z0-9_.-]+)*$' AND length("report_key") <= 512))),
    CONSTRAINT "imports_mapping_check" CHECK (jsonb_typeof("mapping") = 'object'),
    CONSTRAINT "imports_counters_check" CHECK (
      "rows_total" >= 0 AND "rows_ok" >= 0 AND "rows_rejected" >= 0 AND "rows_duplicate" >= 0
      AND "rows_ok" + "rows_rejected" + "rows_duplicate" <= "rows_total"),
    -- CP-26 : un import terminé a classé chacune de ses lignes.
    CONSTRAINT "imports_completed_check" CHECK (
      "status" <> 'completed' OR "rows_ok" + "rows_rejected" + "rows_duplicate" = "rows_total"),
    CONSTRAINT "imports_finished_at_check" CHECK ("finished_at" IS NULL OR ("started_at" IS NOT NULL AND "finished_at" >= "started_at"))
);
CREATE INDEX "imports_organization_id_idx" ON "imports"("organization_id");

-- ---------------------------------------------------------------------------------------------
-- Abonnements et notifications
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "organization_id" UUID NOT NULL,
    -- Paliers payants non arrêtés (requirements.md Q8) : identifiant libre, gratuit par défaut.
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" "subscription_status" NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "provider_reference" TEXT,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "quotas" JSONB NOT NULL DEFAULT '{}',
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_tier_check" CHECK ("tier" ~ '^[a-z][a-z0-9_]{0,49}$'),
    CONSTRAINT "subscriptions_period_check" CHECK ("period_end" > "period_start"),
    CONSTRAINT "subscriptions_quotas_check" CHECK (jsonb_typeof("quotas") = 'object'),
    CONSTRAINT "subscriptions_provider_reference_check" CHECK ("provider_reference" IS NULL OR length("provider_reference") BETWEEN 1 AND 255)
);
-- Cible de la clé étrangère composite de organizations : une organisation pointe sur SA souscription.
CREATE UNIQUE INDEX "subscriptions_id_organization_id_key" ON "subscriptions"("id", "organization_id");
-- Une seule souscription en cours par organisation.
CREATE UNIQUE INDEX "subscriptions_current_key" ON "subscriptions"("organization_id")
  WHERE "status" IN ('trialing', 'active', 'past_due') AND "deleted_at" IS NULL;
CREATE INDEX "subscriptions_organization_id_idx" ON "subscriptions"("organization_id");

ALTER TABLE "organizations" ADD COLUMN "subscription_id" UUID;

-- Charge d'une notification : identifiants seulement (clés `*_id`, valeurs UUID), à
-- plat. Le contenu est rendu à l'envoi depuis la base : aucune donnée personnelle ne dort dans la file.
CREATE FUNCTION oz_notification_payload_ok(payload jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT jsonb_typeof(payload) = 'object' AND NOT EXISTS (
    SELECT 1 FROM jsonb_each(payload) AS e(key, value)
    WHERE e.key !~ '^[a-z][a-z_]*_id$' OR jsonb_typeof(e.value) <> 'string'
      OR (e.value #>> '{}') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
$$;

CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "recipient_user_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "template" TEXT NOT NULL,
    -- Identifiants seulement : le contenu est rendu à l'envoi, depuis la base.
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "notification_status" NOT NULL DEFAULT 'queued',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_template_check" CHECK ("template" ~ '^[a-z_]+(\.[a-z_]+){1,3}$'),
    CONSTRAINT "notifications_payload_check" CHECK (oz_notification_payload_ok("payload")),
    CONSTRAINT "notifications_attempts_check" CHECK ("attempts" BETWEEN 0 AND 20),
    CONSTRAINT "notifications_sent_at_check" CHECK (("status" = 'sent') = ("sent_at" IS NOT NULL)),
    CONSTRAINT "notifications_last_error_check" CHECK ("last_error" IS NULL OR length("last_error") <= 2000)
);
CREATE INDEX "notifications_recipient_user_id_idx" ON "notifications"("recipient_user_id");
CREATE INDEX "notifications_status_scheduled_at_idx" ON "notifications"("status", "scheduled_at");

-- ---------------------------------------------------------------------------------------------
-- Clés étrangères
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "documents" ADD CONSTRAINT "documents_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_second_decided_by_fkey" FOREIGN KEY ("second_decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_case_documents" ADD CONSTRAINT "kyc_case_documents_kyc_case_id_fkey" FOREIGN KEY ("kyc_case_id") REFERENCES "kyc_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_case_documents" ADD CONSTRAINT "kyc_case_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kyc_case_documents" ADD CONSTRAINT "kyc_case_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imports" ADD CONSTRAINT "imports_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_subscription_id_id_fkey" FOREIGN KEY ("subscription_id", "id") REFERENCES "subscriptions"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Déclencheurs
-- ---------------------------------------------------------------------------------------------

-- CP-16 : décision KYC prise par des administrateurs actifs ; quatre yeux pour un mineur ou une
-- organisation sensible (recruteur, agence, centre). Fermé par défaut : un sujet ou un rôle
-- invisible (RLS) est un refus, jamais une validation simple.
CREATE FUNCTION oz_kyc_cases_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  sensitive boolean;
  decider uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Sujet figé dès la création : pièces et approbation ne se transportent pas vers un autre sujet.
    IF (NEW.player_id, NEW.organization_id) IS DISTINCT FROM (OLD.player_id, OLD.organization_id) THEN
      RAISE EXCEPTION 'sujet du dossier KYC figé : ouvrir un nouveau dossier' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'un dossier KYC soumis ne revient jamais en brouillon' USING ERRCODE = 'check_violation';
    END IF;
    -- Décision définitive : seule l'expiration d'une approbation reste possible (revérification §5.4).
    IF OLD.status IN ('approved', 'rejected', 'expired') AND (
         (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'approved' AND NEW.status = 'expired'))
         OR (NEW.level, NEW.checks, NEW.submitted_at, NEW.decided_by, NEW.second_decided_by, NEW.decision_reason, NEW.decided_at)
            IS DISTINCT FROM (OLD.level, OLD.checks, OLD.submitted_at, OLD.decided_by, OLD.second_decided_by, OLD.decision_reason, OLD.decided_at)) THEN
      RAISE EXCEPTION 'décision KYC définitive : ouvrir un nouveau dossier' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.status <> 'approved' AND NEW.decided_by IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW.decided_by, NEW.second_decided_by)
       IS NOT DISTINCT FROM (OLD.status, OLD.decided_by, OLD.second_decided_by) THEN
    RETURN NEW;
  END IF;
  FOREACH decider IN ARRAY array_remove(ARRAY[NEW.decided_by, NEW.second_decided_by], NULL) LOOP
    IF NOT EXISTS (SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id
                   WHERE r.user_id = decider AND r.role = 'admin' AND r.deleted_at IS NULL AND u.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'décision KYC réservée à un administrateur actif' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;
  IF NEW.status = 'approved' THEN
    IF NEW.player_id IS NOT NULL THEN
      SELECT p.birth_date > (CURRENT_DATE - INTERVAL '18 years')::date INTO sensitive
        FROM players p WHERE p.id = NEW.player_id;
    ELSE
      SELECT o.type IN ('recruiter', 'agency', 'center') INTO sensitive
        FROM organizations o WHERE o.id = NEW.organization_id;
    END IF;
    IF sensitive IS NULL THEN
      RAISE EXCEPTION 'sujet du dossier KYC introuvable : décision refusée' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF sensitive AND NEW.second_decided_by IS NULL THEN
      RAISE EXCEPTION 'dossier sensible : deux administrateurs distincts doivent l''approuver (CP-16)' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Une pièce jointe concerne le sujet du dossier, ou le tuteur du joueur concerné.
CREATE FUNCTION oz_kyc_case_documents_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM kyc_cases k WHERE k.id = NEW.kyc_case_id AND k.status = 'draft') THEN
    RAISE EXCEPTION 'pièces jointes seulement à un dossier KYC en brouillon' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM kyc_cases k JOIN documents d ON d.id = NEW.document_id
    WHERE k.id = NEW.kyc_case_id AND (
      d.player_id = k.player_id
      OR d.organization_id = k.organization_id
      OR d.guardian_id = (SELECT p.guardian_id FROM players p WHERE p.id = k.player_id))
  ) THEN
    RAISE EXCEPTION 'la pièce jointe ne concerne pas le sujet du dossier KYC' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- Sujet et contenu d'une pièce figés : un dossier qui la cite cite toujours le même fichier.
CREATE FUNCTION oz_documents_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.type, NEW.player_id, NEW.guardian_id, NEW.organization_id, NEW.uploaded_by, NEW.storage_key, NEW.mime_type, NEW.size_bytes, NEW.sha256)
     IS DISTINCT FROM (OLD.type, OLD.player_id, OLD.guardian_id, OLD.organization_id, OLD.uploaded_by, OLD.storage_key, OLD.mime_type, OLD.size_bytes, OLD.sha256) THEN
    RAISE EXCEPTION 'sujet et contenu d''une pièce figés : déposer une nouvelle pièce' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "documents_guard" BEFORE UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION oz_documents_guard();
CREATE TRIGGER "kyc_cases_guard" BEFORE INSERT OR UPDATE ON "kyc_cases" FOR EACH ROW EXECUTE FUNCTION oz_kyc_cases_guard();
CREATE TRIGGER "kyc_case_documents_guard" BEFORE INSERT OR UPDATE ON "kyc_case_documents" FOR EACH ROW EXECUTE FUNCTION oz_kyc_case_documents_guard();

CREATE TRIGGER "documents_set_updated_at" BEFORE UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "kyc_cases_set_updated_at" BEFORE UPDATE ON "kyc_cases" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "imports_set_updated_at" BEFORE UPDATE ON "imports" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "subscriptions_set_updated_at" BEFORE UPDATE ON "subscriptions" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();
CREATE TRIGGER "notifications_set_updated_at" BEFORE UPDATE ON "notifications" FOR EACH ROW EXECUTE FUNCTION oz_set_updated_at();

CREATE TRIGGER "documents_forbid_delete" BEFORE DELETE ON "documents" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "kyc_cases_forbid_delete" BEFORE DELETE ON "kyc_cases" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "kyc_case_documents_forbid_delete" BEFORE DELETE ON "kyc_case_documents" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "documents_forbid_truncate" BEFORE TRUNCATE ON "documents" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "kyc_cases_forbid_truncate" BEFORE TRUNCATE ON "kyc_cases" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "kyc_case_documents_forbid_truncate" BEFORE TRUNCATE ON "kyc_case_documents" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();

-- ---------------------------------------------------------------------------------------------
-- Recherche (EX-101 n° 6) : plein texte et floue, insensible aux accents
-- ---------------------------------------------------------------------------------------------

-- Dictionnaire explicite et schéma qualifié : résultat indépendant du search_path, donc IMMUTABLE.
CREATE FUNCTION oz_unaccent(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, value)
$$;

-- Document indexé d'un joueur : nom, prénom, ville, poste. Libellés d'énumération figés (jamais
-- renommés) : la fonction est déclarée IMMUTABLE pour servir de colonne générée.
CREATE FUNCTION oz_player_search_document(p_first_name text, p_last_name text, p_city text, p_position player_position)
RETURNS tsvector
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('simple'::regconfig, lower(public.oz_unaccent(concat_ws(' ', p_first_name, p_last_name, p_city, p_position::text))))
$$;

ALTER TABLE "players" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (oz_player_search_document("first_name", "last_name", "city", "primary_position")) STORED;
CREATE INDEX "players_search_vector_idx" ON "players" USING GIN ("search_vector");
CREATE INDEX "players_last_name_trgm_idx" ON "players" USING GIN (lower(oz_unaccent("last_name")) gin_trgm_ops);
CREATE INDEX "players_first_name_trgm_idx" ON "players" USING GIN (lower(oz_unaccent("first_name")) gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security (D3) : refus par défaut ; chaque politique s'appuie sur la RLS des sujets
-- (un sous-select sur players ne rend que les joueurs visibles de l'utilisateur courant).
-- ---------------------------------------------------------------------------------------------

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "kyc_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_cases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "kyc_case_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_case_documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" FORCE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;

-- Pièces de ses sujets actuels (un tuteur remplacé ou un ancien membre ne les lit plus) ; dépôt en son nom, statut antivirus et extraction laissés au système.
-- Aucune politique UPDATE ni DELETE : analyse, OCR et purge passent par le chemin privilégié (D-059).
CREATE POLICY "documents_subject_read" ON "documents" FOR SELECT
  USING ("player_id" IN (SELECT "id" FROM "players")
    OR "guardian_id" IN (SELECT "id" FROM "guardians")
    OR "organization_id" IN (SELECT "id" FROM "organizations"));
CREATE POLICY "documents_subject_insert" ON "documents" FOR INSERT
  WITH CHECK ("uploaded_by" = oz_current_user_id()
    AND ("created_by" IS NULL OR "created_by" = oz_current_user_id()) AND "updated_by" IS NULL
    AND "av_status" = 'pending' AND "av_checked_at" IS NULL AND "ocr_extract_encrypted" IS NULL
    AND ("player_id" IN (SELECT "id" FROM "players")
      OR "guardian_id" IN (SELECT "id" FROM "guardians")
      OR "organization_id" IN (SELECT "id" FROM "organizations")));

-- Brouillon seulement : soumission, contrôles et décisions passent par le chemin privilégié (D-059).
CREATE POLICY "kyc_cases_subject_read" ON "kyc_cases" FOR SELECT
  USING ("player_id" IN (SELECT "id" FROM "players") OR "organization_id" IN (SELECT "id" FROM "organizations"));
CREATE POLICY "kyc_cases_subject_insert" ON "kyc_cases" FOR INSERT
  WITH CHECK (("player_id" IN (SELECT "id" FROM "players") OR "organization_id" IN (SELECT "id" FROM "organizations"))
    AND ("created_by" IS NULL OR "created_by" = oz_current_user_id()) AND "updated_by" IS NULL
    AND "status" = 'draft' AND "checks" = '[]'::jsonb AND "submitted_at" IS NULL
    AND "decided_by" IS NULL AND "second_decided_by" IS NULL AND "decided_at" IS NULL AND "decision_reason" IS NULL);

CREATE POLICY "kyc_case_documents_subject_read" ON "kyc_case_documents" FOR SELECT
  USING ("kyc_case_id" IN (SELECT "id" FROM "kyc_cases"));
CREATE POLICY "kyc_case_documents_draft_insert" ON "kyc_case_documents" FOR INSERT
  WITH CHECK ("kyc_case_id" IN (SELECT "id" FROM "kyc_cases" WHERE "status" = 'draft')
    AND "document_id" IN (SELECT "id" FROM "documents")
    AND ("created_by" IS NULL OR "created_by" = oz_current_user_id()));

-- Un membre de l'organisation lit ses imports et en lance un ; le traitement appartient au système.
CREATE POLICY "imports_member_read" ON "imports" FOR SELECT
  USING ("organization_id" IN (SELECT "id" FROM "organizations"));
CREATE POLICY "imports_member_insert" ON "imports" FOR INSERT
  WITH CHECK ("created_by" = oz_current_user_id() AND "updated_by" IS NULL
    AND "organization_id" IN (SELECT "id" FROM "organizations")
    AND "status" = 'pending' AND "rows_total" = 0 AND "rows_ok" = 0 AND "rows_rejected" = 0
    AND "rows_duplicate" = 0 AND "report_key" IS NULL AND "started_at" IS NULL AND "finished_at" IS NULL);

CREATE POLICY "subscriptions_member_read" ON "subscriptions" FOR SELECT
  USING ("organization_id" IN (SELECT "id" FROM "organizations"));

CREATE POLICY "notifications_recipient_read" ON "notifications" FOR SELECT
  USING ("recipient_user_id" = oz_current_user_id());

-- ---------------------------------------------------------------------------------------------
-- Restauration (pg_dump pose un search_path vide) : les fonctions du lot 1.1a qui citent des tables
-- ou d'autres fonctions sans schéma reçoivent un search_path fixe.
-- ---------------------------------------------------------------------------------------------

ALTER FUNCTION oz_guard_authority() SET search_path = public, pg_temp;
ALTER FUNCTION oz_players_guard() SET search_path = public, pg_temp;
ALTER FUNCTION oz_encrypt(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION oz_decrypt(bytea, text) SET search_path = public, pg_temp;
ALTER FUNCTION oz_blind_index(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION oz_audit_verify_chain() SET search_path = public, pg_temp;
ALTER FUNCTION oz_audit_ensure_partitions(integer) SET search_path = public, pg_temp;
