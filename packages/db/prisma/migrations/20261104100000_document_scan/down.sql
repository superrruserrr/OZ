-- Annule 20261104100000_document_scan (lot 1.9b).

DROP FUNCTION oz_document_scan_finish(uuid, text, text, bigint, integer, integer, integer, bigint, text);
DROP FUNCTION oz_document_scan_claim(uuid);

CREATE OR REPLACE FUNCTION oz_documents_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.type, NEW.player_id, NEW.guardian_id, NEW.organization_id, NEW.uploaded_by, NEW.storage_key, NEW.mime_type, NEW.size_bytes, NEW.sha256)
     IS DISTINCT FROM (OLD.type, OLD.player_id, OLD.guardian_id, OLD.organization_id, OLD.uploaded_by, OLD.storage_key, OLD.mime_type, OLD.size_bytes, OLD.sha256) THEN
    RAISE EXCEPTION 'sujet et contenu d''une pièce figés : déposer une nouvelle pièce' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TABLE "document_duplicates";

DROP POLICY "documents_privileged_update" ON "documents";
DROP POLICY "documents_privileged_read" ON "documents";

ALTER TABLE "documents"
  DROP CONSTRAINT "documents_clean_key_check",
  DROP CONSTRAINT "documents_perceptual_hash_check",
  DROP CONSTRAINT "documents_page_count_check",
  DROP CONSTRAINT "documents_dimensions_check",
  DROP CONSTRAINT "documents_rejection_reason_check",
  DROP COLUMN "perceptual_hash",
  DROP COLUMN "page_count",
  DROP COLUMN "height",
  DROP COLUMN "width",
  DROP COLUMN "rejection_reason";

-- Une valeur d'énumération ne se retire pas : le type est recréé. Un document rejeté redevient
-- `error` (jamais accessible, comme avant le lot 1.9b) ; déclencheurs de ligne suspendus le temps
-- de cette reprise (la garde fige le verdict).
ALTER TABLE "documents" DISABLE TRIGGER USER;
UPDATE "documents" SET "av_status" = 'error' WHERE "av_status"::text = 'rejected';
ALTER TABLE "documents" ENABLE TRIGGER USER;
ALTER TYPE "av_status" RENAME TO "av_status_1_9b";
CREATE TYPE "av_status" AS ENUM ('pending', 'clean', 'infected', 'error');
ALTER TABLE "documents" ALTER COLUMN "av_status" DROP DEFAULT;
ALTER TABLE "documents" ALTER COLUMN "av_status" TYPE "av_status" USING "av_status"::text::"av_status";
ALTER TABLE "documents" ALTER COLUMN "av_status" SET DEFAULT 'pending';
DROP TYPE "av_status_1_9b";
