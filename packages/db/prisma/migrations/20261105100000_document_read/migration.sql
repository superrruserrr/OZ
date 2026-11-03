-- Lecture des documents (lot 1.9ca, EX-110 n° 6) : l'API délivre une URL signée de 5 minutes pour une
-- pièce saine, à qui a `document.read` (CASL), et inscrit chaque lecture au journal d'audit
-- (`audit_log_insert_self`, au nom de l'acteur).

-- Purge du fichier (lot 1.9cb, D-062) : posée une seule fois par le chemin privilégié, définitive.
-- Une pièce purgée garde son empreinte et ses métadonnées, et n'est plus jamais lisible.
ALTER TABLE "documents" ADD COLUMN "purged_at" TIMESTAMPTZ(6);

-- Revue KYC (lot 1.11) : l'administrateur vérifié lit toute pièce ; jamais d'écriture.
CREATE POLICY "documents_admin_read" ON "documents" FOR SELECT
  USING ((SELECT oz_has_verified_role(ARRAY['admin']::role_kind[])));

-- Elle n'ouvre aucun rattachement : `oz_kyc_case_documents_guard` refuse déjà une pièce qui ne
-- concerne pas le sujet du dossier KYC (testé).

-- Sujet d'une pièce encore en place (joueur, tuteur ou organisation non supprimé). L'administrateur
-- lit toute pièce sans voir les fiches tuteur ni les organisations : `readableDocumentFor` ne
-- l'appelle que sur une pièce déjà lue sous la RLS du demandeur. Elle ne rend qu'un booléen, faux
-- pour une pièce inconnue, et n'est exécutable que par `oz_app` (revue D-064).
CREATE FUNCTION oz_document_subject_live(p_document uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.id = p_document
      AND (d.player_id IS NULL OR EXISTS (
        SELECT 1 FROM players p WHERE p.id = d.player_id AND p.deleted_at IS NULL))
      AND (d.guardian_id IS NULL OR EXISTS (
        SELECT 1 FROM guardians g WHERE g.id = d.guardian_id AND g.deleted_at IS NULL))
      AND (d.organization_id IS NULL OR EXISTS (
        SELECT 1 FROM organizations o WHERE o.id = d.organization_id AND o.deleted_at IS NULL)))
$$;
REVOKE EXECUTE ON FUNCTION oz_document_subject_live(uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_document_subject_live(uuid) TO oz_app;
  END IF;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Garde (lot 1.9b) étendue : `purged_at` ne passe que de NULL à une valeur, par le chemin privilégié.
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
  RETURN NEW;
END $$;
