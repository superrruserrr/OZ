-- Lot 1.7a (EX-107) : inscription joueur en étapes, brouillon sauvegardé côté serveur et repris
-- après interruption, puis finalisation qui crée la fiche (statut `declared`), le tuteur déclaré
-- d'un mineur et le rôle joueur. L'OZ ID est émis ensuite, dans la même transaction, par
-- oz_issue_oz_id (l'aléa vient de packages/core, jamais de la base ni du client).

-- Brouillon : une ligne par compte, une colonne chiffrée par étape (D1), rien en clair. Expire
-- 30 jours après la dernière sauvegarde.
CREATE TABLE "player_signups" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "identity" BYTEA,
    "sport" BYTEA,
    "affiliation" BYTEA,
    "guardian" BYTEA,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "player_signups_pkey" PRIMARY KEY ("id"),
    -- Chaque étape chiffrée tient en 8 Kio (le texte clair est borné à 4 Kio par la fonction).
    CONSTRAINT "player_signups_size_check" CHECK (
      coalesce(octet_length("identity"), 0) <= 8192 AND coalesce(octet_length("sport"), 0) <= 8192
      AND coalesce(octet_length("affiliation"), 0) <= 8192 AND coalesce(octet_length("guardian"), 0) <= 8192)
);
CREATE UNIQUE INDEX "player_signups_user_id_key" ON "player_signups"("user_id");
CREATE INDEX "player_signups_expires_at_idx" ON "player_signups"("expires_at");
ALTER TABLE "player_signups" ADD CONSTRAINT "player_signups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "player_signups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "player_signups" FORCE ROW LEVEL SECURITY;

-- Le titulaire voit que son brouillon existe (contenu chiffré) ; écriture par les fonctions seules.
CREATE POLICY "player_signups_owner_read" ON "player_signups" FOR SELECT
  USING ("user_id" = (SELECT oz_current_user_id()));
CREATE POLICY "player_signups_privileged" ON "player_signups" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Chemin privilégié de la finalisation : tuteur déclaré sans compte et rôle joueur (D5). Aucune
-- attribution de rôle par soi-même hors de cette fonction (CP-07).
-- Bornées à ce seul usage : tuteur déclaré sans compte, rôle joueur sans organisation.
CREATE POLICY "guardians_privileged_insert" ON "guardians" FOR INSERT
  WITH CHECK (oz_privileged() AND "user_id" IS NULL AND "verification_status" = 'declared');
CREATE POLICY "user_roles_privileged_insert" ON "user_roles" FOR INSERT
  WITH CHECK (oz_privileged() AND "role" = 'player' AND "organization_id" IS NULL);

-- Compte du contexte, email vérifié, tant qu'il peut tenir une session ; sinon NULL.
CREATE FUNCTION oz_player_signup_account() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id FROM users u
  WHERE u.id = oz_current_user_id() AND u.deleted_at IS NULL
    AND u.status IN ('pending_verification', 'active') AND u.email_verified_at IS NOT NULL
$$;

-- Étape déchiffrée, ou NULL si elle ne se déchiffre plus (clé changée, donnée abîmée) : l'étape est
-- alors simplement à ressaisir, jamais une erreur permanente.
CREATE FUNCTION oz_player_signup_open(sealed bytea, p_key text) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RETURN oz_decrypt(sealed, p_key)::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

-- Âge révolu (UTC), même règle que oz_is_minor_at (29 février : 1er mars).
CREATE FUNCTION oz_age_years(birth date, at date) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT extract(year FROM age(at, birth))::int
$$;

-- Bornes de l'étape identité, revérifiées en base (C4, EX-107 n° 3) : 6 à 45 ans.
CREATE FUNCTION oz_player_signup_birth_ok(birth date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT birth IS NOT NULL
    AND oz_age_years(birth, (now() AT TIME ZONE 'UTC')::date) BETWEEN 6 AND 45
$$;

-- Sauvegarde d'une étape (EX-107 n° 2). Contenu validé par l'API (contrat Zod) ; la base borne la
-- forme, la taille et la date de naissance. Rend {outcome: saved, expiresAt}, {outcome: completed}
-- (le compte a déjà sa fiche), {outcome: invalid} ou {outcome: refused} (compte inutilisable).
CREATE FUNCTION oz_player_signup_save(p_step text, p_data jsonb, p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  sealed bytea;
  expiry timestamptz := now() + interval '30 days';
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  IF p_step NOT IN ('identity', 'sport', 'affiliation', 'guardian')
     OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text) > 4096 THEN
    RETURN jsonb_build_object('outcome', 'invalid');
  END IF;
  IF p_step = 'identity' THEN
    BEGIN
      IF NOT oz_player_signup_birth_ok((p_data ->> 'birthDate')::date) THEN
        RETURN jsonb_build_object('outcome', 'invalid');
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RETURN jsonb_build_object('outcome', 'invalid');
    END;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('oz.player_signup:' || me::text, 0));
  IF EXISTS (SELECT 1 FROM players p WHERE p.user_id = me) THEN
    RETURN jsonb_build_object('outcome', 'completed');
  END IF;
  -- Brouillon échu : repart de zéro.
  DELETE FROM player_signups WHERE user_id = me AND expires_at <= now();
  sealed := oz_encrypt(p_data::text, p_key);
  INSERT INTO player_signups (user_id, identity, sport, affiliation, guardian, expires_at)
  VALUES (me,
    CASE WHEN p_step = 'identity' THEN sealed END,
    CASE WHEN p_step = 'sport' THEN sealed END,
    CASE WHEN p_step = 'affiliation' THEN sealed END,
    CASE WHEN p_step = 'guardian' THEN sealed END,
    expiry)
  ON CONFLICT (user_id) DO UPDATE SET
    identity = CASE WHEN p_step = 'identity' THEN sealed ELSE player_signups.identity END,
    sport = CASE WHEN p_step = 'sport' THEN sealed ELSE player_signups.sport END,
    affiliation = CASE WHEN p_step = 'affiliation' THEN sealed ELSE player_signups.affiliation END,
    guardian = CASE WHEN p_step = 'guardian' THEN sealed ELSE player_signups.guardian END,
    updated_at = now(),
    expires_at = expiry;
  RETURN jsonb_build_object('outcome', 'saved', 'expiresAt', expiry);
END $$;

-- Relecture du brouillon du compte (reprise) : étapes déchiffrées, minorité calculée ici. NULL sans
-- brouillon valide ; {completed: true} si la fiche existe déjà ; {outcome: refused} sans compte.
CREATE FUNCTION oz_player_signup_read(p_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  draft player_signups;
  identity jsonb;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  IF EXISTS (SELECT 1 FROM players p WHERE p.user_id = me) THEN
    RETURN jsonb_build_object('completed', true);
  END IF;
  SELECT * INTO draft FROM player_signups WHERE user_id = me AND expires_at > now();
  IF NOT FOUND THEN RETURN NULL; END IF;
  identity := oz_player_signup_open(draft.identity, p_key);
  RETURN jsonb_build_object(
    'completed', false,
    'identity', identity,
    'sport', oz_player_signup_open(draft.sport, p_key),
    'affiliation', oz_player_signup_open(draft.affiliation, p_key),
    'guardian', oz_player_signup_open(draft.guardian, p_key),
    'minor', CASE WHEN identity IS NULL THEN NULL
                  ELSE oz_is_minor((identity ->> 'birthDate')::date) END,
    'expiresAt', draft.expires_at);
END $$;

-- Finalisation (D5) : vérifie les étapes requises (tuteur si mineur, D4), crée le tuteur déclaré,
-- la fiche et le rôle joueur, supprime le brouillon, audite sans donnée personnelle. Rend
-- {outcome: created, playerId, minor}, {outcome: missing, missing: [...]} ou {outcome: completed}.
CREATE FUNCTION oz_player_signup_complete(p_key text, p_blind_key text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  draft player_signups;
  identity jsonb;
  sport jsonb;
  tutor jsonb;
  birth date;
  minor boolean;
  missing text[] := '{}';
  guardian_row uuid;
  created uuid;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('oz.player_signup:' || me::text, 0));
  IF EXISTS (SELECT 1 FROM players p WHERE p.user_id = me) THEN
    RETURN jsonb_build_object('outcome', 'completed');
  END IF;
  SELECT * INTO draft FROM player_signups WHERE user_id = me AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'missing', 'missing', ARRAY['identity', 'sport', 'affiliation']);
  END IF;
  identity := oz_player_signup_open(draft.identity, p_key);
  sport := oz_player_signup_open(draft.sport, p_key);
  tutor := oz_player_signup_open(draft.guardian, p_key);
  birth := (identity ->> 'birthDate')::date;
  minor := CASE WHEN birth IS NULL THEN NULL ELSE oz_is_minor(birth) END;
  IF identity IS NULL OR NOT oz_player_signup_birth_ok(birth) THEN missing := array_append(missing, 'identity'); END IF;
  IF sport IS NULL THEN missing := array_append(missing, 'sport'); END IF;
  IF oz_player_signup_open(draft.affiliation, p_key) IS NULL THEN missing := array_append(missing, 'affiliation'); END IF;
  IF minor IS TRUE AND tutor IS NULL THEN missing := array_append(missing, 'guardian'); END IF;
  IF cardinality(missing) > 0 THEN
    RETURN jsonb_build_object('outcome', 'missing', 'missing', missing);
  END IF;
  -- Rôle joueur retiré (sanction) : jamais rendu par ce chemin.
  IF EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = me AND r.role = 'player'
               AND r.organization_id IS NULL AND r.deleted_at IS NOT NULL) THEN
    RETURN jsonb_build_object('outcome', 'refused');
  END IF;

  -- Tuteur déclaré, sans compte (son inscription et sa vérification : lot 1.7b). Un majeur n'en a
  -- pas, même si une étape tuteur a été saisie avant une correction de la date de naissance.
  IF minor THEN
    INSERT INTO guardians (first_name, last_name, relationship, country,
      phone_encrypted, phone_hmac, email_encrypted, email_hmac, created_by)
    VALUES (tutor ->> 'firstName', tutor ->> 'lastName', (tutor ->> 'relationship')::guardian_relationship,
      tutor ->> 'country',
      oz_encrypt(tutor ->> 'phone', p_key), oz_blind_index(tutor ->> 'phone', p_blind_key),
      oz_encrypt(tutor ->> 'email', p_key), oz_blind_index(tutor ->> 'email', p_blind_key), me)
    RETURNING id INTO guardian_row;
  END IF;

  INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, region, city,
    primary_position, secondary_position, dominant_foot, height_cm, weight_kg, guardian_id, created_by)
  VALUES (me, identity ->> 'firstName', identity ->> 'lastName', birth, identity ->> 'nationality',
    identity ->> 'country', identity ->> 'region', identity ->> 'city',
    (sport ->> 'primaryPosition')::player_position, (sport ->> 'secondaryPosition')::player_position,
    (sport ->> 'dominantFoot')::dominant_foot, (sport ->> 'heightCm')::smallint,
    (sport ->> 'weightKg')::smallint, guardian_row, me)
  RETURNING id INTO created;

  INSERT INTO user_roles (user_id, role, created_by)
  SELECT me, 'player', me
  WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = me AND r.role = 'player'
                      AND r.organization_id IS NULL AND r.deleted_at IS NULL);

  DELETE FROM player_signups WHERE user_id = me;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'player.signup.completed', 'player', created, 'Inscription joueur',
    jsonb_build_object('minor', minor, 'guardian_declared', guardian_row IS NOT NULL));
  RETURN jsonb_build_object('outcome', 'created', 'playerId', created, 'minor', minor);
EXCEPTION
  -- Étape d'un contrat plus ancien que la base refuse (type, borne) : à ressaisir. Le message de
  -- PostgreSQL, qui citerait la valeur, n'est jamais remonté.
  WHEN data_exception OR integrity_constraint_violation THEN
    RETURN jsonb_build_object('outcome', 'invalid');
END $$;

-- Effacement du compte (EX-118 n° 3) : le brouillon disparaît à la clôture du compte.
CREATE FUNCTION oz_player_signups_erase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM player_signups WHERE user_id = NEW.id;
  RETURN NULL;
END $$;
CREATE TRIGGER "users_erase_player_signups" AFTER UPDATE OF "deleted_at" ON "users"
  FOR EACH ROW WHEN (OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL)
  EXECUTE FUNCTION oz_player_signups_erase();

REVOKE EXECUTE ON FUNCTION oz_player_signup_account() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_signup_open(bytea, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_age_years(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_signup_birth_ok(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_signup_save(text, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_signup_read(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_signup_complete(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_signups_erase() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_player_signup_save(text, jsonb, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_signup_read(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_signup_complete(text, text) TO oz_app;
  END IF;
END $$;
