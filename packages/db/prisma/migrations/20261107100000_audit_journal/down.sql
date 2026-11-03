-- Annule 20261107100000_audit_journal (lot 1.16a).

DROP FUNCTION oz_audit_check(bigint, bytea);
DROP FUNCTION oz_audit_head();
DROP FUNCTION oz_audit_maintain_partitions();
GRANT EXECUTE ON FUNCTION oz_audit_ensure_partitions(integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION oz_audit_verify_chain() TO PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    REVOKE EXECUTE ON FUNCTION oz_has_verified_role(role_kind[]) FROM oz_worker;
  END IF;
END $$;

DROP TABLE "audit_chain_checks";

DROP INDEX "audit_log_action_chain_position_idx";
DROP POLICY "audit_log_admin_read" ON "audit_log";
DROP POLICY "audit_log_privileged_read" ON "audit_log";
DROP POLICY "audit_log_default_privileged_read" ON "audit_log_default";
CREATE POLICY "audit_log_privileged_read_document_reads" ON "audit_log" FOR SELECT
  USING (oz_privileged() AND "action" = 'document.read.granted');
