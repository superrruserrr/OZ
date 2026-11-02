-- Annule 20261103100000_document_uploads (lot 1.9a).

DROP FUNCTION oz_reject_document_upload(uuid, text);
DROP FUNCTION oz_complete_document_upload(uuid, integer);
DROP TRIGGER "document_uploads_issued" ON "document_uploads";
DROP FUNCTION oz_document_upload_issued();

DROP POLICY "documents_privileged_insert" ON "documents";
CREATE POLICY "documents_subject_insert" ON "documents" FOR INSERT
  WITH CHECK ("uploaded_by" = oz_current_user_id()
    AND ("created_by" IS NULL OR "created_by" = oz_current_user_id()) AND "updated_by" IS NULL
    AND "av_status" = 'pending' AND "av_checked_at" IS NULL AND "ocr_extract_encrypted" IS NULL
    AND ("player_id" IN (SELECT "id" FROM "players")
      OR "guardian_id" IN (SELECT "id" FROM "guardians")
      OR "organization_id" IN (SELECT "id" FROM "organizations")));

DROP TABLE "document_uploads";
DROP TYPE "upload_status";
