-- Modification de sa fiche (lot 1.19cb, `PATCH /players/me`) : l'API décide champ par champ (CASL,
-- `profile.update`, mineur refusé). La garde d'autorité fige déjà l'identité d'un joueur vérifié
-- (N1) ; décision U3 du 2026-11-19 : prénom, nom et nationalité sont aussi figés pendant l'examen
-- (`pending`, `in_review`) et après un refus ou une suspension. Changement par le chemin privilégié.
CREATE FUNCTION oz_players_identity_review_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NULL OR oz_privileged() THEN RETURN NEW; END IF;
  IF OLD.verification_status <> 'declared'
     AND (NEW.first_name, NEW.last_name, NEW.nationality)
         IS DISTINCT FROM (OLD.first_name, OLD.last_name, OLD.nationality) THEN
    RAISE EXCEPTION 'colonne d''autorité : identité figée hors du statut déclaré'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "players_identity_review_guard" BEFORE UPDATE ON "players"
  FOR EACH ROW EXECUTE FUNCTION oz_players_identity_review_guard();
