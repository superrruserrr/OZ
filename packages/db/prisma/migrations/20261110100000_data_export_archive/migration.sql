-- Lot 1.16bb : cycle de vie d'une demande d'export, conduit par le worker (`oz_worker`) hors de tout
-- contexte utilisateur. Archive sous `exports/<demande>.json`, disponible 7 jours (D3), chaque
-- transition auditée dans sa transaction. Les motifs d'échec sont des codes internes, sans donnée.

ALTER TABLE "data_export_requests"
  ADD CONSTRAINT "data_export_requests_storage_key_check"
    CHECK ("storage_key" IS NULL OR "storage_key" = 'exports/' || "id"::text || '.json'),
  ADD CONSTRAINT "data_export_requests_failure_reason_check"
    CHECK ("failure_reason" IS NULL OR "failure_reason" ~ '^[a-z_]{1,40}$');

CREATE FUNCTION oz_data_export_worker_only() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'export : réservé au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

-- Compte en état d'être servi : ni supprimé, ni suspendu, ni clos (comme `oz_data_export_download`).
CREATE FUNCTION oz_data_export_account_live(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user AND u.deleted_at IS NULL
    AND u.status IN ('pending_verification', 'active'))
$$;

-- Échec définitif, motif interne (`[a-z_]`), audité. Rend `done`, sinon le statut en place (rien
-- n'est changé) ou `unknown` : l'appelant ne retire l'archive que si la demande n'est pas `ready`.
CREATE FUNCTION oz_data_export_fail(p_request uuid, p_reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  done data_export_requests;
  current_status text;
BEGIN
  PERFORM oz_data_export_worker_only();
  UPDATE data_export_requests SET status = 'failed', failure_reason = p_reason, updated_at = now()
    WHERE id = p_request AND status IN ('pending', 'processing')
    RETURNING * INTO done;
  IF NOT FOUND THEN
    SELECT status INTO current_status FROM data_export_requests WHERE id = p_request;
    RETURN coalesce(current_status, 'unknown');
  END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'data.export.failed', 'user', done.user_id, 'Export des données en échec',
    jsonb_build_object('request_id', done.id, 'reason', p_reason));
  RETURN 'done';
END $$;

-- Prise en charge : `pending`, ou `processing` repris après un essai interrompu. Rend le compte à
-- exporter, NULL si la demande n'est plus à produire (déjà prête, échouée, expirée, inconnue). Un
-- compte supprimé, suspendu ou clos fait échouer la demande (`account_gone`) : rien n'est produit.
CREATE FUNCTION oz_data_export_claim(p_request uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid;
BEGIN
  PERFORM oz_data_export_worker_only();
  UPDATE data_export_requests SET status = 'processing', updated_at = now()
    WHERE id = p_request AND status IN ('pending', 'processing')
    RETURNING user_id INTO owner;
  IF owner IS NOT NULL AND NOT oz_data_export_account_live(owner) THEN
    PERFORM oz_data_export_fail(p_request, 'account_gone');
    RETURN NULL;
  END IF;
  RETURN owner;
END $$;

-- Archive écrite : demande prête pour 7 jours, auditée. Rend `done` ; `account_gone` si le compte
-- n'est plus en état (demande passée `failed`, l'appelant retire l'archive) ; sinon le statut en
-- place ou `unknown`, sans rien changer.
CREATE FUNCTION oz_data_export_finish(p_request uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  done data_export_requests;
  current_status text;
  owner uuid;
BEGIN
  PERFORM oz_data_export_worker_only();
  SELECT user_id INTO owner FROM data_export_requests
    WHERE id = p_request AND status = 'processing' FOR UPDATE;
  IF owner IS NOT NULL AND NOT oz_data_export_account_live(owner) THEN
    PERFORM oz_data_export_fail(p_request, 'account_gone');
    RETURN 'account_gone';
  END IF;
  UPDATE data_export_requests
    SET status = 'ready', storage_key = 'exports/' || id::text || '.json', ready_at = now(),
      expires_at = now() + interval '7 days', updated_at = now()
    WHERE id = p_request AND status = 'processing'
    RETURNING * INTO done;
  IF NOT FOUND THEN
    SELECT status INTO current_status FROM data_export_requests WHERE id = p_request;
    RETURN coalesce(current_status, 'unknown');
  END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'data.export.ready', 'user', done.user_id, 'Archive d''export prête',
    jsonb_build_object('request_id', done.id));
  RETURN 'done';
END $$;

-- Travail de maintenance : archives échues (`expire`), demandes sans nouvelle depuis 30 minutes
-- (`requeue`, horodatées pour ne revenir qu'une fois par demi-heure) ou depuis 24 heures (`fail`).
CREATE FUNCTION oz_data_export_due(p_limit integer)
RETURNS TABLE (id uuid, action text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_data_export_worker_only();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'export : lot de 1 à 500' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY
  WITH due AS (
    SELECT r.id, CASE
        WHEN r.status = 'ready' THEN 'expire'
        WHEN r.requested_at <= now() - interval '24 hours' THEN 'fail'
        ELSE 'requeue' END AS action
    FROM data_export_requests r
    WHERE (r.status = 'ready' AND r.expires_at <= now())
       OR (r.status IN ('pending', 'processing') AND r.updated_at <= now() - interval '30 minutes')
    ORDER BY r.updated_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ), touched AS (
    UPDATE data_export_requests r SET updated_at = now()
    FROM due WHERE r.id = due.id AND due.action = 'requeue'
  )
  SELECT due.id, due.action FROM due;
END $$;

-- Archive supprimée du stockage : demande `expired`, clé effacée. Faux si elle n'était pas échue.
CREATE FUNCTION oz_data_export_expire(p_request uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  done data_export_requests;
BEGIN
  PERFORM oz_data_export_worker_only();
  UPDATE data_export_requests SET status = 'expired', storage_key = NULL, updated_at = now()
    WHERE id = p_request AND status = 'ready' AND expires_at <= now()
    RETURNING * INTO done;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'data.export.expired', 'user', done.user_id, 'Archive d''export supprimée',
    jsonb_build_object('request_id', done.id));
  RETURN true;
END $$;

-- Téléchargement (API, contexte du titulaire) : clé de l'archive prête et non échue de sa
-- dernière demande, auditée `data.export.downloaded` avant toute signature ; NULL sinon.
CREATE FUNCTION oz_data_export_download() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  found_request data_export_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'export : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO found_request FROM data_export_requests r
    WHERE r.user_id = me AND r.status = 'ready' AND r.expires_at > now()
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
        AND u.status IN ('pending_verification', 'active'));
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'data.export.downloaded', 'user', me, 'Archive d''export délivrée',
    jsonb_build_object('request_id', found_request.id));
  RETURN found_request.storage_key;
END $$;

REVOKE EXECUTE ON FUNCTION oz_data_export_worker_only() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_account_live(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_claim(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_finish(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_fail(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_due(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_expire(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_data_export_download() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    RAISE EXCEPTION 'rôle oz_worker absent : appliquer Terraform avant cette migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    GRANT EXECUTE ON FUNCTION oz_data_export_claim(uuid) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_data_export_finish(uuid) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_data_export_fail(uuid, text) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_data_export_due(integer) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_data_export_expire(uuid) TO oz_worker;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_data_export_download() TO oz_app;
  END IF;
END $$;
