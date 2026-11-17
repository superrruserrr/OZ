-- Lot 1.7bc, décision C6 (2026-11-17) : un administrateur vérifié retire un lien de tuteur approuvé
-- par erreur. Motif d'une liste fermée, ré-authentification (API) et journal. Effets, dans une
-- transaction : compte retiré de la fiche tuteur (`declared`), consentements de cette fiche révoqués
-- (dépublication immédiate), invitation annulée (l'enfant peut réinviter), rôle `guardian` retiré
-- s'il ne sert plus à aucune autre fiche. Les pièces restent 6 mois après le retrait (R3).

ALTER TYPE "guardian_link_review_status" ADD VALUE 'revoked';
CREATE TYPE "guardian_link_revocation_reason" AS ENUM (
  'approved_in_error', 'suspected_fraud', 'child_request', 'other');

ALTER TABLE "guardian_link_reviews"
  ADD COLUMN "revocation_reason" "guardian_link_revocation_reason",
  ADD COLUMN "revoked_by" UUID,
  ADD COLUMN "revoked_at" TIMESTAMPTZ(6);
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_revoked_by_fkey"
  FOREIGN KEY ("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Comparaisons en texte : la nouvelle valeur d'énumération n'est pas utilisable dans la transaction
-- qui l'ajoute.
ALTER TABLE "guardian_link_reviews" DROP CONSTRAINT "guardian_link_reviews_decision_check";
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_decision_check"
  CHECK (("status"::text IN ('approved', 'rejected', 'revoked')) = ("decided_at" IS NOT NULL));
ALTER TABLE "guardian_link_reviews" ADD CONSTRAINT "guardian_link_reviews_revocation_check"
  CHECK (("status"::text = 'revoked') = ("revoked_at" IS NOT NULL)
    AND ("revoked_at" IS NULL) = ("revocation_reason" IS NULL));

-- ---------------------------------------------------------------------------------------------
-- Retrait d'un lien approuvé. Rend {outcome: revoked, email, childFirstName}, ou refused (pas
-- administrateur vérifié), not_found, conflict (dépôt non approuvé ou déjà retiré, lien déjà tombé),
-- concerned (le décideur est le tuteur ou l'enfant). Verrous : joueur, fiche, invitation, dépôt.
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION oz_guardian_link_revoke(p_review uuid, p_reason text, p_retention interval)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  review guardian_link_reviews;
  child players;
  tutor guardians;
  reason guardian_link_revocation_reason;
  revoked int;
  address text;
BEGIN
  IF p_retention IS NULL OR p_retention < interval '1 day' OR p_retention > interval '3650 days' THEN
    RAISE EXCEPTION 'durée de conservation invalide' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN (SELECT unnest(enum_range(NULL::guardian_link_revocation_reason))::text) THEN
    RAISE EXCEPTION 'motif de retrait invalide' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  reason := p_reason::guardian_link_revocation_reason;
  IF me IS NULL OR NOT oz_has_verified_role(ARRAY['admin']::role_kind[]) THEN
    RETURN jsonb_build_object('outcome', 'refused');
  END IF;

  SELECT * INTO review FROM guardian_link_reviews r WHERE r.id = p_review;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  SELECT * INTO child FROM players p WHERE p.id = review.player_id FOR UPDATE;
  SELECT * INTO tutor FROM guardians g WHERE g.id = review.guardian_id FOR UPDATE;
  PERFORM 1 FROM guardian_invitations i WHERE i.id = review.invitation_id FOR UPDATE;
  SELECT * INTO review FROM guardian_link_reviews r WHERE r.id = p_review FOR UPDATE;
  IF me = review.submitted_by OR me = child.user_id THEN
    RETURN jsonb_build_object('outcome', 'concerned');
  END IF;
  -- Seul le lien en vigueur se retire : dépôt approuvé dont le déposant tient encore la fiche.
  IF review.status::text <> 'approved' OR tutor.user_id IS DISTINCT FROM review.submitted_by THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;

  UPDATE guardian_link_reviews SET status = 'revoked', revocation_reason = reason, revoked_by = me,
    revoked_at = now()
  WHERE id = review.id;
  UPDATE documents SET retention_until = now() + p_retention
  WHERE id IN (SELECT l.document_id FROM guardian_link_review_documents l WHERE l.review_id = review.id);
  UPDATE consents SET revoked_at = now(), updated_at = now(), updated_by = me
  WHERE granted_by_guardian_id = tutor.id AND type::text LIKE 'guardian\_%'
    AND revoked_at IS NULL AND deleted_at IS NULL;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  UPDATE guardians SET user_id = NULL, verification_status = 'declared', updated_at = now(),
    updated_by = me
  WHERE id = tutor.id;
  UPDATE guardian_invitations SET cancelled_at = now()
  WHERE guardian_id = tutor.id AND cancelled_at IS NULL;
  -- Rôle retiré seulement s'il ne sert plus à aucune autre fiche tuteur de ce compte.
  IF NOT EXISTS (SELECT 1 FROM guardians g WHERE g.user_id = review.submitted_by
                   AND g.deleted_at IS NULL) THEN
    UPDATE user_roles SET deleted_at = now()
    WHERE user_id = review.submitted_by AND role = 'guardian' AND organization_id IS NULL
      AND deleted_at IS NULL;
  END IF;

  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'guardian.link.revoked', 'guardian', tutor.id, 'Lien du tuteur légal retiré',
    jsonb_build_object('review_id', review.id, 'reason', reason, 'consents_revoked', revoked));
  SELECT u.email INTO address FROM users u WHERE u.id = review.submitted_by AND u.deleted_at IS NULL;
  RETURN jsonb_build_object('outcome', 'revoked', 'email', address,
    'childFirstName', child.first_name);
END $$;

REVOKE EXECUTE ON FUNCTION oz_guardian_link_revoke(uuid, text, interval) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_guardian_link_revoke(uuid, text, interval) TO oz_app;
  END IF;
END $$;
