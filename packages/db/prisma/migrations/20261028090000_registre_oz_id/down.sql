-- Annule 20261028090000_registre_oz_id (lot 1.2).

DROP FUNCTION oz_issue_oz_id(uuid, text);
DROP POLICY "oz_id_registry_privileged" ON "oz_id_registry";
DROP POLICY "players_privileged" ON "players";

CREATE OR REPLACE FUNCTION oz_guard_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
BEGIN
  IF me IS NULL THEN RETURN NEW; END IF;
  -- Une suppression logique est définitive pour l'utilisateur.
  IF TG_OP = 'UPDATE' AND OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    RAISE EXCEPTION 'colonne d''autorité deleted_at : restauration réservée au back-office' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_TABLE_NAME = 'users' THEN
    IF (TG_OP = 'INSERT' AND (NEW.status <> 'pending_verification' OR NEW.email_verified_at IS NOT NULL
          OR NEW.phone_verified_at IS NOT NULL))
       OR (TG_OP = 'UPDATE' AND (NEW.status, NEW.email_verified_at, NEW.phone_verified_at)
          IS DISTINCT FROM (OLD.status, OLD.email_verified_at, OLD.phone_verified_at)) THEN
      RAISE EXCEPTION 'colonne d''autorité de users non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'players' THEN
    IF (TG_OP = 'INSERT' AND (NEW.verification_status <> 'declared' OR NEW.oz_id IS NOT NULL
          OR NEW.organization_id IS NOT NULL OR (NEW.user_id IS NOT NULL AND NEW.user_id <> me)
          OR (NEW.guardian_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM guardians g WHERE g.id = NEW.guardian_id AND g.user_id = me AND g.deleted_at IS NULL))))
       OR (TG_OP = 'UPDATE' AND (NEW.verification_status, NEW.oz_id, NEW.organization_id, NEW.user_id, NEW.guardian_id, NEW.birth_date)
          IS DISTINCT FROM (OLD.verification_status, OLD.oz_id, OLD.organization_id, OLD.user_id, OLD.guardian_id, OLD.birth_date))
       -- Identité certifiée : figée dès que la vérification a commencé (la date de naissance, toujours).
       OR (TG_OP = 'UPDATE' AND OLD.verification_status <> 'declared'
          AND (NEW.first_name, NEW.last_name, NEW.nationality, NEW.document_number_encrypted, NEW.document_number_hmac)
          IS DISTINCT FROM (OLD.first_name, OLD.last_name, OLD.nationality, OLD.document_number_encrypted, OLD.document_number_hmac)) THEN
      RAISE EXCEPTION 'colonne d''autorité de players non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF TG_TABLE_NAME = 'guardians' THEN
    IF (TG_OP = 'INSERT' AND NEW.verification_status <> 'declared')
       OR (TG_OP = 'UPDATE' AND (NEW.verification_status, NEW.user_id) IS DISTINCT FROM (OLD.verification_status, OLD.user_id))
       OR (TG_OP = 'UPDATE' AND OLD.verification_status <> 'declared'
          AND (NEW.first_name, NEW.last_name, NEW.document_number_encrypted, NEW.document_number_hmac)
          IS DISTINCT FROM (OLD.first_name, OLD.last_name, OLD.document_number_encrypted, OLD.document_number_hmac)) THEN
      RAISE EXCEPTION 'colonne d''autorité de guardians non modifiable par l''utilisateur' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION oz_privileged();

DROP TRIGGER "players_freeze_country" ON "players";
DROP FUNCTION oz_players_freeze_country();
ALTER TABLE "players" DROP CONSTRAINT "players_oz_id_registry_fkey";
DROP TABLE "oz_id_registry";
DROP FUNCTION oz_oz_id_registry_immutable();
DROP FUNCTION oz_ozid_is_valid(text);
DROP FUNCTION oz_ozid_compose(text, text, text);
