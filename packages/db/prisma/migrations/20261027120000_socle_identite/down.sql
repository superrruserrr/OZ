-- Annule 20261027120000_socle_identite, dans l'ordre inverse. Les politiques, déclencheurs, index et
-- partitions disparaissent avec leurs tables.

-- La politique de lecture des organisations lit user_roles : elle tomberait avec, mais bloque son DROP.
DROP POLICY "organizations_member_read" ON "organizations";
DROP TABLE "audit_log";
DROP TABLE "audit_chain_state";
DROP TABLE "consents";
DROP TABLE "players";
DROP TABLE "guardians";
DROP TABLE "sessions";
DROP TABLE "user_roles";
DROP TABLE "organizations";
DROP TABLE "users";

DROP FUNCTION oz_audit_ensure_partitions(integer);
DROP FUNCTION oz_audit_verify_chain();
DROP FUNCTION oz_audit_immutable();
DROP FUNCTION oz_audit_chain();
DROP FUNCTION oz_audit_hash(bytea, uuid, bigint, uuid, text, text, uuid, text, text, jsonb, timestamptz);
DROP FUNCTION oz_consents_guard();
DROP FUNCTION oz_guard_authority();
DROP FUNCTION oz_reset_email_verification();
DROP FUNCTION oz_players_guard();

DROP TYPE "dominant_foot";
DROP TYPE "player_position";
DROP TYPE "consent_type";
DROP TYPE "guardian_relationship";
DROP TYPE "verification_status";
DROP TYPE "organization_type";
DROP TYPE "role_kind";
DROP TYPE "user_status";

DROP FUNCTION oz_blind_index(text, text);
DROP FUNCTION oz_decrypt(bytea, text);
DROP FUNCTION oz_encrypt(text, text);
DROP FUNCTION oz_check_key(text);
DROP FUNCTION oz_current_user_id();
DROP FUNCTION oz_forbid_delete();
DROP FUNCTION oz_set_updated_at();
