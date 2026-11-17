-- Lot 1.7bb (EX-108 n° 2, 3, 4, 5 ; CP-13) : justificatif du lien entre le tuteur et l'enfant, revue
-- humaine, puis consentement versionné et révocable. Décisions R1 à R6 du 2026-11-17.
--
-- 1. Le compte qui a accepté l'invitation (rattachement en attente, lot 1.7ba) dépose 1 à 3 pièces
--    (acte de naissance ou livret de famille ; jugement de tutelle si le lien déclaré n'est ni la
--    mère ni le père) et soumet le lien à revue.
-- 2. Un administrateur vérifié décide. Approuver pose le compte sur la fiche tuteur
--    (`guardians.user_id`), accorde le rôle `guardian` et passe la fiche en `in_review` : jamais
--    `verified`, réservé au KYC 2 (lot 1.10). Les droits de la matrice sur l'enfant restent fermés :
--    ils suivent le tuteur **vérifié** (`guardianUserId`, lots 1.4 et 1.16).
-- 3. Le tuteur au lien approuvé consent (texte versionné, empreinte comparée, heure de la base) ;
--    le profil reste non publié tant que la fiche n'est pas `verified` (`oz_player_published`).
-- 4. Révoquer un consentement dépublie dans la même transaction : la règle de lecture le relit.

ALTER TYPE "document_type" ADD VALUE 'guardianship_order';

CREATE TYPE "guardian_link_review_status" AS ENUM ('submitted', 'approved', 'rejected', 'withdrawn');
CREATE TYPE "guardian_link_rejection_reason" AS ENUM (
  'illegible', 'name_mismatch', 'child_mismatch', 'wrong_document', 'suspected_forgery');

-- ---------------------------------------------------------------------------------------------
-- Dépôts du justificatif : un dépôt `submitted` au plus par fiche tuteur ; une pièce ne sert qu'à un
-- dépôt. Aucune donnée de personne ici : identifiants, statut, motif et dates.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "guardian_link_reviews" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "invitation_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "submitted_by" UUID NOT NULL,
    "status" "guardian_link_review_status" NOT NULL DEFAULT 'submitted',
    "rejection_reason" "guardian_link_rejection_reason",
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "guardian_link_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardian_link_reviews_decision_check"
      CHECK (("status" IN ('approved', 'rejected')) = ("decided_at" IS NOT NULL)),
    CONSTRAINT "guardian_link_reviews_reason_check"
      CHECK (("status" = 'rejected') = ("rejection_reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "guardian_link_reviews_one_submitted_key" ON "guardian_link_reviews"("guardian_id")
  WHERE "status" = 'submitted';
CREATE INDEX "guardian_link_reviews_invitation_id_idx" ON "guardian_link_reviews"("invitation_id");
CREATE INDEX "guardian_link_reviews_player_id_idx" ON "guardian_link_reviews"("player_id");
CREATE INDEX "guardian_link_reviews_submitted_by_idx" ON "guardian_link_reviews"("submitted_by");
CREATE INDEX "guardian_link_reviews_status_created_at_idx" ON "guardian_link_reviews"("status", "created_at");
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_invitation_id_fkey" FOREIGN KEY ("invitation_id") REFERENCES "guardian_invitations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "guardian_link_review_documents" (
    "review_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,

    CONSTRAINT "guardian_link_review_documents_pkey" PRIMARY KEY ("review_id", "document_id")
);
CREATE UNIQUE INDEX "guardian_link_review_documents_document_id_key" ON "guardian_link_review_documents"("document_id");
ALTER TABLE "guardian_link_review_documents" ADD CONSTRAINT "guardian_link_review_documents_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "guardian_link_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "guardian_link_review_documents" ADD CONSTRAINT "guardian_link_review_documents_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guardian_link_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_link_reviews" FORCE ROW LEVEL SECURITY;
ALTER TABLE "guardian_link_review_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_link_review_documents" FORCE ROW LEVEL SECURITY;
-- Aucune lecture ni écriture directe : les fonctions ci-dessous seulement.
CREATE POLICY "guardian_link_reviews_privileged" ON "guardian_link_reviews" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());
CREATE POLICY "guardian_link_review_documents_privileged" ON "guardian_link_review_documents" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- ---------------------------------------------------------------------------------------------
-- Textes de consentement (EX-108 n° 4) : le texte consenti est conservé, immuable, avec son
-- empreinte calculée par la base. La version en vigueur d'un type est la plus récente publiée.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "consent_texts" (
    "type" "consent_type" NOT NULL,
    "version" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    -- Toujours recalculée par la base (déclencheur) : toute valeur fournie est remplacée.
    "sha256" TEXT NOT NULL DEFAULT '',
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "consent_texts_pkey" PRIMARY KEY ("type", "version"),
    CONSTRAINT "consent_texts_version_check" CHECK ("version" ~ '^v[0-9]+(-[a-z]+)?$' AND length("version") <= 50),
    CONSTRAINT "consent_texts_body_check" CHECK (length(btrim("body")) BETWEEN 1 AND 20000)
);

CREATE FUNCTION oz_consent_texts_digest() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.sha256 := encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex');
  RETURN NEW;
END $$;
CREATE TRIGGER "consent_texts_digest" BEFORE INSERT ON "consent_texts"
  FOR EACH ROW EXECUTE FUNCTION oz_consent_texts_digest();

CREATE FUNCTION oz_consent_texts_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'texte de consentement figé : publier une nouvelle version' USING ERRCODE = 'check_violation';
END $$;
CREATE TRIGGER "consent_texts_immutable" BEFORE UPDATE OR DELETE ON "consent_texts"
  FOR EACH ROW EXECUTE FUNCTION oz_consent_texts_immutable();

-- Version 1, PROVISOIRE (R6) : à faire relire par le porteur du projet, puis par un juriste (Q7).
INSERT INTO "consent_texts" ("type", "version", "body") VALUES
('guardian_data_processing', 'v1-provisoire',
$txt$Consentement au traitement des données de mon enfant (version 1, provisoire)

Je déclare être le parent ou le tuteur légal de l'enfant mineur désigné, et j'autorise OZ à traiter ses données personnelles (identité, données sportives, photos et pièces justificatives) pour créer et tenir sa fiche de joueur.

Ces données sont hébergées dans l'Union européenne, ne sont jamais vendues, et ne sont lues que par les personnes et organisations autorisées par les règles d'OZ. Les données de l'enfant ne sont visibles d'aucun tiers tant que je n'ai pas aussi autorisé la publication de sa fiche.

Je peux retirer ce consentement à tout moment depuis mon espace tuteur. Le retrait met fin à la publication de la fiche, immédiatement. Je peux aussi demander l'accès à ces données, leur export ou leur suppression, comme le prévoit la politique de confidentialité d'OZ.$txt$),
('guardian_profile_publication', 'v1-provisoire',
$txt$Autorisation de publication de la fiche de mon enfant (version 1, provisoire)

J'autorise OZ à rendre la fiche de joueur de mon enfant mineur visible des académies, clubs et fédérations vérifiés par OZ, dans les limites prévues par les règles d'OZ : jamais ses coordonnées, jamais aux recruteurs ou agences non vérifiés, et jamais au public sans compte.

La publication n'a lieu qu'une fois mon identité vérifiée par OZ. Chaque consultation de la fiche par une organisation est enregistrée et je peux en demander la liste.

Je peux retirer cette autorisation à tout moment depuis mon espace tuteur : la fiche cesse aussitôt d'être visible de toute organisation.$txt$);

-- RLS posée après l'insertion des textes : la migration n'est pas un chemin privilégié.
ALTER TABLE "consent_texts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "consent_texts" FORCE ROW LEVEL SECURITY;
-- Lus par `oz_guardian_consent_current` seulement (refus par défaut sans contexte, comme toute
-- table) ; écrits par migration.
CREATE POLICY "consent_texts_privileged" ON "consent_texts" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- ---------------------------------------------------------------------------------------------
-- Rattachement en attente du compte du contexte sur cette fiche tuteur : invitation acceptée par
-- lui, non annulée ; fiche sans compte ; enfant encore mineur et toujours rattaché à cette fiche.
-- Sert aux dépôts de pièces (RLS de `document_uploads`) et au dépôt du justificatif.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_link_pending(p_guardian uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_guardian IS NOT NULL AND oz_current_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM guardian_invitations i
    JOIN guardians g ON g.id = i.guardian_id AND g.deleted_at IS NULL AND g.user_id IS NULL
    JOIN players p ON p.id = i.player_id AND p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
      AND p.guardian_id = i.guardian_id
    WHERE i.guardian_id = p_guardian AND i.accepted_by = oz_current_user_id()
      AND i.cancelled_at IS NULL)
$$;

-- Intention de dépôt : en plus des cibles visibles, la fiche tuteur d'un rattachement en attente du
-- demandeur, pour les pièces du lien seulement (jamais une pièce d'identité avant le KYC).
DROP POLICY "document_uploads_owner_insert" ON "document_uploads";
CREATE POLICY "document_uploads_owner_insert" ON "document_uploads" FOR INSERT
  WITH CHECK ("requested_by" = (SELECT oz_current_user_id())
    AND "status" = 'issued' AND "completed_at" IS NULL AND "document_id" IS NULL AND "reject_reason" IS NULL
    AND "expires_at" <= now() + interval '5 minutes'
    AND ("player_id" IN (SELECT "id" FROM "players")
      OR "guardian_id" IN (SELECT "id" FROM "guardians")
      OR ("document_type"::text IN ('birth_certificate', 'guardianship_order')
        AND oz_guardian_link_pending("guardian_id"))
      OR "organization_id" IN (SELECT "id" FROM "organizations")));

-- ---------------------------------------------------------------------------------------------
-- Dépôt du justificatif par le compte en attente. Pièces : les siennes, saines, sur cette fiche,
-- du bon type, jamais déjà utilisées ; jugement de tutelle exigé si le lien n'est ni mère ni père.
-- Rend {outcome: submitted, reviewId}, ou refused, not_found, already_submitted, invalid_documents,
-- order_required. Verrous : joueur, fiche tuteur, invitation (même ordre que le lot 1.7ba).
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_link_submit(p_guardian uuid, p_documents uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  invitation guardian_invitations;
  tutor guardians;
  created uuid;
  wanted int;
  usable int;
BEGIN
  IF me IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  SELECT i.* INTO invitation FROM guardian_invitations i
    WHERE i.guardian_id = p_guardian AND i.accepted_by = me AND i.cancelled_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  PERFORM 1 FROM players p WHERE p.id = invitation.player_id FOR UPDATE;
  SELECT * INTO tutor FROM guardians g WHERE g.id = p_guardian FOR UPDATE;
  PERFORM 1 FROM guardian_invitations i WHERE i.id = invitation.id FOR UPDATE;
  IF NOT oz_guardian_link_pending(p_guardian) THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM guardian_link_reviews r
             WHERE r.guardian_id = p_guardian AND r.status = 'submitted') THEN
    RETURN jsonb_build_object('outcome', 'already_submitted');
  END IF;

  wanted := cardinality(p_documents);
  IF wanted IS NULL OR wanted NOT BETWEEN 1 AND 3
     OR wanted <> (SELECT count(DISTINCT d) FROM unnest(p_documents) d) THEN
    RETURN jsonb_build_object('outcome', 'invalid_documents');
  END IF;
  SELECT count(*) INTO usable FROM documents d
    WHERE d.id = ANY (p_documents) AND d.guardian_id = p_guardian AND d.uploaded_by = me
      AND d.type::text IN ('birth_certificate', 'guardianship_order') AND d.av_status = 'clean'
      AND d.deleted_at IS NULL AND d.purged_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM guardian_link_review_documents l WHERE l.document_id = d.id);
  IF usable <> wanted THEN RETURN jsonb_build_object('outcome', 'invalid_documents'); END IF;
  IF tutor.relationship IN ('legal_guardian', 'other') AND NOT EXISTS (
       SELECT 1 FROM documents d WHERE d.id = ANY (p_documents) AND d.type::text = 'guardianship_order') THEN
    RETURN jsonb_build_object('outcome', 'order_required');
  END IF;

  INSERT INTO guardian_link_reviews (invitation_id, guardian_id, player_id, submitted_by)
  VALUES (invitation.id, p_guardian, invitation.player_id, me)
  RETURNING id INTO created;
  INSERT INTO guardian_link_review_documents (review_id, document_id)
  SELECT created, d FROM unnest(p_documents) d;
  UPDATE guardians SET verification_status = 'pending', updated_at = now(), updated_by = me
  WHERE id = p_guardian;

  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'guardian.link.submitted', 'guardian', p_guardian, 'Justificatif de lien déposé',
    jsonb_build_object('review_id', created, 'documents', wanted));
  RETURN jsonb_build_object('outcome', 'submitted', 'reviewId', created);
END $$;

-- ---------------------------------------------------------------------------------------------
-- File de revue (administrateur vérifié) : dépôts `submitted`, du plus ancien au plus récent, avec
-- ce qu'il faut comparer aux pièces (noms déclarés, lien, date de naissance de l'enfant). Les pièces
-- se lisent par `GET /documents/:id/url` (URL signée de 5 minutes, auditée).
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_link_queue(p_limit integer)
RETURNS TABLE (review_id uuid, submitted_at timestamptz, relationship text,
  guardian_first_name text, guardian_last_name text, child_first_name text, child_last_name text,
  child_birth_date date, rejections integer, document_ids uuid[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.created_at, g.relationship::text, g.first_name, g.last_name, p.first_name,
    p.last_name, p.birth_date,
    (SELECT count(*)::int FROM guardian_link_reviews x
      WHERE x.invitation_id = r.invitation_id AND x.status = 'rejected'),
    ARRAY(SELECT l.document_id FROM guardian_link_review_documents l WHERE l.review_id = r.id
      ORDER BY l.document_id)
  FROM guardian_link_reviews r
  JOIN guardians g ON g.id = r.guardian_id
  JOIN players p ON p.id = r.player_id
  WHERE r.status = 'submitted' AND oz_has_verified_role(ARRAY['admin']::role_kind[])
  ORDER BY r.created_at, r.id
  LIMIT least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

-- ---------------------------------------------------------------------------------------------
-- Décision (administrateur vérifié, jamais le déposant ni l'enfant). Approuver : compte posé sur la
-- fiche, rôle `guardian`, fiche `in_review`. Refuser : motif de la liste fermée, fiche `rejected` ;
-- au 3e refus de la même invitation, ou sur faux suspecté, le rattachement est clos (invitation
-- annulée : l'enfant devra réinviter). Les pièces sont gardées `p_retention` après la décision.
-- Rend {outcome: approved | rejected, closed, email, childFirstName}, ou refused, not_found,
-- conflict (décideur concerné), stale (rattachement tombé entre-temps : dépôt retiré).
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_link_decide(p_review uuid, p_approve boolean, p_reason text,
  p_retention interval) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  review guardian_link_reviews;
  child players;
  tutor guardians;
  invitation guardian_invitations;
  reason guardian_link_rejection_reason;
  refusals int;
  closed boolean := false;
  address text;
BEGIN
  IF p_retention IS NULL OR p_retention < interval '1 day' OR p_retention > interval '3650 days' THEN
    RAISE EXCEPTION 'durée de conservation invalide' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_approve IS NULL OR (p_approve AND p_reason IS NOT NULL) THEN
    RAISE EXCEPTION 'décision invalide' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF NOT p_approve THEN
    IF p_reason IS NULL OR p_reason NOT IN (SELECT unnest(enum_range(NULL::guardian_link_rejection_reason))::text) THEN
      RAISE EXCEPTION 'motif de refus invalide' USING ERRCODE = 'invalid_parameter_value';
    END IF;
    reason := p_reason::guardian_link_rejection_reason;
  END IF;
  IF me IS NULL OR NOT oz_has_verified_role(ARRAY['admin']::role_kind[]) THEN
    RETURN jsonb_build_object('outcome', 'refused');
  END IF;

  SELECT * INTO review FROM guardian_link_reviews r WHERE r.id = p_review;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  -- Verrous dans l'ordre du lot 1.7ba (joueur, fiche, invitation), puis le dépôt, relu ensuite.
  SELECT * INTO child FROM players p WHERE p.id = review.player_id FOR UPDATE;
  SELECT * INTO tutor FROM guardians g WHERE g.id = review.guardian_id FOR UPDATE;
  SELECT * INTO invitation FROM guardian_invitations i WHERE i.id = review.invitation_id FOR UPDATE;
  SELECT * INTO review FROM guardian_link_reviews r WHERE r.id = p_review FOR UPDATE;
  IF review.status <> 'submitted' THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF me = review.submitted_by OR me = child.user_id THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;
  -- Rattachement tombé (nouvelle invitation, compte clos, enfant majeur ou détaché) : dépôt retiré.
  IF invitation.cancelled_at IS NOT NULL OR invitation.accepted_by IS DISTINCT FROM review.submitted_by
     OR tutor.deleted_at IS NOT NULL OR tutor.user_id IS NOT NULL
     OR child.deleted_at IS NOT NULL OR NOT oz_is_minor(child.birth_date)
     OR child.guardian_id IS DISTINCT FROM tutor.id
     OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = review.submitted_by AND u.deleted_at IS NULL
                      AND u.status IN ('pending_verification', 'active')) THEN
    UPDATE guardian_link_reviews SET status = 'withdrawn' WHERE id = review.id;
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;

  SELECT u.email INTO address FROM users u WHERE u.id = review.submitted_by;
  UPDATE documents SET retention_until = now() + p_retention
  WHERE id IN (SELECT l.document_id FROM guardian_link_review_documents l WHERE l.review_id = review.id);

  IF p_approve THEN
    UPDATE guardian_link_reviews SET status = 'approved', decided_by = me, decided_at = now()
    WHERE id = review.id;
    UPDATE guardians SET user_id = review.submitted_by, verification_status = 'in_review',
      updated_at = now(), updated_by = me
    WHERE id = tutor.id;
    INSERT INTO user_roles (user_id, role, created_by)
    SELECT review.submitted_by, 'guardian', me
    WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = review.submitted_by
                        AND r.role = 'guardian' AND r.organization_id IS NULL AND r.deleted_at IS NULL);
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (me, 'guardian.link.approved', 'guardian', tutor.id, 'Lien du tuteur légal validé',
      jsonb_build_object('review_id', review.id));
    RETURN jsonb_build_object('outcome', 'approved', 'closed', false, 'email', address,
      'childFirstName', child.first_name);
  END IF;

  UPDATE guardian_link_reviews SET status = 'rejected', rejection_reason = reason, decided_by = me,
    decided_at = now()
  WHERE id = review.id;
  UPDATE guardians SET verification_status = 'rejected', updated_at = now(), updated_by = me
  WHERE id = tutor.id;
  SELECT count(*) INTO refusals FROM guardian_link_reviews r
    WHERE r.invitation_id = invitation.id AND r.status = 'rejected';
  IF refusals >= 3 OR reason = 'suspected_forgery' THEN
    closed := true;
    UPDATE guardian_invitations SET cancelled_at = now() WHERE id = invitation.id;
  END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'guardian.link.rejected', 'guardian', tutor.id, 'Lien du tuteur légal refusé',
    jsonb_build_object('review_id', review.id, 'reason', reason, 'closed', closed));
  RETURN jsonb_build_object('outcome', 'rejected', 'closed', closed, 'email', address,
    'childFirstName', child.first_name);
END $$;

-- ---------------------------------------------------------------------------------------------
-- Consentement du tuteur au lien approuvé (fiche `in_review` ou `verified`), pour un enfant mineur
-- dont il tient la fiche tuteur. Version et empreinte : celles du texte en vigueur, sinon `stale`.
-- La publication exige un consentement au traitement actif. Heure : celle de la base.
-- Rend {outcome: granted | already, grantedAt, textVersion}, ou not_found, stale,
-- requires_data_processing.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_consent_current(p_type consent_type)
RETURNS TABLE (version text, body text, sha256 text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.version, t.body, t.sha256, t.published_at FROM consent_texts t
  WHERE t.type = p_type AND p_type::text LIKE 'guardian\_%'
  ORDER BY t.published_at DESC, t.version DESC LIMIT 1
$$;

-- Fiche de l'enfant et fiche tuteur du compte du contexte (lien approuvé), verrouillées. Interne.
CREATE FUNCTION oz_guardian_linked_child(p_oz_id text, me uuid, OUT child players, OUT tutor guardians)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  SELECT p.* INTO child FROM players p JOIN guardians g ON g.id = p.guardian_id
    WHERE p.oz_id = p_oz_id AND p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
      AND g.user_id = me AND g.deleted_at IS NULL
    FOR UPDATE OF p;
  IF child.id IS NULL THEN RETURN; END IF;
  SELECT g.* INTO tutor FROM guardians g WHERE g.id = child.guardian_id FOR UPDATE;
END $$;

CREATE FUNCTION oz_guardian_consent_grant(p_oz_id text, p_type consent_type, p_version text,
  p_sha256 text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  found record;
  current_text record;
  existing consents;
BEGIN
  IF me IS NULL OR p_type::text NOT LIKE 'guardian\_%' THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  SELECT * INTO found FROM oz_guardian_linked_child(p_oz_id, me);
  IF (found.child).id IS NULL OR (found.tutor).verification_status NOT IN ('in_review', 'verified') THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  SELECT * INTO current_text FROM oz_guardian_consent_current(p_type);
  IF current_text.version IS NULL OR current_text.version <> p_version
     OR current_text.sha256 <> p_sha256 THEN
    RETURN jsonb_build_object('outcome', 'stale');
  END IF;
  SELECT c.* INTO existing FROM consents c
    WHERE c.player_id = (found.child).id AND c.type = p_type
      AND c.granted_by_guardian_id = (found.tutor).id AND c.revoked_at IS NULL AND c.deleted_at IS NULL
    ORDER BY c.granted_at DESC LIMIT 1;
  IF existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('outcome', 'already', 'grantedAt', existing.granted_at,
      'textVersion', existing.text_version);
  END IF;
  IF p_type = 'guardian_profile_publication' AND NOT EXISTS (
       SELECT 1 FROM consents c WHERE c.player_id = (found.child).id
         AND c.type = 'guardian_data_processing' AND c.granted_by_guardian_id = (found.tutor).id
         AND c.revoked_at IS NULL AND c.deleted_at IS NULL) THEN
    RETURN jsonb_build_object('outcome', 'requires_data_processing');
  END IF;

  INSERT INTO consents (type, text_version, player_id, granted_by_user_id, granted_by_guardian_id,
    created_by, updated_by)
  VALUES (p_type, p_version, (found.child).id, me, (found.tutor).id, me, me)
  RETURNING * INTO existing;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'guardian.consent.granted', 'player', (found.child).id, 'Consentement du tuteur légal',
    jsonb_build_object('consent_id', existing.id, 'type', p_type, 'text_version', p_version));
  RETURN jsonb_build_object('outcome', 'granted', 'grantedAt', existing.granted_at,
    'textVersion', existing.text_version);
END $$;

-- Révocation (EX-108 n° 5) : `revoked_at` à l'heure de la base ; retirer le traitement retire aussi
-- la publication. Dépublication immédiate : `oz_player_published` relit les consentements actifs.
-- Rend {outcome: revoked, revoked: n} (0 : rien d'actif, sans erreur), ou not_found.
CREATE FUNCTION oz_guardian_consent_revoke(p_oz_id text, p_type consent_type) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_player_signup_account();
  found record;
  revoked int;
BEGIN
  IF me IS NULL OR p_type::text NOT LIKE 'guardian\_%' THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  SELECT * INTO found FROM oz_guardian_linked_child(p_oz_id, me);
  IF (found.child).id IS NULL THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  UPDATE consents SET revoked_at = now(), updated_at = now(), updated_by = me
  WHERE player_id = (found.child).id AND granted_by_guardian_id = (found.tutor).id
    AND revoked_at IS NULL AND deleted_at IS NULL
    AND (type = p_type OR (p_type = 'guardian_data_processing' AND type = 'guardian_profile_publication'));
  GET DIAGNOSTICS revoked = ROW_COUNT;
  IF revoked > 0 THEN
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (me, 'guardian.consent.revoked', 'player', (found.child).id,
      'Consentement du tuteur légal retiré', jsonb_build_object('type', p_type, 'revoked', revoked));
  END IF;
  RETURN jsonb_build_object('outcome', 'revoked', 'revoked', revoked);
END $$;

-- ---------------------------------------------------------------------------------------------
-- Enfants du compte (lot 1.7ba), enrichis : identifiant de la fiche tuteur (cible des dépôts),
-- état du lien, consentements actifs. Nom et OZ ID dès le lien approuvé (le tuteur consent par OZ
-- ID) ; `guardian_verified` reste la vérification complète (KYC 2).
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION oz_guardian_children();
CREATE FUNCTION oz_guardian_children()
RETURNS TABLE (guardian_id uuid, guardian_verified boolean, link_status text, oz_id text,
  first_name text, last_name text, verification_status text, published boolean,
  consents text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH ctx AS (SELECT oz_player_signup_account() AS me)
  SELECT g.id,
    v.verified,
    CASE
      WHEN g.user_id = ctx.me THEN 'approved'
      WHEN EXISTS (SELECT 1 FROM guardian_link_reviews r WHERE r.guardian_id = g.id
                     AND r.submitted_by = ctx.me AND r.status = 'submitted') THEN 'submitted'
      WHEN (SELECT r.status FROM guardian_link_reviews r WHERE r.guardian_id = g.id
              AND r.submitted_by = ctx.me ORDER BY r.created_at DESC, r.id DESC LIMIT 1) = 'rejected'
        THEN 'rejected'
      ELSE 'awaiting_documents'
    END,
    CASE WHEN v.linked THEN p.oz_id END,
    p.first_name,
    CASE WHEN v.linked THEN p.last_name END,
    p.verification_status::text,
    oz_player_published(p.id, p.guardian_id, p.verification_status),
    CASE WHEN v.linked THEN ARRAY(
      SELECT DISTINCT c.type::text FROM consents c
      WHERE c.player_id = p.id AND c.granted_by_guardian_id = g.id
        AND c.revoked_at IS NULL AND c.deleted_at IS NULL ORDER BY 1)
    ELSE ARRAY[]::text[] END
  FROM ctx
  JOIN players p ON p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
  JOIN guardians g ON g.id = p.guardian_id AND g.deleted_at IS NULL
  CROSS JOIN LATERAL (
    SELECT coalesce(g.user_id = ctx.me, false) AS linked,
      coalesce(g.user_id = ctx.me AND g.verification_status = 'verified', false) AS verified) v
  WHERE ctx.me IS NOT NULL
    AND (g.user_id = ctx.me
      OR (g.user_id IS NULL AND EXISTS (
            SELECT 1 FROM guardian_invitations i
            WHERE i.player_id = p.id AND i.guardian_id = g.id AND i.accepted_by = ctx.me
              AND i.cancelled_at IS NULL)))
  ORDER BY p.created_at, p.id
$$;

-- ---------------------------------------------------------------------------------------------
-- Effets de bord. Invitation annulée (l'enfant réinvite, ou refus définitif) : le dépôt en cours est
-- retiré et une fiche sans compte revient à `declared` (sauf refus, gardé pour mémoire).
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_link_reviews_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE guardian_link_reviews SET status = 'withdrawn'
  WHERE invitation_id = NEW.id AND status = 'submitted';
  UPDATE guardians SET verification_status = 'declared', updated_at = now()
  WHERE id = NEW.guardian_id AND user_id IS NULL AND verification_status = 'pending';
  RETURN NULL;
END $$;
CREATE TRIGGER "guardian_invitations_release_reviews" AFTER UPDATE OF "cancelled_at" ON "guardian_invitations"
  FOR EACH ROW WHEN (OLD."cancelled_at" IS NULL AND NEW."cancelled_at" IS NOT NULL)
  EXECUTE FUNCTION oz_guardian_link_reviews_release();

-- Compte clos : ses consentements de tuteur sont retirés (dépublication immédiate) et ses dépôts en
-- cours retirés. Ses rattachements en attente tombent déjà (lot 1.7ba).
CREATE FUNCTION oz_guardian_account_closed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE consents SET revoked_at = now(), updated_at = now()
  WHERE granted_by_user_id = NEW.id AND type::text LIKE 'guardian\_%' AND revoked_at IS NULL;
  UPDATE guardian_link_reviews SET status = 'withdrawn'
  WHERE submitted_by = NEW.id AND status = 'submitted';
  RETURN NULL;
END $$;
CREATE TRIGGER "users_guardian_account_closed" AFTER UPDATE OF "deleted_at" ON "users"
  FOR EACH ROW WHEN (OLD."deleted_at" IS NULL AND NEW."deleted_at" IS NOT NULL)
  EXECUTE FUNCTION oz_guardian_account_closed();

REVOKE EXECUTE ON FUNCTION oz_consent_texts_digest() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_consent_texts_immutable() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_link_pending(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_link_submit(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_link_queue(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_link_decide(uuid, boolean, text, interval) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_consent_current(consent_type) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_linked_child(text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_consent_grant(text, consent_type, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_consent_revoke(text, consent_type) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_children() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_link_reviews_release() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_guardian_account_closed() FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_guardian_link_pending(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_link_submit(uuid, uuid[]) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_link_queue(integer) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_link_decide(uuid, boolean, text, interval) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_consent_current(consent_type) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_consent_grant(text, consent_type, text, text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_consent_revoke(text, consent_type) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_guardian_children() TO oz_app;
  END IF;
END $$;
