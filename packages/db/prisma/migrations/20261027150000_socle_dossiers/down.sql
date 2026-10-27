-- Annule 20261027150000_socle_dossiers (lot 1.1b).

ALTER FUNCTION oz_audit_ensure_partitions(integer) RESET search_path;
ALTER FUNCTION oz_audit_verify_chain() RESET search_path;
ALTER FUNCTION oz_blind_index(text, text) RESET search_path;
ALTER FUNCTION oz_decrypt(bytea, text) RESET search_path;
ALTER FUNCTION oz_encrypt(text, text) RESET search_path;
ALTER FUNCTION oz_players_guard() RESET search_path;
ALTER FUNCTION oz_guard_authority() RESET search_path;

DROP INDEX "players_first_name_trgm_idx";
DROP INDEX "players_last_name_trgm_idx";
DROP INDEX "players_search_vector_idx";
ALTER TABLE "players" DROP COLUMN "search_vector";
DROP FUNCTION oz_player_search_document(text, text, text, player_position);
DROP FUNCTION oz_unaccent(text);

ALTER TABLE "organizations" DROP CONSTRAINT "organizations_subscription_id_id_fkey";
ALTER TABLE "organizations" DROP COLUMN "subscription_id";

DROP TABLE "kyc_case_documents";
DROP TABLE "kyc_cases";
DROP TABLE "documents";
DROP TABLE "imports";
DROP TABLE "notifications";
DROP TABLE "subscriptions";

DROP FUNCTION oz_kyc_case_documents_guard();
DROP FUNCTION oz_documents_guard();
DROP FUNCTION oz_notification_payload_ok(jsonb);
DROP FUNCTION oz_kyc_cases_guard();

DROP TYPE "payment_provider";
DROP TYPE "subscription_status";
DROP TYPE "notification_status";
DROP TYPE "notification_channel";
DROP TYPE "import_status";
DROP TYPE "import_source";
DROP TYPE "kyc_status";
DROP TYPE "av_status";
DROP TYPE "document_type";
