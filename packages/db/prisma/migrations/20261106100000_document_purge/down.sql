-- Annule 20261106100000_document_purge (lot 1.9cb).

DROP FUNCTION oz_document_stale_pending(integer);
DROP FUNCTION oz_document_storage_orphans(text[]);
DROP FUNCTION oz_document_purge_finish(uuid);
DROP FUNCTION oz_document_purge_due(integer);
DROP FUNCTION oz_document_purgeable(documents);
DROP FUNCTION oz_document_read_recently(uuid);

-- Garde du lot 1.9ca, sans l'effacement des données extraites.
CREATE OR REPLACE FUNCTION oz_documents_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  cleaned boolean := OLD.av_status = 'pending' AND NEW.av_status = 'clean' AND oz_privileged()
    AND NEW.storage_key = 'clean/' || NEW.id::text;
BEGIN
  IF (NEW.type, NEW.player_id, NEW.guardian_id, NEW.organization_id, NEW.uploaded_by, NEW.mime_type, NEW.sha256)
     IS DISTINCT FROM (OLD.type, OLD.player_id, OLD.guardian_id, OLD.organization_id, OLD.uploaded_by, OLD.mime_type, OLD.sha256)
     OR (NOT cleaned AND (NEW.storage_key, NEW.size_bytes) IS DISTINCT FROM (OLD.storage_key, OLD.size_bytes)) THEN
    RAISE EXCEPTION 'sujet et contenu d''une pièce figés : déposer une nouvelle pièce' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.av_status, NEW.av_checked_at, NEW.rejection_reason, NEW.width, NEW.height, NEW.page_count,
      NEW.perceptual_hash)
     IS DISTINCT FROM (OLD.av_status, OLD.av_checked_at, OLD.rejection_reason, OLD.width, OLD.height,
      OLD.page_count, OLD.perceptual_hash)
     AND (OLD.av_status <> 'pending' OR NEW.av_status = 'pending' OR NOT oz_privileged()) THEN
    RAISE EXCEPTION 'verdict d''analyse définitif, écrit une seule fois' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.purged_at IS DISTINCT FROM OLD.purged_at
     AND (OLD.purged_at IS NOT NULL OR NOT oz_privileged()) THEN
    RAISE EXCEPTION 'purge d''une pièce définitive, posée une seule fois par le chemin privilégié'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP POLICY "audit_log_privileged_read_document_reads" ON "audit_log";
DROP POLICY "document_uploads_privileged_read" ON "document_uploads";

DROP INDEX "documents_purged_at_retention_until_idx";

-- Ce que l'ancienne version refuserait : l'empreinte seule d'une pièce purgée lui est retirée, un
-- rejet `too_large` devient `dimensions` (garde suspendue : verdict et purge sont définitifs).
ALTER TABLE "documents" DISABLE TRIGGER USER;
UPDATE "documents" SET "document_number_hmac" = NULL
  WHERE "purged_at" IS NOT NULL AND "document_number_encrypted" IS NULL
    AND "document_number_hmac" IS NOT NULL;
UPDATE "documents" SET "rejection_reason" = 'dimensions' WHERE "rejection_reason" = 'too_large';
ALTER TABLE "documents" ENABLE TRIGGER USER;
ALTER TABLE "documents" DROP CONSTRAINT "documents_encrypted_pairs_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_encrypted_pairs_check" CHECK (
    ("document_number_encrypted" IS NULL) = ("document_number_hmac" IS NULL));

ALTER TABLE "documents" DROP CONSTRAINT "documents_rejection_reason_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_rejection_reason_check" CHECK (
    ("av_status"::text = 'rejected') = ("rejection_reason" IS NOT NULL)
    AND ("rejection_reason" IS NULL
      OR "rejection_reason" IN ('dimensions', 'pages', 'unreadable', 'hash_mismatch')));
