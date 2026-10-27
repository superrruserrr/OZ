-- Registre des OZ ID (lot 1.2, EX-102, ADR-007, TD-017) et premier chemin privilégié (D-059).

-- ---------------------------------------------------------------------------------------------
-- Calcul de l'OZ ID en base : même alphabet, même table de Damm et même ordre que packages/core
-- (test croisé). Contrôle de défense en profondeur : la base refuse un OZ ID au contrôle faux.
-- ---------------------------------------------------------------------------------------------

-- OZ ID canonique (contrôle compris) des parties, ou NULL si une partie est mal formée.
CREATE FUNCTION oz_ozid_compose(p_country text, p_year text, p_random text) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public, pg_temp AS $$
DECLARE
  -- Table de Damm d'ordre 32, aplatie ligne par ligne : FIGÉE À VIE (packages/core/src/oz-id/damm-table.ts).
  damm CONSTANT smallint[] := '{0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,5,7,1,3,13,15,9,11,21,23,17,19,29,31,25,27,2,0,6,4,10,8,14,12,18,16,22,20,26,24,30,28,7,5,3,1,15,13,11,9,23,21,19,17,31,29,27,25,4,6,0,2,12,14,8,10,20,22,16,18,28,30,24,26,1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,6,4,2,0,14,12,10,8,22,20,18,16,30,28,26,24,3,1,7,5,11,9,15,13,19,17,23,21,27,25,31,29,8,10,12,14,0,2,4,6,24,26,28,30,16,18,20,22,13,15,9,11,5,7,1,3,29,31,25,27,21,23,17,19,10,8,14,12,2,0,6,4,26,24,30,28,18,16,22,20,15,13,11,9,7,5,3,1,31,29,27,25,23,21,19,17,12,14,8,10,4,6,0,2,28,30,24,26,20,22,16,18,9,11,13,15,1,3,5,7,25,27,29,31,17,19,21,23,14,12,10,8,6,4,2,0,30,28,26,24,22,20,18,16,11,9,15,13,3,1,7,5,27,25,31,29,19,17,23,21,16,18,20,22,24,26,28,30,0,2,4,6,8,10,12,14,21,23,17,19,29,31,25,27,5,7,1,3,13,15,9,11,18,16,22,20,26,24,30,28,2,0,6,4,10,8,14,12,23,21,19,17,31,29,27,25,7,5,3,1,15,13,11,9,20,22,16,18,28,30,24,26,4,6,0,2,12,14,8,10,17,19,21,23,25,27,29,31,1,3,5,7,9,11,13,15,22,20,18,16,30,28,26,24,6,4,2,0,14,12,10,8,19,17,23,21,27,25,31,29,3,1,7,5,11,9,15,13,24,26,28,30,16,18,20,22,8,10,12,14,0,2,4,6,29,31,25,27,21,23,17,19,13,15,9,11,5,7,1,3,26,24,30,28,18,16,22,20,10,8,14,12,2,0,6,4,31,29,27,25,23,21,19,17,15,13,11,9,7,5,3,1,28,30,24,26,20,22,16,18,12,14,8,10,4,6,0,2,25,27,29,31,17,19,21,23,9,11,13,15,1,3,5,7,30,28,26,24,22,20,18,16,14,12,10,8,6,4,2,0,27,25,31,29,19,17,23,21,11,9,15,13,3,1,7,5,5,7,1,3,13,15,9,11,21,23,17,19,29,31,25,27,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,7,5,3,1,15,13,11,9,23,21,19,17,31,29,27,25,2,0,6,4,10,8,14,12,18,16,22,20,26,24,30,28,1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,4,6,0,2,12,14,8,10,20,22,16,18,28,30,24,26,3,1,7,5,11,9,15,13,19,17,23,21,27,25,31,29,6,4,2,0,14,12,10,8,22,20,18,16,30,28,26,24,13,15,9,11,5,7,1,3,29,31,25,27,21,23,17,19,8,10,12,14,0,2,4,6,24,26,28,30,16,18,20,22,15,13,11,9,7,5,3,1,31,29,27,25,23,21,19,17,10,8,14,12,2,0,6,4,26,24,30,28,18,16,22,20,9,11,13,15,1,3,5,7,25,27,29,31,17,19,21,23,12,14,8,10,4,6,0,2,28,30,24,26,20,22,16,18,11,9,15,13,3,1,7,5,27,25,31,29,19,17,23,21,14,12,10,8,6,4,2,0,30,28,26,24,22,20,18,16,21,23,17,19,29,31,25,27,5,7,1,3,13,15,9,11,16,18,20,22,24,26,28,30,0,2,4,6,8,10,12,14,23,21,19,17,31,29,27,25,7,5,3,1,15,13,11,9,18,16,22,20,26,24,30,28,2,0,6,4,10,8,14,12,17,19,21,23,25,27,29,31,1,3,5,7,9,11,13,15,20,22,16,18,28,30,24,26,4,6,0,2,12,14,8,10,19,17,23,21,27,25,31,29,3,1,7,5,11,9,15,13,22,20,18,16,30,28,26,24,6,4,2,0,14,12,10,8,29,31,25,27,21,23,17,19,13,15,9,11,5,7,1,3,24,26,28,30,16,18,20,22,8,10,12,14,0,2,4,6,31,29,27,25,23,21,19,17,15,13,11,9,7,5,3,1,26,24,30,28,18,16,22,20,10,8,14,12,2,0,6,4,25,27,29,31,17,19,21,23,9,11,13,15,1,3,5,7,28,30,24,26,20,22,16,18,12,14,8,10,4,6,0,2,27,25,31,29,19,17,23,21,11,9,15,13,3,1,7,5,30,28,26,24,22,20,18,16,14,12,10,8,6,4,2,0}';
  alphabet CONSTANT text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  body text := p_country || p_year || p_random;
  interim integer := 0;
  value integer;
BEGIN
  IF p_country !~ '^[A-Z]{2}$' OR p_year !~ '^[0-9]{2}$' OR p_random !~ '^[0-9A-HJKMNP-TV-Z]{6}$' THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..10 LOOP
    -- Pays : A = 0 … Z = 25 ; année et partie aléatoire : valeur Crockford (un chiffre vaut lui-même).
    value := CASE WHEN i <= 2 THEN ascii(substr(body, i, 1)) - 65 ELSE strpos(alphabet, substr(body, i, 1)) - 1 END;
    interim := damm[interim * 32 + value + 1];
  END LOOP;
  RETURN format('OZ-%s-%s-%s-%s', p_country, p_year, p_random, substr(alphabet, interim + 1, 1));
END $$;

-- Vrai pour un OZ ID canonique au contrôle juste.
CREATE FUNCTION oz_ozid_is_valid(p_oz_id text) RETURNS boolean
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = public, pg_temp AS $$
  SELECT p_oz_id ~ '^OZ-[A-Z]{2}-[0-9]{2}-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]$'
     AND oz_ozid_compose(substr(p_oz_id, 4, 2), substr(p_oz_id, 7, 2), substr(p_oz_id, 10, 6)) = p_oz_id
$$;

-- ---------------------------------------------------------------------------------------------
-- Registre : une ligne par OZ ID émis, jamais modifiée ni supprimée (CP-03). La ligne du joueur
-- n'est jamais supprimée non plus (players_forbid_delete) : après anonymisation, l'OZ ID reste pris.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "oz_id_registry" (
    "oz_id" TEXT NOT NULL,
    "player_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oz_id_registry_pkey" PRIMARY KEY ("oz_id"),
    CONSTRAINT "oz_id_registry_oz_id_check" CHECK (oz_ozid_is_valid("oz_id"))
);
CREATE UNIQUE INDEX "oz_id_registry_player_id_key" ON "oz_id_registry"("player_id");
CREATE UNIQUE INDEX "oz_id_registry_oz_id_player_id_key" ON "oz_id_registry"("oz_id", "player_id");
ALTER TABLE "oz_id_registry" ADD CONSTRAINT "oz_id_registry_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- L'OZ ID d'un joueur est celui que le registre lui a réservé, à lui et à nul autre.
ALTER TABLE "players" ADD CONSTRAINT "players_oz_id_registry_fkey" FOREIGN KEY ("oz_id", "id") REFERENCES "oz_id_registry"("oz_id", "player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION oz_oz_id_registry_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'registre des OZ ID : % refusé (un OZ ID n''est jamais modifié ni réattribué)', TG_OP
    USING ERRCODE = 'restrict_violation';
END $$;
-- Le pays de rattachement est inscrit dans l'OZ ID : il ne change plus une fois l'OZ ID émis.
CREATE FUNCTION oz_players_freeze_country() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.oz_id IS NOT NULL AND NEW.country IS DISTINCT FROM OLD.country THEN
    RAISE EXCEPTION 'pays de rattachement figé : il est inscrit dans l''OZ ID' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "players_freeze_country" BEFORE UPDATE OF "country" ON "players" FOR EACH ROW EXECUTE FUNCTION oz_players_freeze_country();
CREATE TRIGGER "oz_id_registry_immutable" BEFORE UPDATE ON "oz_id_registry" FOR EACH ROW EXECUTE FUNCTION oz_oz_id_registry_immutable();
CREATE TRIGGER "oz_id_registry_forbid_delete" BEFORE DELETE ON "oz_id_registry" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();
CREATE TRIGGER "oz_id_registry_forbid_truncate" BEFORE TRUNCATE ON "oz_id_registry" FOR EACH STATEMENT EXECUTE FUNCTION oz_forbid_delete();

-- ---------------------------------------------------------------------------------------------
-- Chemin privilégié (D-059) : vrai seulement à l'intérieur d'une fonction SECURITY DEFINER dont le
-- propriétaire n'est pas un rôle que la session peut endosser (un SET ROLE vers un rôle dont la
-- session est membre ne compte jamais), ou quand le rôle courant est superutilisateur (qui contourne
-- déjà la RLS ; la garde d'autorité ne s'applique alors plus à lui, D-064). Chaque fonction privilégiée contrôle elle-même l'appelant et journalise.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_privileged() RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (current_user <> session_user AND NOT pg_has_role(session_user, current_user, 'MEMBER'))
      OR coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)
$$;

CREATE OR REPLACE FUNCTION oz_guard_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
BEGIN
  -- Chemin privilégié (D-059) : une fonction SECURITY DEFINER dédiée contrôle elle-même l'appelant.
  IF me IS NULL OR oz_privileged() THEN RETURN NEW; END IF;
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

-- RLS forcée : le propriétaire des fonctions privilégiées y est soumis lui aussi (recette, production).
CREATE POLICY "players_privileged" ON "players" FOR ALL USING (oz_privileged()) WITH CHECK (oz_privileged());
ALTER TABLE "oz_id_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "oz_id_registry" FORCE ROW LEVEL SECURITY;
-- Aucune lecture ni écriture directe : le registre ne s'atteint que par oz_issue_oz_id.
CREATE POLICY "oz_id_registry_privileged" ON "oz_id_registry" FOR ALL USING (oz_privileged()) WITH CHECK (oz_privileged());

-- ---------------------------------------------------------------------------------------------
-- Émission (EX-102 n° 5, 6 ; D1, D2 du lot 1.2) : l'appelant fournit la seule partie aléatoire,
-- tirée par packages/core (invariant de l'API : jamais une valeur venue du client, sinon un OZ ID
-- « choisi » devient possible) ; la base fixe le pays (pays de rattachement du joueur) et l'année
-- d'émission UTC, calcule le contrôle, réserve atomiquement et journalise. Renvoie l'OZ ID, ou NULL
-- si la partie aléatoire est déjà prise (l'appelant tire à nouveau).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_issue_oz_id(p_player_id uuid, p_random text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  target players;
  candidate text;
BEGIN
  -- Même refus pour « introuvable » et « non autorisé » : rien n'est révélé sur les profils d'autrui.
  IF me IS NULL OR NOT EXISTS (SELECT 1 FROM users WHERE id = me AND deleted_at IS NULL AND status IN ('pending_verification', 'active')) THEN
    RAISE EXCEPTION 'émission d''OZ ID refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO target FROM players WHERE id = p_player_id AND deleted_at IS NULL FOR UPDATE;
  -- Titulaire, tuteur actif, membre de l'organisation de rattachement ou administrateur
  -- (matrice des rôles fine au lot 1.4, D-063).
  -- IS NOT TRUE : une comparaison à NULL (joueur sans titulaire) ne vaut jamais autorisation.
  IF NOT FOUND OR (
       target.user_id = me
    OR target.guardian_id IN (SELECT id FROM guardians WHERE user_id = me AND deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = me AND r.deleted_at IS NULL
                 AND (r.role = 'admin' OR (r.organization_id = target.organization_id AND EXISTS (
                   SELECT 1 FROM organizations o WHERE o.id = target.organization_id AND o.deleted_at IS NULL))))
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'émission d''OZ ID refusée' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target.oz_id IS NOT NULL THEN
    -- Distinct de la collision (NULL) : une seconde émission est une erreur de l'appelant.
    RAISE EXCEPTION 'OZ ID déjà émis pour ce joueur' USING ERRCODE = 'check_violation';
  END IF;
  candidate := oz_ozid_compose(target.country, to_char(now() AT TIME ZONE 'UTC', 'YY'), p_random);
  IF candidate IS NULL THEN
    RAISE EXCEPTION 'partie aléatoire d''OZ ID mal formée' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO oz_id_registry (oz_id, player_id) VALUES (candidate, p_player_id) ON CONFLICT (oz_id) DO NOTHING;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE players SET oz_id = candidate WHERE id = p_player_id;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'player.oz_id.issued', 'player', p_player_id, 'Émission de l''OZ ID', jsonb_build_object('oz_id', candidate));
  RETURN candidate;
END $$;
