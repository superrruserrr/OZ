-- Lot 1.4b : RLS de lecture des joueurs alignée sur les politiques CASL (docs/security/rbac.md, D1).
-- La politique est l'union des règles CASL de lecture (`profile.read`, `player.read_public`,
-- `player.read_minor`) ; l'équivalence est prouvée par packages/db/test/rbac-rls.int.test.ts.
-- Lecture seule : aucune écriture tierce, les écritures restent sur `players_owner` et le chemin privilégié.

-- ---------------------------------------------------------------------------------------------
-- Lectures du chemin privilégié (D-059) pour les fonctions d'appui : la RLS forcée s'applique
-- aussi à leur propriétaire en recette et en production.
-- ---------------------------------------------------------------------------------------------

CREATE POLICY "organizations_privileged_read" ON "organizations" FOR SELECT USING (oz_privileged());
CREATE POLICY "guardians_privileged_read" ON "guardians" FOR SELECT USING (oz_privileged());
CREATE POLICY "consents_privileged_read" ON "consents" FOR SELECT USING (oz_privileged());

-- ---------------------------------------------------------------------------------------------
-- Fonctions d'appui (D2) : un booléen, rien d'autre. Elles ne lisent jamais `players` (aucune
-- récursion de politique) et ne parlent que de l'utilisateur courant, sauf `oz_player_published`.
-- ---------------------------------------------------------------------------------------------

-- Minorité au calendrier UTC, même règle que `isMinor` (packages/auth) : mineur jusqu'au jour des
-- 18 ans exclu ; né un 29 février, majeur le 1er mars. Jamais stockée (CP-15). La forme à date
-- donnée est comparée à `isMinor` par le test, 29 février et fins de mois compris.
CREATE FUNCTION oz_is_minor_at(birth date, at date) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT birth IS NULL OR at IS NULL
    OR at < make_date(extract(year FROM birth)::int + 18, extract(month FROM birth)::int, 1)
            + (extract(day FROM birth)::int - 1)
$$;

CREATE FUNCTION oz_is_minor(birth date) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT oz_is_minor_at(birth, (now() AT TIME ZONE 'UTC')::date)
$$;

-- L'utilisateur courant tient l'un de ces rôles, non retiré ; un rôle d'organisation ne compte que
-- pour une organisation vérifiée et non supprimée (même règle que `sessionAccess`, lot 1.4a).
CREATE FUNCTION oz_has_verified_role(roles role_kind[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles r LEFT JOIN organizations o ON o.id = r.organization_id
    WHERE r.user_id = oz_current_user_id() AND r.deleted_at IS NULL AND r.role = ANY (roles)
      AND (r.organization_id IS NULL OR (o.deleted_at IS NULL AND o.verification_status = 'verified')))
$$;

-- Même règle, pour une organisation donnée (portée `org` : joueurs rattachés).
CREATE FUNCTION oz_is_verified_member(organization uuid, roles role_kind[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT organization IS NOT NULL AND EXISTS (
    SELECT 1 FROM user_roles r JOIN organizations o ON o.id = r.organization_id
    WHERE r.user_id = oz_current_user_id() AND r.deleted_at IS NULL AND r.role = ANY (roles)
      AND r.organization_id = organization
      AND o.deleted_at IS NULL AND o.verification_status = 'verified')
$$;

-- Profil publié (EX-T16 n° 3) : joueur vérifié et consentement de publication actif, donné par son
-- tuteur actuel, vérifié et non supprimé. Les valeurs du joueur sont passées par la politique.
CREATE FUNCTION oz_player_published(player uuid, guardian uuid, status verification_status)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT status = 'verified' AND guardian IS NOT NULL AND EXISTS (
    SELECT 1 FROM guardians g JOIN consents c ON c.granted_by_guardian_id = g.id
    WHERE g.id = guardian AND g.deleted_at IS NULL AND g.verification_status = 'verified'
      AND c.player_id = player AND c.type = 'guardian_profile_publication'
      AND c.revoked_at IS NULL AND c.deleted_at IS NULL)
$$;

-- ---------------------------------------------------------------------------------------------
-- Politiques de lecture (D1, D4, D5). Les appels sans colonne sont enveloppés dans un SELECT :
-- évalués une fois par requête (InitPlan), pas une fois par ligne. Recruteur et agence : aucune, tant que le KYC 3 n'existe
-- pas (lot 1.10, D-086). Le centre ne lit aucun mineur tant qu'aucun test n'est enregistré (D8).
-- ---------------------------------------------------------------------------------------------

CREATE POLICY "players_third_party_read" ON "players" FOR SELECT
  USING ("deleted_at" IS NULL AND (
    -- player.read_public : majeur vérifié.
    ("verification_status" = 'verified' AND NOT oz_is_minor("birth_date")
      AND (SELECT oz_has_verified_role(ARRAY['player', 'guardian', 'academy', 'club', 'federation', 'center']::role_kind[])))
    -- player.read_minor : mineur vérifié et publié.
    OR (oz_is_minor("birth_date") AND oz_player_published("id", "guardian_id", "verification_status")
      AND (SELECT oz_has_verified_role(ARRAY['academy', 'club', 'federation']::role_kind[])))
    -- player.read_minor, portée `org` : mineur rattaché à son académie ou à son club.
    OR (oz_is_minor("birth_date")
      AND oz_is_verified_member("organization_id", ARRAY['academy', 'club']::role_kind[]))
  ));

-- profile.read de l'administrateur (journalisation au lot 1.16, D-087) ; aucune écriture.
CREATE POLICY "players_admin_read" ON "players" FOR SELECT
  USING ((SELECT oz_has_verified_role(ARRAY['admin']::role_kind[])));

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution (convention D-066) : retirés à PUBLIC, accordés au seul rôle applicatif
-- `oz_app` s'il existe (Terraform en recette et en production). En local, le propriétaire les a.
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_is_minor_at(date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_is_minor(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_has_verified_role(role_kind[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_is_verified_member(uuid, role_kind[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_published(uuid, uuid, verification_status) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_is_minor_at(date, date) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_is_minor(date) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_has_verified_role(role_kind[]) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_is_verified_member(uuid, role_kind[]) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_published(uuid, uuid, verification_status) TO oz_app;
  END IF;
END $$;
