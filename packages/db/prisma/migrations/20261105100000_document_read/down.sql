-- Annule 20261105100000_document_read (lot 1.9ca).

-- Garde du lot 1.9b, sans `purged_at`.
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
  RETURN NEW;
END $$;

DROP FUNCTION oz_document_subject_live(uuid);

DROP POLICY "documents_admin_read" ON "documents";

ALTER TABLE "documents" DROP COLUMN "purged_at";
