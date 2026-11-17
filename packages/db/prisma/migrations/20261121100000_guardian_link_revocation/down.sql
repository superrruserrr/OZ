-- Retour arrière du lot 1.7bc (C6) : fonction de retrait, colonnes et motif retirés. Un dépôt déjà
-- retiré redevient `withdrawn` (sa décision reste datée). La valeur `revoked` de l'énumération reste
-- (PostgreSQL ne retire pas une valeur d'énumération) ; plus rien ne la pose.
DROP FUNCTION oz_guardian_link_revoke(uuid, text, interval);
ALTER TABLE "guardian_link_reviews" DROP CONSTRAINT "guardian_link_reviews_revocation_check";
ALTER TABLE "guardian_link_reviews" DROP CONSTRAINT "guardian_link_reviews_decision_check";
UPDATE "guardian_link_reviews" SET "status" = 'withdrawn', "decided_at" = NULL
  WHERE "status"::text = 'revoked';
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_decision_check"
  CHECK (("status" IN ('approved', 'rejected')) = ("decided_at" IS NOT NULL));
ALTER TABLE "guardian_link_reviews" DROP CONSTRAINT "guardian_link_reviews_revoked_by_fkey";
ALTER TABLE "guardian_link_reviews" DROP COLUMN "revoked_at", DROP COLUMN "revoked_by",
  DROP COLUMN "revocation_reason";
DROP TYPE "guardian_link_revocation_reason";
