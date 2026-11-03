-- Journal d'audit (lot 1.16a, EX-T11, EX-118 n° 1, CP-23) : partitions entretenues par le worker
-- (D-057), vérification de la chaîne contre une ancre tenue hors de la base (D-060), résultats
-- consignés, lecture du journal par l'administrateur vérifié. Aucun droit d'écriture nouveau sur
-- `audit_log` : le worker n'y accède que par des fonctions SECURITY DEFINER, hors contexte utilisateur.

-- Les fonctions privilégiées lisent toute la chaîne (vérification, tête, partition par défaut) : la
-- politique du lot 1.9cb, limitée aux délivrances d'URL, en devient un cas particulier et disparaît.
-- Tout code SECURITY DEFINER lit donc le journal : il filtre lui-même ce qu'il rend (revue).
-- Appels entre parenthèses : évalués une fois par requête (InitPlan), pas une fois par ligne.
DROP POLICY "audit_log_privileged_read_document_reads" ON "audit_log";
CREATE POLICY "audit_log_privileged_read" ON "audit_log" FOR SELECT USING ((SELECT oz_privileged()));
-- La partition par défaut, comptée directement (sans parcourir les autres) par l'entretien.
CREATE POLICY "audit_log_default_privileged_read" ON "audit_log_default" FOR SELECT
  USING ((SELECT oz_privileged()));
-- L'administrateur vérifié consulte tout le journal (EX-118 n° 1) ; aucun autre rôle.
CREATE POLICY "audit_log_admin_read" ON "audit_log" FOR SELECT
  USING ((SELECT oz_has_verified_role(ARRAY['admin']::role_kind[])));

-- Consultation par l'administrateur, de la position la plus récente à la plus ancienne.
CREATE INDEX "audit_log_action_chain_position_idx" ON "audit_log"("action", "chain_position");

-- ---------------------------------------------------------------------------------------------
-- Résultats des vérifications : écrits par la seule fonction de vérification, immuables, lus par
-- l'administrateur vérifié. `defect_position` NULL : chaîne intègre jusqu'à `head_position`.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE "audit_chain_checks" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT transaction_timestamp(),
    "head_position" BIGINT NOT NULL,
    "anchor_position" BIGINT,
    "defect_position" BIGINT,

    CONSTRAINT "audit_chain_checks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_chain_checks_head_position_check" CHECK ("head_position" >= 0),
    CONSTRAINT "audit_chain_checks_anchor_position_check" CHECK ("anchor_position" >= 1),
    CONSTRAINT "audit_chain_checks_defect_position_check" CHECK ("defect_position" >= 1)
);
CREATE INDEX "audit_chain_checks_checked_at_idx" ON "audit_chain_checks"("checked_at");

ALTER TABLE "audit_chain_checks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_chain_checks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "audit_chain_checks_privileged_insert" ON "audit_chain_checks" FOR INSERT
  WITH CHECK ((SELECT oz_privileged()));
CREATE POLICY "audit_chain_checks_privileged_read" ON "audit_chain_checks" FOR SELECT
  USING ((SELECT oz_privileged()));
CREATE POLICY "audit_chain_checks_admin_read" ON "audit_chain_checks" FOR SELECT
  USING ((SELECT oz_has_verified_role(ARRAY['admin']::role_kind[])));
CREATE TRIGGER "audit_chain_checks_immutable" BEFORE UPDATE OR DELETE ON "audit_chain_checks"
  FOR EACH ROW EXECUTE FUNCTION oz_audit_immutable();
CREATE TRIGGER "audit_chain_checks_forbid_truncate" BEFORE TRUNCATE ON "audit_chain_checks"
  FOR EACH STATEMENT EXECUTE FUNCTION oz_audit_immutable();
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_chain_checks" FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- Partitions (D-057) : mois courant et trois suivants, chacun tenté à part (un mois bloqué, par
-- exemple par des entrées déjà tombées dans la partition par défaut, n'empêche pas les suivants), et
-- nombre d'entrées de la partition par défaut. Un échec ne lève pas : le worker alerte avec le
-- nombre de mois manqués et le code SQLSTATE du dernier échec (jamais un message, qui peut citer
-- des valeurs).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_audit_maintain_partitions()
RETURNS TABLE (default_rows bigint, failed_months integer, error_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  month_start date;
  partition_name text;
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'journal d''audit : entretien réservé au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  failed_months := 0;
  FOR i IN 0..3 LOOP
    month_start := (date_trunc('month', (now() AT TIME ZONE 'UTC')) + make_interval(months => i))::date;
    partition_name := format('audit_log_%s', to_char(month_start, 'YYYY_MM'));
    CONTINUE WHEN to_regclass(partition_name) IS NOT NULL;
    BEGIN
      -- Même création que oz_audit_ensure_partitions (lot 1.1), mois par mois.
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF audit_log FOR VALUES FROM (%L) TO (%L)',
        partition_name,
        (month_start::timestamp AT TIME ZONE 'UTC'),
        ((month_start + INTERVAL '1 month')::timestamp AT TIME ZONE 'UTC')
      );
      EXECUTE format(
        'CREATE TRIGGER audit_log_forbid_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION oz_audit_immutable()',
        partition_name
      );
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
      EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', partition_name);
    EXCEPTION WHEN OTHERS THEN
      failed_months := failed_months + 1;
      error_code := SQLSTATE;
    END;
  END LOOP;
  SELECT count(*) INTO default_rows FROM audit_log_default;
  RETURN NEXT;
END $$;

-- Tête de la chaîne, que le worker ancre hors de la base (D-060).
CREATE FUNCTION oz_audit_head() RETURNS TABLE (head_position bigint, head_hash bytea)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'journal d''audit : tête réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT s.last_position, s.last_hash FROM audit_chain_state s WHERE s.id;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Vérification (CP-23, D-060) : chaîne entière (hachages, continuité, tête), puis concordance avec
-- l'ancre externe la plus récente. Une réécriture complète et cohérente de la chaîne passe le premier
-- contrôle mais pas le second : l'entrée ancrée n'a plus le hachage ancré, ou n'existe plus. Le
-- verrou concurrent est inutile : la tête est lue avant la chaîne, une entrée ajoutée entre-temps
-- est vérifiée à l'exécution suivante (READ COMMITTED : la tête et la chaîne sont lues sous deux
-- instantanés, `head_position` peut donc être inférieure à la dernière position vérifiée). Le
-- résultat est consigné ; il ne dépend d'aucune valeur du worker hormis l'ancre lue au stockage.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_audit_check(p_anchor_position bigint, p_anchor_hash bytea)
RETURNS TABLE (checked_at timestamptz, head_position bigint, anchor_position bigint,
  defect_position bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  head audit_chain_state;
  defect bigint;
  anchored bytea;
  previous_anchor bigint;
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'journal d''audit : vérification réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (p_anchor_position IS NULL) <> (p_anchor_hash IS NULL)
     OR p_anchor_position < 1 OR length(p_anchor_hash) <> 32 THEN
    RAISE EXCEPTION 'journal d''audit : ancre incomplète ou hors format' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO head FROM audit_chain_state s WHERE s.id;
  defect := oz_audit_verify_chain();
  IF defect IS NULL AND p_anchor_position IS NOT NULL THEN
    IF p_anchor_position > head.last_position THEN
      -- Chaîne tronquée sous l'ancre : la première entrée manquante est en défaut.
      defect := head.last_position + 1;
    ELSE
      SELECT a.hash INTO anchored FROM audit_log a WHERE a.chain_position = p_anchor_position;
      IF anchored IS DISTINCT FROM p_anchor_hash THEN defect := p_anchor_position; END IF;
    END IF;
  END IF;
  -- Ancre en recul (la plus récente effacée ou masquée au stockage) : l'ancre disparue est en
  -- défaut, et le reste tant qu'une ancre au moins aussi avancée n'est pas relue.
  IF defect IS NULL THEN
    SELECT max(c.anchor_position) INTO previous_anchor FROM audit_chain_checks c;
    IF previous_anchor > coalesce(p_anchor_position, 0) THEN defect := previous_anchor; END IF;
  END IF;
  INSERT INTO audit_chain_checks (head_position, anchor_position, defect_position)
    VALUES (head.last_position, p_anchor_position, defect)
    RETURNING audit_chain_checks.checked_at, audit_chain_checks.head_position,
      audit_chain_checks.anchor_position, audit_chain_checks.defect_position
    INTO checked_at, head_position, anchor_position, defect_position;
  RETURN NEXT;
END $$;

REVOKE EXECUTE ON FUNCTION oz_audit_maintain_partitions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_audit_head() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_audit_check(bigint, bytea) FROM PUBLIC;
-- Fonctions du lot 1.1 : jamais appelées directement par l'application.
REVOKE EXECUTE ON FUNCTION oz_audit_ensure_partitions(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_audit_verify_chain() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    RAISE EXCEPTION 'rôle oz_worker absent : appliquer Terraform avant cette migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    GRANT EXECUTE ON FUNCTION oz_audit_maintain_partitions() TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_audit_head() TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_audit_check(bigint, bytea) TO oz_worker;
    -- Évaluée par la politique de lecture admin : une lecture directe du worker rend alors « rien »
    -- (aucun contexte utilisateur, donc aucun rôle) au lieu d'une erreur de droit.
    GRANT EXECUTE ON FUNCTION oz_has_verified_role(role_kind[]) TO oz_worker;
  END IF;
END $$;
