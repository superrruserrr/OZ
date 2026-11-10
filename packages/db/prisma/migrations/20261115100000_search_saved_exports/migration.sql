-- Lot 1.14b (EX-116 n° 3, 4, 7) : recherches sauvegardées et inscription des exports CSV de la
-- recherche. Une sauvegarde ne porte que des critères et un tri (D2), privée à son titulaire ; un
-- export est inscrit et audité par oz_search_export_record, qui tient le quota du palier (D3, D5).

-- Recherches sauvegardées : 20 au plus par compte, immuables (supprimer puis recréer).
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '{}',
    "sort" TEXT NOT NULL,
    "direction" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "saved_searches_name_check" CHECK (char_length("name") BETWEEN 1 AND 60),
    -- Critères validés par l'API (contrat) ; la base borne la forme et la taille.
    CONSTRAINT "saved_searches_criteria_check"
      CHECK (jsonb_typeof("criteria") = 'object' AND octet_length("criteria"::text) <= 2048),
    CONSTRAINT "saved_searches_sort_check" CHECK ("sort" IN ('name', 'birthYear', 'recent', 'relevance')),
    CONSTRAINT "saved_searches_direction_check" CHECK ("direction" IS NULL OR "direction" IN ('asc', 'desc'))
);
CREATE INDEX "saved_searches_user_id_created_at_idx" ON "saved_searches"("user_id", "created_at");
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "saved_searches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_searches" FORCE ROW LEVEL SECURITY;

-- Le titulaire lit et supprime les siennes ; création par oz_saved_search_create ; personne ne
-- les modifie.
CREATE POLICY "saved_searches_owner_read" ON "saved_searches" FOR SELECT
  USING ("user_id" = (SELECT oz_current_user_id()));
CREATE POLICY "saved_searches_owner_delete" ON "saved_searches" FOR DELETE
  USING ("user_id" = (SELECT oz_current_user_id()));
CREATE POLICY "saved_searches_privileged" ON "saved_searches" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- 20 au plus par compte : verrou consultatif du compte, puis compte (deux créations simultanées
-- ne passent pas toutes deux). Lève `saved_searches_limit` (check_violation) au-delà.
CREATE FUNCTION oz_saved_searches_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('oz.saved_searches:' || NEW.user_id::text, 0));
  IF (SELECT count(*) FROM saved_searches s WHERE s.user_id = NEW.user_id) >= 20 THEN
    RAISE EXCEPTION 'saved_searches_limit' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "saved_searches_limit" BEFORE INSERT ON "saved_searches"
  FOR EACH ROW EXECUTE FUNCTION oz_saved_searches_limit();

-- Création pour le compte du contexte : même verrou (réentrant), puis compte ; au-delà de 20, rend
-- {outcome: limit} sans lever (la transaction de l'API reste utilisable), sinon
-- {outcome: created, id, createdAt}. Lève sans contexte utilisateur.
CREATE FUNCTION oz_saved_search_create(p_name text, p_criteria jsonb, p_sort text, p_direction text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  created saved_searches;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'recherche sauvegardée : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('oz.saved_searches:' || me::text, 0));
  IF (SELECT count(*) FROM saved_searches s WHERE s.user_id = me) >= 20 THEN
    RETURN jsonb_build_object('outcome', 'limit');
  END IF;
  INSERT INTO saved_searches (user_id, name, criteria, sort, direction)
  VALUES (me, p_name, p_criteria, p_sort, p_direction) RETURNING * INTO created;
  RETURN jsonb_build_object('outcome', 'created', 'id', created.id, 'createdAt', created.created_at);
END $$;

-- Effacement du compte (EX-118 n° 3) : ses sauvegardes disparaissent dès que le compte est clos
-- (`deleted_at` posé par oz_account_anonymize) ; un nom ou un texte libre peut nommer quelqu'un.
CREATE FUNCTION oz_saved_searches_erase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  DELETE FROM saved_searches WHERE user_id = NEW.id;
  RETURN NULL;
END $$;
CREATE TRIGGER "users_erase_saved_searches" AFTER UPDATE OF "deleted_at" ON "users"
  FOR EACH ROW WHEN (OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL)
  EXECUTE FUNCTION oz_saved_searches_erase();

-- Exports CSV de la recherche : compte, organisation imputée (NULL : administrateur, sans quota),
-- nombre de lignes, tri et noms des critères (jamais leurs valeurs). Traçabilité du filigrane (D4)
-- et compte du quota (D3). Inscrits par oz_search_export_record seulement.
CREATE TABLE "search_exports" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "row_count" INTEGER NOT NULL,
    "sort" TEXT NOT NULL,
    "criteria_keys" TEXT[] NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "search_exports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "search_exports_row_count_check" CHECK ("row_count" BETWEEN 0 AND 10000),
    CONSTRAINT "search_exports_sort_check" CHECK ("sort" IN ('name', 'birthYear', 'recent', 'relevance')),
    CONSTRAINT "search_exports_criteria_keys_check" CHECK (cardinality("criteria_keys") <= 20)
);
CREATE INDEX "search_exports_organization_id_created_at_idx" ON "search_exports"("organization_id", "created_at");
CREATE INDEX "search_exports_user_id_created_at_idx" ON "search_exports"("user_id", "created_at");
ALTER TABLE "search_exports" ADD CONSTRAINT "search_exports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "search_exports" ADD CONSTRAINT "search_exports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "search_exports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "search_exports" FORCE ROW LEVEL SECURITY;

CREATE POLICY "search_exports_owner_read" ON "search_exports" FOR SELECT
  USING ("user_id" = (SELECT oz_current_user_id()));
CREATE POLICY "search_exports_privileged" ON "search_exports" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Quota d'export d'une organisation (D3, CP-33) : abonnement courant relu en base, palier gratuit
-- par défaut (3 exports par 24 heures, 200 lignes, à confirmer par Q8) ; une valeur de
-- `subscriptions.quotas` hors bornes est ignorée. Mêmes règles que `exportQuotaOf` (API). Interne :
-- appelée par oz_search_export_record seulement.
CREATE FUNCTION oz_search_export_quota(p_organization uuid, OUT tier text, OUT per_day integer,
  OUT max_rows integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  q jsonb := '{}';
BEGIN
  tier := 'free';
  SELECT s.tier, s.quotas INTO tier, q FROM subscriptions s
    WHERE s.organization_id = p_organization AND s.deleted_at IS NULL
      AND s.status IN ('trialing', 'active', 'past_due') AND s.period_end > now()
    LIMIT 1;
  IF NOT FOUND THEN tier := 'free'; q := '{}'; END IF;
  per_day := CASE WHEN jsonb_typeof(q -> 'searchExportsPerDay') = 'number'
      AND (q ->> 'searchExportsPerDay')::numeric BETWEEN 0 AND 1000
      AND (q ->> 'searchExportsPerDay')::numeric % 1 = 0
    THEN (q ->> 'searchExportsPerDay')::integer ELSE 3 END;
  max_rows := CASE WHEN jsonb_typeof(q -> 'searchExportRows') = 'number'
      AND (q ->> 'searchExportRows')::numeric BETWEEN 1 AND 1000
      AND (q ->> 'searchExportRows')::numeric % 1 = 0
    THEN (q ->> 'searchExportRows')::integer ELSE 200 END;
END $$;

-- Inscription d'un export (D3, D5). `p_organization` : organisation imputée, dont le lecteur est
-- membre vérifié (club, fédération, recruteur) ; NULL pour l'administrateur seul, sans quota (1 000
-- lignes au plus). Le quota est relu en base (oz_search_export_quota), jamais reçu de l'appelant ;
-- un nombre de lignes au-delà du palier lève. Verrou consultatif de l'organisation : deux exports
-- simultanés ne dépassent pas le quota. Rend {outcome: accepted, id, createdAt} ou
-- {outcome: quota_exceeded, tier, resetAt} sans rien écrire ; lève sans contexte utilisateur ou
-- hors de ces cas.
CREATE FUNCTION oz_search_export_record(
  p_organization uuid, p_rows integer, p_sort text, p_criteria text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  quota record;
  used integer;
  reset_at timestamptz;
  created search_exports;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'export de recherche : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_organization IS NULL THEN
    IF NOT EXISTS (SELECT 1 FROM user_roles r
                   WHERE r.user_id = me AND r.role = 'admin' AND r.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'export de recherche : organisation requise' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF p_rows > 1000 THEN
      RAISE EXCEPTION 'export de recherche : lignes au-delà du plafond' USING ERRCODE = 'invalid_parameter_value';
    END IF;
  ELSE
    IF NOT oz_is_verified_member(p_organization, ARRAY['club', 'federation', 'recruiter']::role_kind[]) THEN
      RAISE EXCEPTION 'export de recherche : organisation hors des rôles du compte'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('oz.search_exports:' || p_organization::text, 0));
    SELECT * INTO quota FROM oz_search_export_quota(p_organization);
    IF p_rows > quota.max_rows THEN
      RAISE EXCEPTION 'export de recherche : lignes au-delà du palier' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT count(*) INTO used FROM search_exports e
      WHERE e.organization_id = p_organization AND e.created_at > now() - interval '24 hours';
    IF used >= quota.per_day THEN
      -- Une place se libère quand assez d'exports sortent de la fenêtre pour repasser sous le
      -- quota (palier abaissé compris) ; palier à zéro : aucune avant 24 heures.
      IF quota.per_day = 0 THEN
        reset_at := now() + interval '24 hours';
      ELSE
        SELECT e.created_at + interval '24 hours' INTO reset_at FROM search_exports e
          WHERE e.organization_id = p_organization AND e.created_at > now() - interval '24 hours'
          ORDER BY e.created_at OFFSET used - quota.per_day LIMIT 1;
      END IF;
      RETURN jsonb_build_object('outcome', 'quota_exceeded', 'tier', quota.tier, 'resetAt', reset_at);
    END IF;
  END IF;
  INSERT INTO search_exports (user_id, organization_id, row_count, sort, criteria_keys)
  VALUES (me, p_organization, p_rows, p_sort, coalesce(p_criteria, '{}'))
  RETURNING * INTO created;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'player.search.exported', 'search_export', created.id, 'Export de recherche',
    jsonb_build_object('sort', created.sort, 'criteria', to_jsonb(created.criteria_keys),
      'rows', created.row_count, 'organization_id', created.organization_id));
  RETURN jsonb_build_object('outcome', 'accepted', 'id', created.id, 'createdAt', created.created_at);
END $$;

REVOKE EXECUTE ON FUNCTION oz_saved_searches_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_saved_searches_erase() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_saved_search_create(text, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_search_export_quota(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_search_export_record(uuid, integer, text, text[]) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_saved_search_create(text, jsonb, text, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_search_export_record(uuid, integer, text, text[]) TO oz_app;
  END IF;
END $$;
