-- Analyse des documents (lot 1.9b, EX-110 n° 2 à 5) : le worker `document-scan` réclame un document
-- `pending`, l'analyse hors de la base (ClamAV, ré-encodage, bornes) puis écrit un verdict unique.
-- Aucune écriture directe : deux fonctions SECURITY DEFINER (chemin privilégié, D-059), appelables
-- hors de tout contexte utilisateur seulement, écrivent verdict et journal dans la même transaction.

-- Fichier sain mais hors bornes ou illisible (D3). `error` reste réservé à l'analyse impossible.
ALTER TYPE "av_status" ADD VALUE 'rejected';

ALTER TABLE "documents"
  ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "page_count" INTEGER,
  ADD COLUMN "perceptual_hash" BIGINT;

-- Comparaison au texte : la nouvelle valeur d'énumération n'est utilisable qu'après validation.
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_rejection_reason_check" CHECK (
    ("av_status"::text = 'rejected') = ("rejection_reason" IS NOT NULL)
    AND ("rejection_reason" IS NULL
      OR "rejection_reason" IN ('dimensions', 'pages', 'unreadable', 'hash_mismatch'))),
  ADD CONSTRAINT "documents_dimensions_check" CHECK (
    ("width" IS NULL) = ("height" IS NULL) AND ("width" IS NULL OR ("width" > 0 AND "height" > 0))),
  ADD CONSTRAINT "documents_page_count_check" CHECK ("page_count" IS NULL OR "page_count" BETWEEN 1 AND 20),
  -- Empreinte perceptuelle : images seulement, jamais sans dimensions.
  ADD CONSTRAINT "documents_perceptual_hash_check" CHECK ("perceptual_hash" IS NULL OR "width" IS NOT NULL),
  -- Le fichier ré-encodé (`clean/<id>`) va avec le verdict `clean`, et lui seul (D4).
  ADD CONSTRAINT "documents_clean_key_check" CHECK (
    ("av_status"::text = 'clean') = ("storage_key" = 'clean/' || "id"::text));

-- Doublons d'empreinte (D6) : signal pour le KYC (lot 1.10), hors de `documents` que le sujet lit.
-- Aucune politique utilisateur : seul le chemin privilégié lit et écrit.
CREATE TABLE "document_duplicates" (
    "document_id" UUID NOT NULL,
    "duplicate_of_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "document_duplicates_pkey" PRIMARY KEY ("document_id"),
    CONSTRAINT "document_duplicates_distinct_check" CHECK ("duplicate_of_id" <> "document_id")
);
CREATE INDEX "document_duplicates_duplicate_of_id_idx" ON "document_duplicates"("duplicate_of_id");
ALTER TABLE "document_duplicates" ADD CONSTRAINT "document_duplicates_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_duplicates" ADD CONSTRAINT "document_duplicates_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_duplicates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_duplicates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "document_duplicates_privileged" ON "document_duplicates" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Le chemin privilégié lit et met à jour une pièce ; jamais un utilisateur (aucune autre politique UPDATE).
CREATE POLICY "documents_privileged_read" ON "documents" FOR SELECT USING (oz_privileged());
CREATE POLICY "documents_privileged_update" ON "documents" FOR UPDATE
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- ---------------------------------------------------------------------------------------------
-- Garde : sujet et contenu figés, sauf le remplacement unique du fichier en quarantaine par sa
-- version ré-encodée (`clean/<id>`, même type, nouvelle taille) au verdict `clean`. Un verdict est
-- définitif ; les métadonnées d'analyse ne s'écrivent qu'avec lui, par le chemin privilégié seul.
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
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Réclamation : le document encore `pending` et non supprimé, ou rien (job rejoué, document
-- inconnu ou retiré : le worker l'ignore, D-092).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_document_scan_claim(p_document uuid)
RETURNS TABLE (id uuid, type document_type, storage_key text, mime_type text, size_bytes bigint, sha256 text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'analyse d''un document : réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT d.id, d.type, d.storage_key, d.mime_type, d.size_bytes, d.sha256
    FROM documents d
    WHERE d.id = p_document AND d.av_status = 'pending' AND d.deleted_at IS NULL;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Verdict (D3, D4, D6) : une seule fois, depuis `pending`. Contrôle la cohérence de chaque verdict,
-- signale un doublon d'empreinte appartenant à un autre sujet (sans rejet) et journalise.
-- Rend `done`, ou `skipped` si le document n'est plus `pending` (job rejoué).
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_document_scan_finish(
  p_document uuid, p_verdict text, p_reason text, p_size_bytes bigint, p_width integer,
  p_height integer, p_page_count integer, p_perceptual_hash bigint, p_signature text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  doc documents%ROWTYPE;
  duplicate uuid;
  image boolean := p_width IS NOT NULL OR p_height IS NOT NULL OR p_perceptual_hash IS NOT NULL;
  pdf boolean := p_page_count IS NOT NULL;
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'analyse d''un document : réservée au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_verdict IS NULL OR p_verdict NOT IN ('clean', 'infected', 'rejected', 'error') THEN
    RAISE EXCEPTION 'verdict d''analyse inconnu' USING ERRCODE = 'check_violation';
  END IF;
  -- Chaque verdict porte exactement ses traces, rien de plus.
  IF (p_verdict = 'clean') <> (p_size_bytes IS NOT NULL)
     OR (p_verdict = 'clean' AND (p_size_bytes NOT BETWEEN 1 AND 52428800
       OR image = (p_page_count IS NOT NULL)
       OR (image AND (p_width IS NULL OR p_height IS NULL OR p_perceptual_hash IS NULL))))
     OR (p_verdict <> 'clean' AND (image OR p_page_count IS NOT NULL))
     OR (p_verdict = 'rejected') <> (p_reason IS NOT NULL)
     OR (p_verdict = 'infected') <> (p_signature IS NOT NULL)
     OR (p_signature IS NOT NULL AND p_signature !~ '^[A-Za-z0-9._:-]{1,200}$') THEN
    RAISE EXCEPTION 'verdict d''analyse incohérent' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO doc FROM documents d WHERE d.id = p_document AND d.av_status = 'pending'
    AND d.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN 'skipped'; END IF;
  -- Mesures conformes au type réel vérifié à la réception : dimensions pour une image, pages pour un PDF.
  IF (image AND doc.mime_type NOT LIKE 'image/%') OR (pdf AND doc.mime_type <> 'application/pdf') THEN
    RAISE EXCEPTION 'verdict d''analyse incohérent avec le type du document' USING ERRCODE = 'check_violation';
  END IF;

  IF p_verdict = 'clean' THEN
    -- Même fichier déjà soumis pour un autre sujet (sain ou en cours d'analyse) : signal pour le
    -- KYC (lot 1.10), rangé à part, jamais lisible par un utilisateur.
    SELECT d.id INTO duplicate FROM documents d
      WHERE d.sha256 = doc.sha256 AND d.id <> doc.id AND d.deleted_at IS NULL
        AND d.av_status IN ('pending', 'clean')
        AND (d.player_id, d.guardian_id, d.organization_id)
          IS DISTINCT FROM (doc.player_id, doc.guardian_id, doc.organization_id)
      ORDER BY d.created_at, d.id LIMIT 1;
  END IF;

  UPDATE documents SET
    av_status = p_verdict::av_status, av_checked_at = now(), rejection_reason = p_reason,
    storage_key = CASE WHEN p_verdict = 'clean' THEN 'clean/' || doc.id::text ELSE doc.storage_key END,
    size_bytes = coalesce(p_size_bytes, doc.size_bytes), width = p_width, height = p_height,
    page_count = p_page_count, perceptual_hash = p_perceptual_hash
  WHERE documents.id = doc.id;
  IF duplicate IS NOT NULL THEN
    INSERT INTO document_duplicates (document_id, duplicate_of_id) VALUES (doc.id, duplicate);
  END IF;

  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'document.scan.' || p_verdict, 'document', doc.id,
    CASE p_verdict
      WHEN 'clean' THEN 'Document sain, ré-encodé si image'
      WHEN 'infected' THEN 'Document infecté, fichier supprimé'
      WHEN 'rejected' THEN 'Document hors bornes ou illisible, fichier supprimé'
      ELSE 'Analyse impossible après plusieurs essais'
    END,
    jsonb_strip_nulls(jsonb_build_object('document_type', doc.type, 'reason', p_reason,
      'signature', p_signature, 'page_count', p_page_count, 'width', p_width, 'height', p_height)));
  IF duplicate IS NOT NULL THEN
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (NULL, 'document.scan.duplicate', 'document', doc.id,
      'Empreinte identique à un document d''un autre sujet', jsonb_build_object('duplicate_of_id', duplicate));
  END IF;
  RETURN 'done';
END $$;

-- ---------------------------------------------------------------------------------------------
-- Droits d'exécution (convention D-066) : réservés au rôle du worker, `oz_worker`, créé par Terraform
-- avant ce déploiement. L'API (`oz_app`) ne peut ni réclamer ni juger un document.
-- ---------------------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION oz_document_scan_claim(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_document_scan_finish(uuid, text, text, bigint, integer, integer, integer, bigint, text) FROM PUBLIC;

DO $$ BEGIN
  -- Environnement géré par Terraform (`oz_app` présent) sans `oz_worker` : le worker ne pourrait
  -- jamais juger un document. Appliquer Terraform d'abord (DEBT D-097).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    RAISE EXCEPTION 'rôle oz_worker absent : appliquer Terraform avant cette migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    GRANT EXECUTE ON FUNCTION oz_document_scan_claim(uuid) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_document_scan_finish(uuid, text, text, bigint, integer, integer, integer, bigint, text) TO oz_worker;
  END IF;
END $$;
