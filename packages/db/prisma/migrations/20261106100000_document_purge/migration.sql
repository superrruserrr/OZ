-- Purge du coffre documentaire (lot 1.9cb, EX-110 n° 7, CP-20, ADR-008) : le worker supprime le
-- fichier d'une pièce échue puis la marque purgée ; il retire les objets que la base ne reconnaît
-- plus (D-062, D-092) et relance ou clôt les analyses abandonnées (D-099). Comme l'analyse, tout
-- passe par des fonctions SECURITY DEFINER réservées à `oz_worker`, hors contexte utilisateur.

-- Ré-encodage dont la sortie dépasse la borne de dépôt (50 Mo) : rejet définitif (D-099, D4).
ALTER TABLE "documents" DROP CONSTRAINT "documents_rejection_reason_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_rejection_reason_check" CHECK (
    ("av_status"::text = 'rejected') = ("rejection_reason" IS NOT NULL)
    AND ("rejection_reason" IS NULL
      OR "rejection_reason" IN ('dimensions', 'pages', 'unreadable', 'hash_mismatch', 'too_large')));

-- Une pièce purgée perd son numéro chiffré mais garde son empreinte (`document_number_hmac`) : preuve
-- et doublons KYC (ADR-008, D3). Hors purge, le numéro et son empreinte vont toujours ensemble.
ALTER TABLE "documents" DROP CONSTRAINT "documents_encrypted_pairs_check";
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_encrypted_pairs_check" CHECK (
    ("document_number_encrypted" IS NULL) = ("document_number_hmac" IS NULL)
    OR ("purged_at" IS NOT NULL AND "document_number_encrypted" IS NULL));

-- Pièces échues encore à purger, par ordre d'échéance.
CREATE INDEX "documents_purged_at_retention_until_idx" ON "documents"("purged_at", "retention_until");

-- Le chemin privilégié lit les intentions (orphelins `incoming/`) et les seules délivrances d'URL
-- de lecture (D-101) ; aucun utilisateur n'y gagne de lecture.
CREATE POLICY "document_uploads_privileged_read" ON "document_uploads" FOR SELECT
  USING (oz_privileged());
CREATE POLICY "audit_log_privileged_read_document_reads" ON "audit_log" FOR SELECT
  USING (oz_privileged() AND "action" = 'document.read.granted');

-- ---------------------------------------------------------------------------------------------
-- Garde (lots 1.9b, 1.9ca) étendue : une purge efface les données extraites (OCR, numéro chiffré)
-- dans la même écriture, et une pièce purgée ne les retrouve jamais (D3). L'empreinte du numéro
-- (`document_number_hmac`) reste : preuve et doublons KYC (ADR-008).
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION oz_documents_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  cleaned boolean := OLD.av_status = 'pending' AND NEW.av_status = 'clean' AND oz_privileged()
    AND NEW.storage_key = 'clean/' || NEW.id::text;
BEGIN
  IF (NEW.type, NEW.player_id, NEW.guardian_id, NEW.organization_id, NEW.uploaded_by, NEW.mime_type, NEW.sha256)
     IS DISTINCT FROM (OLD.type, OLD.player_id, OLD.guardian_id, OLD.organization_id, OLD.uploaded_by, OLD.mime_type, OLD.sha256)
     OR (NOT cleaned AND (NEW.storage_key, NEW.size_bytes) IS DISTINCT FROM (OLD.storage_key, OLD.size_bytes)) THEN
    RAISE EXCEPTION 'sujet et contenu d''une pièce figés : déposer une nouvelle pièce' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.av_status, NEW.av_checked_at, NEW.rejection_reason, NEW.width, NEW.height, NEW.page_count,
      NEW.perceptual_hash)
     IS DISTINCT FROM (OLD.av_status, OLD.av_checked_at, OLD.rejection_reason, OLD.width, OLD.height,
      OLD.page_count, OLD.perceptual_hash)
     AND (OLD.av_status <> 'pending' OR NEW.av_status = 'pending' OR NOT oz_privileged()) THEN
    RAISE EXCEPTION 'verdict d''analyse définitif, écrit une seule fois' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.purged_at IS DISTINCT FROM OLD.purged_at
     AND (OLD.purged_at IS NOT NULL OR NOT oz_privileged()) THEN
    RAISE EXCEPTION 'purge d''une pièce définitive, posée une seule fois par le chemin privilégié'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.purged_at IS NOT NULL
     AND (NEW.ocr_extract_encrypted IS NOT NULL OR NEW.document_number_encrypted IS NOT NULL) THEN
    RAISE EXCEPTION 'pièce purgée : données extraites effacées définitivement' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Une URL de lecture délivrée reste valable 5 minutes (lot 1.9ca) : le fichier n'est supprimé
-- qu'au-delà (D-101). Lit le journal sous le chemin privilégié seulement ; aucun droit d'exécution.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_document_read_recently(p_document uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM audit_log a
    WHERE a.target_type = 'document' AND a.target_id = p_document
      AND a.action = 'document.read.granted' AND a.created_at > now() - interval '5 minutes')
$$;
REVOKE EXECUTE ON FUNCTION oz_document_read_recently(uuid) FROM PUBLIC;

-- Purgeable : échue, pas encore purgée, sans URL délivrée depuis 5 minutes. Une pièce encore en
-- analyse attend son verdict (le balayage la clôt), sauf si elle est supprimée (jamais analysée).
CREATE FUNCTION oz_document_purgeable(d documents) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT d.purged_at IS NULL AND d.retention_until <= now()
    AND (d.av_status <> 'pending' OR d.deleted_at IS NOT NULL)
    AND NOT oz_document_read_recently(d.id)
$$;
REVOKE EXECUTE ON FUNCTION oz_document_purgeable(documents) FROM PUBLIC;

CREATE FUNCTION oz_document_purge_due(p_limit integer)
RETURNS TABLE (id uuid, type document_type)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'purge des documents : réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'purge des documents : lot de 1 à 500' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY SELECT d.id, d.type FROM documents d
    WHERE d.purged_at IS NULL AND d.retention_until <= now() AND oz_document_purgeable(d)
    ORDER BY d.retention_until, d.id LIMIT p_limit;
END $$;

-- Marque la pièce purgée une fois ses fichiers supprimés : conditions relues sous verrou, données
-- extraites effacées, empreinte et métadonnées conservées, audit sans acteur. `skipped` sinon.
CREATE FUNCTION oz_document_purge_finish(p_document uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  doc documents%ROWTYPE;
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'purge des documents : réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO doc FROM documents d WHERE d.id = p_document FOR UPDATE;
  IF NOT FOUND OR NOT oz_document_purgeable(doc) THEN RETURN 'skipped'; END IF;

  UPDATE documents SET purged_at = now(), ocr_extract_encrypted = NULL,
    document_number_encrypted = NULL
  WHERE documents.id = doc.id;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'document.purge.done', 'document', doc.id,
    'Conservation échue : fichier supprimé, empreinte et métadonnées conservées',
    jsonb_build_object('document_type', doc.type, 'av_status', doc.av_status));
  RETURN 'done';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Objets orphelins (D-062, D-092) : parmi les clés listées dans le bucket (500 au plus), celles que
-- rien ne justifie. `incoming/` : intention absente, close ou échue depuis 15 minutes ;
-- `quarantine/` : document absent ou déjà jugé ; `clean/` : document absent, purgé, ou jugé autrement
-- que sain. Le `clean/` d'une pièce encore `pending` est gardé : un essai rejoué réécrit la même clé
-- puis la juge saine (lot 1.9b) ; passée `error` par le balayage, elle devient orpheline.
-- Le worker ne soumet que des objets d'au moins une heure (copie et analyse en cours exclues).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_document_storage_orphans(p_keys text[]) RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'purge des documents : réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_keys IS NULL OR cardinality(p_keys) > 500 THEN
    RAISE EXCEPTION 'objets orphelins : 500 clés au plus' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY
  WITH k AS (
    SELECT DISTINCT key, split_part(key, '/', 1) AS prefix, split_part(key, '/', 2)::uuid AS ref
    FROM unnest(p_keys) AS key
    WHERE key ~* '^(incoming|quarantine|clean)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  SELECT k.key FROM k
  WHERE (k.prefix = 'incoming' AND NOT EXISTS (
      SELECT 1 FROM document_uploads u WHERE u.id = k.ref AND u.status = 'issued'
        AND u.expires_at > now() - interval '15 minutes'))
    OR (k.prefix = 'quarantine' AND NOT EXISTS (
      SELECT 1 FROM documents d WHERE d.id = k.ref AND d.av_status = 'pending' AND d.purged_at IS NULL))
    OR (k.prefix = 'clean' AND NOT EXISTS (
      SELECT 1 FROM documents d WHERE d.id = k.ref AND d.av_status IN ('clean', 'pending')
        AND d.purged_at IS NULL))
  ORDER BY k.key;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Analyses abandonnées (D-099) : document `pending` non supprimé depuis 30 minutes → `requeue`
-- (nouvelle mise en file) ; depuis 24 heures → `fail` (verdict `error` par la fonction d'analyse).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_document_stale_pending(p_limit integer)
RETURNS TABLE (id uuid, action text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'purge des documents : réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'purge des documents : lot de 1 à 500' USING ERRCODE = 'check_violation';
  END IF;
  RETURN QUERY SELECT d.id,
      CASE WHEN d.created_at <= now() - interval '24 hours' THEN 'fail' ELSE 'requeue' END
    FROM documents d
    WHERE d.av_status = 'pending' AND d.deleted_at IS NULL
      AND d.created_at <= now() - interval '30 minutes'
    ORDER BY d.created_at, d.id LIMIT p_limit;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution (convention D-066) : `oz_worker` seul, comme l'analyse (lot 1.9b).
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_document_purge_due(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_document_purge_finish(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_document_storage_orphans(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_document_stale_pending(integer) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    RAISE EXCEPTION 'rôle oz_worker absent : appliquer Terraform avant cette migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    GRANT EXECUTE ON FUNCTION oz_document_purge_due(integer) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_document_purge_finish(uuid) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_document_storage_orphans(text[]) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_document_stale_pending(integer) TO oz_worker;
  END IF;
END $$;
