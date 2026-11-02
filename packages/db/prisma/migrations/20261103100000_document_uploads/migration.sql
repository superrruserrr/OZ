-- Intentions de dépôt de documents (lot 1.9a, EX-110 n° 1) : une URL signée de 5 minutes, à usage
-- unique, par intention. L'utilisateur crée l'intention sous sa RLS (cible qu'il voit) ; la réception
-- et le rejet passent par des fonctions SECURITY DEFINER dédiées (chemin privilégié, D-059), qui
-- contrôlent elles-mêmes l'appelant et écrivent le journal d'audit dans la même transaction.

CREATE TYPE "upload_status" AS ENUM ('issued', 'completed', 'rejected', 'expired');

CREATE TABLE "document_uploads" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "requested_by" UUID NOT NULL,
    "document_type" "document_type" NOT NULL,
    "player_id" UUID,
    "guardian_id" UUID,
    "organization_id" UUID,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "upload_status" NOT NULL DEFAULT 'issued',
    "expires_at" TIMESTAMPTZ(6) NOT NULL DEFAULT (now() + interval '5 minutes'),
    "completed_at" TIMESTAMPTZ(6),
    "document_id" UUID,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "document_uploads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_uploads_one_target_check"
      CHECK (num_nonnulls("player_id", "guardian_id", "organization_id") = 1),
    CONSTRAINT "document_uploads_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    -- 50 Mo par fichier (requirements §270).
    CONSTRAINT "document_uploads_size_check" CHECK ("size_bytes" BETWEEN 1 AND 52428800),
    CONSTRAINT "document_uploads_content_type_check"
      CHECK ("content_type" ~ '^[a-z]+/[a-z0-9][a-z0-9.+-]*$'),
    CONSTRAINT "document_uploads_expires_at_check" CHECK ("expires_at" > "created_at"),
    CONSTRAINT "document_uploads_reject_reason_check"
      CHECK ("reject_reason" IS NULL OR "reject_reason" IN ('size_mismatch', 'type_mismatch')),
    -- Le statut et ses traces vont ensemble : un document seulement si réceptionné, un motif seulement si rejeté.
    CONSTRAINT "document_uploads_status_check" CHECK (
      ("status" = 'completed') = ("document_id" IS NOT NULL AND "completed_at" IS NOT NULL)
      AND ("status" = 'rejected') = ("reject_reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "document_uploads_document_id_key" ON "document_uploads"("document_id");
CREATE INDEX "document_uploads_requested_by_created_at_idx" ON "document_uploads"("requested_by", "created_at");
CREATE INDEX "document_uploads_status_expires_at_idx" ON "document_uploads"("status", "expires_at");
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_uploads" ADD CONSTRAINT "document_uploads_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "document_uploads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_uploads" FORCE ROW LEVEL SECURITY;

-- Le demandeur lit ses intentions ; personne d'autre.
CREATE POLICY "document_uploads_owner_read" ON "document_uploads" FOR SELECT
  USING ("requested_by" = (SELECT oz_current_user_id()));
-- Création en son nom, sur une cible qu'on voit (mêmes sujets que `documents_subject_insert`), à
-- l'état initial et pour 5 minutes au plus. Les droits par relation sont décidés par CASL (lot 1.4).
CREATE POLICY "document_uploads_owner_insert" ON "document_uploads" FOR INSERT
  WITH CHECK ("requested_by" = (SELECT oz_current_user_id())
    AND "status" = 'issued' AND "completed_at" IS NULL AND "document_id" IS NULL AND "reject_reason" IS NULL
    AND "expires_at" <= now() + interval '5 minutes'
    AND ("player_id" IN (SELECT "id" FROM "players")
      OR "guardian_id" IN (SELECT "id" FROM "guardians")
      OR "organization_id" IN (SELECT "id" FROM "organizations")));
-- Transitions d'état : chemin privilégié seulement (verrou de ligne compris). Aucune suppression.
CREATE POLICY "document_uploads_privileged_update" ON "document_uploads" FOR UPDATE
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Le document `pending` naît de la réception, par le chemin privilégié.
CREATE POLICY "documents_privileged_insert" ON "documents" FOR INSERT WITH CHECK (oz_privileged());
-- Plus aucun dépôt direct sous contexte utilisateur : la seule voie est l'intention puis la
-- réception (`oz_complete_document_upload`), qui fixe elle-même la clé de stockage.
DROP POLICY "documents_subject_insert" ON "documents";

-- ---------------------------------------------------------------------------------------------
-- Journal : chaque intention émise est inscrite dans la transaction qui la crée.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_document_upload_issued() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NEW.requested_by, 'document.upload.issued', 'document_upload', NEW.id,
    'Intention de dépôt émise',
    jsonb_build_object('document_type', NEW.document_type, 'content_type', NEW.content_type,
      'size_bytes', NEW.size_bytes, 'player_id', NEW.player_id, 'guardian_id', NEW.guardian_id,
      'organization_id', NEW.organization_id));
  RETURN NULL;
END $$;
CREATE TRIGGER "document_uploads_issued" AFTER INSERT ON "document_uploads"
  FOR EACH ROW EXECUTE FUNCTION oz_document_upload_issued();

-- ---------------------------------------------------------------------------------------------
-- Réception (D2, D6) : une seule fois, avant échéance, par le demandeur. Crée le document `pending`
-- dont l'objet est rangé en `quarantine/<id>` ; l'API l'y déplace dans la même transaction.
-- Le verrou de ligne sérialise deux réceptions concurrentes : la seconde trouve `completed`.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_complete_document_upload(p_upload uuid, p_retention_days integer)
RETURNS TABLE (outcome text, document_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  up document_uploads%ROWTYPE;
  doc uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'réception d''un dépôt : contexte utilisateur requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_retention_days IS NULL OR p_retention_days NOT BETWEEN 1 AND 3650 THEN
    RAISE EXCEPTION 'durée de conservation hors bornes' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO up FROM document_uploads u WHERE u.id = p_upload AND u.requested_by = me FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid; RETURN;
  END IF;
  IF up.status <> 'issued' THEN
    RETURN QUERY SELECT 'already_used'::text, NULL::uuid; RETURN;
  END IF;
  IF up.expires_at <= now() THEN
    UPDATE document_uploads SET status = 'expired' WHERE id = up.id;
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
    VALUES (me, 'document.upload.expired', 'document_upload', up.id, 'Réception après l''échéance');
    RETURN QUERY SELECT 'expired'::text, NULL::uuid; RETURN;
  END IF;

  doc := oz_uuid_v7();
  INSERT INTO documents (id, type, player_id, guardian_id, organization_id, uploaded_by, created_by,
    storage_key, mime_type, size_bytes, sha256, retention_until)
  VALUES (doc, up.document_type, up.player_id, up.guardian_id, up.organization_id, me, me,
    'quarantine/' || doc::text, up.content_type, up.size_bytes, up.sha256,
    now() + make_interval(days => p_retention_days));
  UPDATE document_uploads SET status = 'completed', completed_at = now(), document_id = doc
  WHERE id = up.id;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'document.upload.completed', 'document_upload', up.id, 'Dépôt réceptionné, analyse en attente',
    jsonb_build_object('document_id', doc));
  RETURN QUERY SELECT 'completed'::text, doc;
END $$;

-- Rejet à la réception (taille ou type réel non conformes) : une seule fois, par le demandeur.
CREATE FUNCTION oz_reject_document_upload(p_upload uuid, p_reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  rejected uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'rejet d''un dépôt : contexte utilisateur requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('size_mismatch', 'type_mismatch') THEN
    RAISE EXCEPTION 'motif de rejet inconnu' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE document_uploads SET status = 'rejected', reject_reason = p_reason
  WHERE id = p_upload AND requested_by = me AND status = 'issued'
  RETURNING id INTO rejected;
  IF rejected IS NULL THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (me, 'document.upload.rejected', 'document_upload', rejected, p_reason);
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution (convention D-066).
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_document_upload_issued() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_complete_document_upload(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_reject_document_upload(uuid, text) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_complete_document_upload(uuid, integer) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_reject_document_upload(uuid, text) TO oz_app;
  END IF;
END $$;
