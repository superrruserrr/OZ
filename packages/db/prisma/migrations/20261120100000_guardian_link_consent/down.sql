-- Retour arrière du lot 1.7bb : dépôts du justificatif, revue, textes et fonctions de consentement
-- retirés ; politique de dépôt et liste des enfants rendues à leur état du lot 1.7ba. Les comptes
-- posés sur les fiches tuteur, les rôles accordés et les consentements enregistrés restent : ce
-- sont des faits datés, pas du schéma. La valeur `guardianship_order` de `document_type` reste
-- (PostgreSQL ne retire pas une valeur d'énumération) ; plus rien ne permet d'en déposer.
DROP TRIGGER "users_guardian_account_closed" ON "users";
DROP FUNCTION oz_guardian_account_closed();
DROP TRIGGER "guardian_invitations_release_reviews" ON "guardian_invitations";
DROP FUNCTION oz_guardian_link_reviews_release();

DROP FUNCTION oz_guardian_children();
CREATE FUNCTION oz_guardian_children()
RETURNS TABLE (guardian_verified boolean, oz_id text, first_name text, last_name text,
  verification_status text, published boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH ctx AS (SELECT oz_player_signup_account() AS me)
  SELECT v.verified,
    CASE WHEN v.verified THEN p.oz_id END,
    p.first_name,
    CASE WHEN v.verified THEN p.last_name END,
    p.verification_status::text,
    oz_player_published(p.id, p.guardian_id, p.verification_status)
  FROM ctx
  JOIN players p ON p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
  JOIN guardians g ON g.id = p.guardian_id AND g.deleted_at IS NULL
  CROSS JOIN LATERAL (
    SELECT coalesce(g.user_id = ctx.me AND g.verification_status = 'verified', false) AS verified) v
  WHERE ctx.me IS NOT NULL
    AND (g.user_id = ctx.me
      OR (g.user_id IS NULL AND EXISTS (
            SELECT 1 FROM guardian_invitations i
            WHERE i.player_id = p.id AND i.guardian_id = g.id AND i.accepted_by = ctx.me
              AND i.cancelled_at IS NULL)))
  ORDER BY p.created_at, p.id
$$;
REVOKE EXECUTE ON FUNCTION oz_guardian_children() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_guardian_children() TO oz_app;
  END IF;
END $$;

DROP FUNCTION oz_guardian_consent_revoke(text, consent_type);
DROP FUNCTION oz_guardian_consent_grant(text, consent_type, text, text);
DROP FUNCTION oz_guardian_linked_child(text, uuid);
DROP FUNCTION oz_guardian_consent_current(consent_type);
DROP FUNCTION oz_guardian_link_decide(uuid, boolean, text, interval);
DROP FUNCTION oz_guardian_link_queue(integer);
DROP FUNCTION oz_guardian_link_submit(uuid, uuid[]);

DROP POLICY "document_uploads_owner_insert" ON "document_uploads";
CREATE POLICY "document_uploads_owner_insert" ON "document_uploads" FOR INSERT
  WITH CHECK ("requested_by" = (SELECT oz_current_user_id())
    AND "status" = 'issued' AND "completed_at" IS NULL AND "document_id" IS NULL AND "reject_reason" IS NULL
    AND "expires_at" <= now() + interval '5 minutes'
    AND ("player_id" IN (SELECT "id" FROM "players")
      OR "guardian_id" IN (SELECT "id" FROM "guardians")
      OR "organization_id" IN (SELECT "id" FROM "organizations")));
DROP FUNCTION oz_guardian_link_pending(uuid);

DROP TABLE "consent_texts";
DROP FUNCTION oz_consent_texts_immutable();
DROP FUNCTION oz_consent_texts_digest();
DROP TABLE "guardian_link_review_documents";
DROP TABLE "guardian_link_reviews";
DROP TYPE "guardian_link_rejection_reason";
DROP TYPE "guardian_link_review_status";
