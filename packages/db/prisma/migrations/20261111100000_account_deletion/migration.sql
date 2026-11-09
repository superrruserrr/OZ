-- Lot 1.16ca : suppression de compte (EX-118 n° 3, design.md §5.10). Demande ré-authentifiée par
-- l'API, rétractation de 30 jours (D1), puis anonymisation par le worker (lot 1.16cb) selon le
-- registre d'effacement `packages/db/src/erasure/registry.ts`. L'OZ ID reste réservé (CP-03), le
-- journal d'audit n'est jamais modifié (D4), pièces et archives sont rendues échues (D5).

CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_deletion_requests_status_check"
      CHECK ("status" IN ('pending', 'cancelled', 'done')),
    CONSTRAINT "account_deletion_requests_cancelled_check"
      CHECK (("status" = 'cancelled') = ("cancelled_at" IS NOT NULL)),
    CONSTRAINT "account_deletion_requests_done_check"
      CHECK (("status" = 'done') = ("completed_at" IS NOT NULL)),
    CONSTRAINT "account_deletion_requests_schedule_check" CHECK ("scheduled_for" > "requested_at")
);
CREATE UNIQUE INDEX "account_deletion_requests_one_pending_key" ON "account_deletion_requests"("user_id")
  WHERE "status" = 'pending';
CREATE INDEX "account_deletion_requests_due_idx" ON "account_deletion_requests"("scheduled_for")
  WHERE "status" = 'pending';
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "account_deletion_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "account_deletion_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY "account_deletion_requests_owner_read" ON "account_deletion_requests" FOR SELECT
  USING ("user_id" = (SELECT oz_current_user_id()));
CREATE POLICY "account_deletion_requests_privileged" ON "account_deletion_requests" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Révocation de toutes les sessions à la demande (D2).
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason_check";
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_reason_check" CHECK (
  "revoked_reason" IN ('rotated', 'logout', 'revoked_by_user', 'logout_all', 'reuse_detected',
    'password_reset', 'two_factor_changed', 'account_deleted')
);

-- Demande du titulaire (contexte utilisateur ; ré-authentification faite par l'API) : compte en
-- état, une demande en attente au plus, anonymisation programmée à +30 jours, sessions révoquées,
-- audit. Rend {outcome: accepted, id, requestedAt, scheduledFor}, {outcome: pending, scheduledFor} ou
-- {outcome: refused} ; sans contexte, lève.
-- Écritures du chemin privilégié de l'anonymisation : ces tables n'avaient qu'une lecture
-- privilégiée ; sous un propriétaire soumis à la RLS (recette, production), l'effacement y
-- toucherait 0 ligne sans erreur.
CREATE POLICY "user_roles_privileged_update" ON "user_roles" FOR UPDATE
  USING (oz_privileged()) WITH CHECK (oz_privileged());
CREATE POLICY "guardians_privileged_update" ON "guardians" FOR UPDATE
  USING (oz_privileged()) WITH CHECK (oz_privileged());
CREATE POLICY "kyc_cases_privileged_update" ON "kyc_cases" FOR UPDATE
  USING (oz_privileged()) WITH CHECK (oz_privileged());
CREATE POLICY "notifications_privileged_update" ON "notifications" FOR UPDATE
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Garde KYC (lot 1.0) : une décision reste figée, sauf l'effacement de ses textes libres.
CREATE OR REPLACE FUNCTION oz_kyc_cases_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  sensitive boolean;
  decider uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Sujet figé dès la création : pièces et approbation ne se transportent pas vers un autre sujet.
    IF (NEW.player_id, NEW.organization_id) IS DISTINCT FROM (OLD.player_id, OLD.organization_id) THEN
      RAISE EXCEPTION 'sujet du dossier KYC figé : ouvrir un nouveau dossier' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'draft' AND NEW.status = 'draft' THEN
      RAISE EXCEPTION 'un dossier KYC soumis ne revient jamais en brouillon' USING ERRCODE = 'check_violation';
    END IF;
    -- Effacement d'un compte (lot 1.16ca) : constats et motif libre effacés par le seul chemin
    -- privilégié de `oz_account_anonymize`, la décision (statut, décideurs, dates) restant figée.
    -- Le drapeau de transaction ne suffit pas : la fiche doit déjà être supprimée (posée juste avant).
    IF OLD.status IN ('approved', 'rejected', 'expired') AND oz_privileged()
       AND current_setting('oz.account_erasure', true) = 'on'
       AND EXISTS (SELECT 1 FROM players p WHERE p.id = NEW.player_id AND p.deleted_at IS NOT NULL)
       AND NEW.checks = '[]'::jsonb
       AND (NEW.decision_reason IS NULL AND OLD.decision_reason IS NULL
         OR NEW.decision_reason = 'Motif effacé' AND OLD.decision_reason IS NOT NULL)
       AND (NEW.status, NEW.level, NEW.submitted_at, NEW.decided_by, NEW.second_decided_by, NEW.decided_at)
         IS NOT DISTINCT FROM (OLD.status, OLD.level, OLD.submitted_at, OLD.decided_by, OLD.second_decided_by, OLD.decided_at) THEN
      RETURN NEW;
    END IF;
    -- Décision définitive : seule l'expiration d'une approbation reste possible (revérification §5.4).
    IF OLD.status IN ('approved', 'rejected', 'expired') AND (
         (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'approved' AND NEW.status = 'expired'))
         OR (NEW.level, NEW.checks, NEW.submitted_at, NEW.decided_by, NEW.second_decided_by, NEW.decision_reason, NEW.decided_at)
            IS DISTINCT FROM (OLD.level, OLD.checks, OLD.submitted_at, OLD.decided_by, OLD.second_decided_by, OLD.decision_reason, OLD.decided_at)) THEN
      RAISE EXCEPTION 'décision KYC définitive : ouvrir un nouveau dossier' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.status <> 'approved' AND NEW.decided_by IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW.decided_by, NEW.second_decided_by)
       IS NOT DISTINCT FROM (OLD.status, OLD.decided_by, OLD.second_decided_by) THEN
    RETURN NEW;
  END IF;
  FOREACH decider IN ARRAY array_remove(ARRAY[NEW.decided_by, NEW.second_decided_by], NULL) LOOP
    IF NOT EXISTS (SELECT 1 FROM user_roles r JOIN users u ON u.id = r.user_id
                   WHERE r.user_id = decider AND r.role = 'admin' AND r.deleted_at IS NULL AND u.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'décision KYC réservée à un administrateur actif' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END LOOP;
  IF NEW.status = 'approved' THEN
    IF NEW.player_id IS NOT NULL THEN
      SELECT p.birth_date > (CURRENT_DATE - INTERVAL '18 years')::date INTO sensitive
        FROM players p WHERE p.id = NEW.player_id;
    ELSE
      SELECT o.type IN ('recruiter', 'agency', 'center') INTO sensitive
        FROM organizations o WHERE o.id = NEW.organization_id;
    END IF;
    IF sensitive IS NULL THEN
      RAISE EXCEPTION 'sujet du dossier KYC introuvable : décision refusée' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF sensitive AND NEW.second_decided_by IS NULL THEN
      RAISE EXCEPTION 'dossier sensible : deux administrateurs distincts doivent l''approuver (CP-16)' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION oz_account_deletion_request()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  existing account_deletion_requests;
  created account_deletion_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'suppression : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
      AND u.status IN ('pending_verification', 'active')
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('outcome', 'refused');
  END IF;
  SELECT * INTO existing FROM account_deletion_requests r WHERE r.user_id = me AND r.status = 'pending';
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'pending', 'scheduledFor', existing.scheduled_for);
  END IF;
  INSERT INTO account_deletion_requests (user_id, scheduled_for)
    VALUES (me, now() + interval '30 days') RETURNING * INTO created;
  UPDATE sessions SET revoked_at = now(), revoked_reason = 'account_deleted'
    WHERE user_id = me AND revoked_at IS NULL;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.requested', 'user', me, 'Suppression du compte demandée',
    jsonb_build_object('request_id', created.id));
  RETURN jsonb_build_object('outcome', 'accepted', 'id', created.id,
    'requestedAt', created.requested_at, 'scheduledFor', created.scheduled_for);
END $$;

-- Annulation pendant la rétractation (titulaire). Vrai si une demande était en attente.
CREATE FUNCTION oz_account_deletion_cancel()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  cancelled account_deletion_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'suppression : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE account_deletion_requests SET status = 'cancelled', cancelled_at = now(), updated_at = now()
    WHERE user_id = me AND status = 'pending' AND scheduled_for > now()
    RETURNING * INTO cancelled;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.cancelled', 'user', me, 'Suppression du compte annulée',
    jsonb_build_object('request_id', cancelled.id));
  RETURN true;
END $$;

-- Réservé au worker, hors contexte utilisateur.
CREATE FUNCTION oz_account_deletion_worker_only() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF oz_current_user_id() IS NOT NULL THEN
    RAISE EXCEPTION 'suppression : réservé au worker, hors contexte utilisateur'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END $$;

-- Demandes échues, les plus anciennes d'abord.
CREATE FUNCTION oz_account_deletion_due(p_limit integer)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_account_deletion_worker_only();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'suppression : lot de 1 à 500' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY SELECT r.id FROM account_deletion_requests r
    WHERE r.status = 'pending' AND r.scheduled_for <= now()
    ORDER BY r.scheduled_for LIMIT p_limit;
END $$;

-- Anonymisation d'un compte échu (registre d'effacement, D3 à D5), dans une transaction. Rend
-- `done`, `not_due` (rétractation en cours), le statut en place (`cancelled`, `done`) ou `unknown`.
CREATE FUNCTION oz_account_anonymize(p_request uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  req account_deletion_requests;
  target uuid;
  player_ids uuid[];
  guardian_ids uuid[];
BEGIN
  PERFORM oz_account_deletion_worker_only();
  SELECT * INTO req FROM account_deletion_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF req.status <> 'pending' THEN RETURN req.status; END IF;
  IF req.scheduled_for > now() THEN RETURN 'not_due'; END IF;
  target := req.user_id;
  SELECT coalesce(array_agg(p.id), '{}') INTO player_ids FROM players p WHERE p.user_id = target;
  SELECT coalesce(array_agg(g.id), '{}') INTO guardian_ids FROM guardians g WHERE g.user_id = target;

  UPDATE users SET email = 'deleted+' || id::text || '@invalid', password_hash = NULL,
      totp_secret_encrypted = NULL, totp_enabled_at = NULL, totp_pending_secret_encrypted = NULL,
      totp_last_step = NULL, phone_verified_at = NULL, phone_encrypted = NULL, phone_hmac = NULL,
      email_verified_at = NULL, last_seen_at = NULL, status = 'closed', deleted_at = coalesce(deleted_at, now())
    WHERE id = target;
  UPDATE user_roles SET deleted_at = now() WHERE user_id = target AND deleted_at IS NULL;
  UPDATE sessions SET ip = NULL, user_agent = NULL, device_fingerprint = NULL,
      revoked_at = coalesce(revoked_at, now()), revoked_reason = coalesce(revoked_reason, 'account_deleted')
    WHERE user_id = target;
  UPDATE players SET first_name = 'Anonyme', last_name = 'Anonyme',
      birth_date = make_date(extract(year FROM birth_date)::int, 1, 1), city = NULL,
      phone_encrypted = NULL, phone_hmac = NULL,
      document_number_encrypted = NULL, document_number_hmac = NULL,
      deleted_at = coalesce(deleted_at, now())
    WHERE id = ANY (player_ids);
  UPDATE guardians SET first_name = 'Anonyme', last_name = 'Anonyme',
      phone_encrypted = NULL, phone_hmac = NULL, email_encrypted = NULL, email_hmac = NULL,
      document_number_encrypted = NULL, document_number_hmac = NULL,
      deleted_at = coalesce(deleted_at, now())
    WHERE id = ANY (guardian_ids);
  UPDATE documents SET ocr_extract_encrypted = NULL, document_number_encrypted = NULL,
      document_number_hmac = NULL,
      retention_until = least(retention_until, now())
    WHERE player_id = ANY (player_ids) OR guardian_id = ANY (guardian_ids);
  PERFORM set_config('oz.account_erasure', 'on', true);
  UPDATE kyc_cases SET checks = '[]'::jsonb,
      decision_reason = CASE WHEN decision_reason IS NULL THEN NULL ELSE 'Motif effacé' END
    WHERE player_id = ANY (player_ids);
  PERFORM set_config('oz.account_erasure', '', true);
  -- Une notification encore en file ne part plus (adresse effacée).
  UPDATE notifications SET payload = '{}'::jsonb, last_error = NULL,
      status = CASE WHEN status = 'queued' THEN 'cancelled'::notification_status ELSE status END
    WHERE recipient_user_id = target;
  UPDATE auth_tokens SET consumed_at = now() WHERE user_id = target AND consumed_at IS NULL;
  UPDATE auth_recovery_codes SET consumed_at = now() WHERE user_id = target AND consumed_at IS NULL;
  -- Archive prête : échue, supprimée au passage suivant du worker ; en cours : en échec.
  UPDATE data_export_requests SET expires_at = greatest(now(), ready_at + interval '1 second'),
      updated_at = now()
    WHERE user_id = target AND status = 'ready';
  UPDATE data_export_requests SET status = 'failed', failure_reason = 'account_gone', updated_at = now()
    WHERE user_id = target AND status IN ('pending', 'processing');

  UPDATE account_deletion_requests SET status = 'done', completed_at = now(), updated_at = now()
    WHERE id = req.id;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'account.deletion.done', 'user', target, 'Compte anonymisé',
    jsonb_build_object('request_id', req.id));
  RETURN 'done';
END $$;

REVOKE EXECUTE ON FUNCTION oz_account_deletion_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_account_deletion_cancel() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_account_deletion_worker_only() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_account_deletion_due(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_account_anonymize(uuid) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
      RAISE EXCEPTION 'rôle oz_worker absent : appliquer Terraform avant cette migration';
    END IF;
    GRANT EXECUTE ON FUNCTION oz_account_deletion_request() TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_account_deletion_cancel() TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_account_deletion_due(integer) TO oz_worker;
    GRANT EXECUTE ON FUNCTION oz_account_anonymize(uuid) TO oz_worker;
  END IF;
END $$;
