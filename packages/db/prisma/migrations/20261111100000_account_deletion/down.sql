DROP FUNCTION oz_account_anonymize(uuid);
DROP FUNCTION oz_account_deletion_due(integer);
DROP FUNCTION oz_account_deletion_worker_only();
DROP FUNCTION oz_account_deletion_cancel();
DROP FUNCTION oz_account_deletion_request();
CREATE OR REPLACE FUNCTION oz_kyc_cases_guard() RETURNS trigger
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
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason_check";
-- Motif figé par la garde des sessions : suspendue le temps de la seule réécriture du motif.
ALTER TABLE "sessions" DISABLE TRIGGER "sessions_guard";
UPDATE "sessions" SET "revoked_reason" = 'revoked_by_user' WHERE "revoked_reason" = 'account_deleted';
ALTER TABLE "sessions" ENABLE TRIGGER "sessions_guard";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_reason_check" CHECK (
  "revoked_reason" IN ('rotated', 'logout', 'revoked_by_user', 'logout_all', 'reuse_detected',
    'password_reset', 'two_factor_changed')
);
DROP POLICY "notifications_privileged_update" ON "notifications";
DROP POLICY "kyc_cases_privileged_update" ON "kyc_cases";
DROP POLICY "guardians_privileged_update" ON "guardians";
DROP POLICY "user_roles_privileged_update" ON "user_roles";
DROP TABLE "account_deletion_requests";
