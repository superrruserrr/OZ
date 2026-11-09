-- Lot 1.16cbb : suppression demandée par le tuteur pour son enfant mineur (EX-118 n° 3,
-- design.md §5.10 « ou le tuteur pour un mineur »). La demande vise la fiche de l'enfant
-- (`player_id`) et, s'il en a un, son compte (`user_id`) ; le tuteur vérifié la demande et seul
-- l'annule (D1 à D3). Majeur avant l'exécution : la tutelle cesse, la demande est annulée (D4).
-- Une seule demande en attente par fiche et par compte (D5).

ALTER TABLE "account_deletion_requests" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "account_deletion_requests" ADD COLUMN "player_id" UUID;
ALTER TABLE "account_deletion_requests" ADD COLUMN "requested_by_user_id" UUID;
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_target_check"
  CHECK ("user_id" IS NOT NULL OR "player_id" IS NOT NULL);
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_guardian_check"
  CHECK (("player_id" IS NULL) = ("requested_by_user_id" IS NULL));
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_player_id_fkey"
  FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "account_deletion_requests_one_pending_player_key"
  ON "account_deletion_requests"("player_id") WHERE "status" = 'pending';

-- ---------------------------------------------------------------------------------------------
-- Masquage (lot 1.16cba, D1) étendu à la fiche visée par une demande du tuteur.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_player_deletion_pending(p_player uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_player IS NOT NULL AND EXISTS (
    SELECT 1 FROM account_deletion_requests r WHERE r.player_id = p_player AND r.status = 'pending')
$$;
REVOKE EXECUTE ON FUNCTION oz_player_deletion_pending(uuid) FROM PUBLIC;

DROP POLICY "players_third_party_read" ON "players";
CREATE POLICY "players_third_party_read" ON "players" FOR SELECT
  USING ("deleted_at" IS NULL AND NOT oz_account_deletion_pending("user_id")
    AND NOT oz_player_deletion_pending("id") AND (
    -- player.read_public : majeur vérifié.
    ("verification_status" = 'verified' AND NOT oz_is_minor("birth_date")
      AND (SELECT oz_has_verified_role(ARRAY['player', 'guardian', 'academy', 'club', 'federation', 'center']::role_kind[])))
    -- player.read_minor : mineur vérifié et publié.
    OR (oz_is_minor("birth_date") AND oz_player_published("id", "guardian_id", "verification_status")
      AND (SELECT oz_has_verified_role(ARRAY['academy', 'club', 'federation']::role_kind[])))
    -- player.read_minor, portée `org` : mineur rattaché à son académie ou à son club.
    OR (oz_is_minor("birth_date")
      AND oz_is_verified_member("organization_id", ARRAY['academy', 'club']::role_kind[]))
  ));

-- ---------------------------------------------------------------------------------------------
-- Demande, suivi et annulation par le tuteur (contexte utilisateur ; ré-authentification faite
-- par l'API). Fiche visée : mineure, non supprimée, dont le compte du contexte est le tuteur
-- vérifié (D3). Tout autre cas : `refused`, indiscernable.
-- ---------------------------------------------------------------------------------------------

-- Fiche de l'enfant dont `me` est le tuteur vérifié, verrouillée ; NULL sinon.
CREATE FUNCTION oz_guardian_child(p_oz_id text, me uuid) RETURNS players
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.* FROM players p JOIN guardians g ON g.id = p.guardian_id
    WHERE p.oz_id = p_oz_id AND p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
      AND g.user_id = me AND g.deleted_at IS NULL AND g.verification_status = 'verified'
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
        AND u.status IN ('pending_verification', 'active'))
  FOR UPDATE OF p
$$;
REVOKE EXECUTE ON FUNCTION oz_guardian_child(text, uuid) FROM PUBLIC;

-- Rend {outcome: accepted, id, requestedAt, scheduledFor, childEmail}, {outcome: pending,
-- scheduledFor} ou {outcome: refused} ; sans contexte, lève. `childEmail` : compte de l'enfant à
-- prévenir (D2), NULL s'il n'en a pas.
CREATE FUNCTION oz_player_deletion_request(p_oz_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  child players;
  existing account_deletion_requests;
  created account_deletion_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'suppression : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  child := oz_guardian_child(p_oz_id, me);
  IF child.id IS NULL THEN RETURN jsonb_build_object('outcome', 'refused'); END IF;
  -- D5 : une demande en attente au plus, qu'elle vienne du tuteur ou du compte de l'enfant.
  SELECT * INTO existing FROM account_deletion_requests r WHERE r.status = 'pending'
    AND (r.player_id = child.id OR (child.user_id IS NOT NULL AND r.user_id = child.user_id))
    FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('outcome', 'pending', 'scheduledFor', existing.scheduled_for);
  END IF;
  -- Demande propre de l'enfant arrivée en même temps (index unique sur `user_id`) : `pending`.
  BEGIN
    INSERT INTO account_deletion_requests (user_id, player_id, requested_by_user_id, scheduled_for)
      VALUES (child.user_id, child.id, me, now() + interval '30 days') RETURNING * INTO created;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO existing FROM account_deletion_requests r WHERE r.status = 'pending'
      AND (r.player_id = child.id OR r.user_id = child.user_id) LIMIT 1;
    RETURN jsonb_build_object('outcome', 'pending', 'scheduledFor', existing.scheduled_for);
  END;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.requested', 'player', child.id,
    'Suppression de la fiche demandée par le tuteur', jsonb_build_object('request_id', created.id));
  RETURN jsonb_build_object('outcome', 'accepted', 'id', created.id,
    'requestedAt', created.requested_at, 'scheduledFor', created.scheduled_for,
    'childEmail', (SELECT u.email FROM users u WHERE u.id = child.user_id AND u.deleted_at IS NULL));
END $$;

-- Demande en attente du tuteur pour cette fiche ({id, requestedAt, scheduledFor}), NULL sinon.
CREATE FUNCTION oz_player_deletion_status(p_oz_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  found_request account_deletion_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'suppression : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.* INTO found_request FROM account_deletion_requests r
    JOIN players p ON p.id = r.player_id JOIN guardians g ON g.id = p.guardian_id
    WHERE p.oz_id = p_oz_id AND r.status = 'pending' AND oz_is_minor(p.birth_date)
      AND g.user_id = me AND g.deleted_at IS NULL AND g.verification_status = 'verified';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', found_request.id, 'requestedAt', found_request.requested_at,
    'scheduledFor', found_request.scheduled_for);
END $$;

-- Annulation par le tuteur seul (D2), jusqu'à l'exécution. Rend {outcome: cancelled, childEmail}
-- ou {outcome: none}.
CREATE FUNCTION oz_player_deletion_cancel(p_oz_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  child players;
  cancelled account_deletion_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'suppression : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  child := oz_guardian_child(p_oz_id, me);
  IF child.id IS NULL THEN RETURN jsonb_build_object('outcome', 'none'); END IF;
  UPDATE account_deletion_requests SET status = 'cancelled', cancelled_at = now(), updated_at = now()
    WHERE player_id = child.id AND status = 'pending'
    RETURNING * INTO cancelled;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'none'); END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.cancelled', 'player', child.id,
    'Suppression de la fiche annulée par le tuteur', jsonb_build_object('request_id', cancelled.id));
  RETURN jsonb_build_object('outcome', 'cancelled',
    'childEmail', (SELECT u.email FROM users u WHERE u.id = child.user_id AND u.deleted_at IS NULL));
END $$;

-- Le compte de l'enfant n'annule pas la demande de son tuteur (D2).
CREATE OR REPLACE FUNCTION oz_account_deletion_cancel()
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
    WHERE user_id = me AND player_id IS NULL AND status = 'pending'
    RETURNING * INTO cancelled;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.cancelled', 'user', me, 'Suppression du compte annulée',
    jsonb_build_object('request_id', cancelled.id));
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- Exécution : demandes de fiche comprises (enfant sans compte : jointure externe).
-- ---------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION oz_account_deletion_due(p_limit integer)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_account_deletion_worker_only();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'suppression : lot de 1 à 500' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY SELECT r.id FROM account_deletion_requests r LEFT JOIN users u ON u.id = r.user_id
    WHERE r.status = 'pending' AND r.scheduled_for <= now()
      AND NOT (u.status IS NOT DISTINCT FROM 'suspended'
        AND oz_account_deletion_frozen_once(r.user_id, r.id)
        -- Demande du tuteur : gardée tant que l'enfant est mineur ; majeur, elle est annulée (D4).
        AND (r.player_id IS NULL OR EXISTS (SELECT 1 FROM players p
          WHERE p.id = r.player_id AND oz_is_minor(p.birth_date))))
    ORDER BY r.scheduled_for LIMIT p_limit;
END $$;

-- Rend `done`, `frozen`, `majority` (D4), `not_due`, le statut en place (`cancelled`, `done`) ou
-- `unknown`. Demande de fiche : la fiche visée et, s'il existe, le compte de l'enfant.
CREATE OR REPLACE FUNCTION oz_account_anonymize(p_request uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  req account_deletion_requests;
  target uuid;
  audit_type text;
  audit_target uuid;
  player_ids uuid[];
  guardian_ids uuid[];
  failed data_export_requests;
BEGIN
  PERFORM oz_account_deletion_worker_only();
  SELECT * INTO req FROM account_deletion_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF req.status <> 'pending' THEN RETURN req.status; END IF;
  IF req.scheduled_for > now() THEN RETURN 'not_due'; END IF;
  -- Demande de fiche : compte de l'enfant relu à l'exécution (rattaché pendant le délai compris).
  target := CASE WHEN req.player_id IS NULL THEN req.user_id
    ELSE coalesce((SELECT p.user_id FROM players p WHERE p.id = req.player_id), req.user_id) END;
  audit_type := CASE WHEN req.player_id IS NULL THEN 'user' ELSE 'player' END;
  audit_target := coalesce(req.player_id, req.user_id);
  -- D4 : l'enfant est devenu majeur, la tutelle a cessé ; il décide seul.
  IF req.player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM players p WHERE p.id = req.player_id AND oz_is_minor(p.birth_date)
  ) THEN
    UPDATE account_deletion_requests SET status = 'cancelled', cancelled_at = now(), updated_at = now()
      WHERE id = req.id;
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (NULL, 'account.deletion.cancelled', 'player', req.player_id,
      'Suppression annulée : enfant devenu majeur',
      jsonb_build_object('request_id', req.id, 'reason', 'majority'));
    RETURN 'majority';
  END IF;
  -- Lot 1.16cba, D3 : compte suspendu = gel (conservation légale possible, art. 17(3) RGPD).
  IF EXISTS (SELECT 1 FROM users u WHERE u.id = target AND u.status = 'suspended') THEN
    IF NOT oz_account_deletion_frozen_once(target, req.id) THEN
      INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
      VALUES (NULL, 'account.deletion.frozen', 'user', target, 'Suppression gelée : compte suspendu',
        jsonb_build_object('request_id', req.id));
    END IF;
    RETURN 'frozen';
  END IF;
  SELECT coalesce(array_agg(p.id), '{}') INTO player_ids FROM players p
    WHERE p.user_id = target OR p.id = req.player_id;
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
  -- Lot 1.16cba, D4 : dossier encore ouvert d'une fiche supprimée, clos sans décision.
  UPDATE kyc_cases SET status = 'expired', checks = '[]'::jsonb
    WHERE player_id = ANY (player_ids) AND status IN ('draft', 'submitted', 'in_review');
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
  FOR failed IN
    UPDATE data_export_requests SET status = 'failed', failure_reason = 'account_gone', updated_at = now()
      WHERE user_id = target AND status IN ('pending', 'processing') RETURNING *
  LOOP
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
    VALUES (NULL, 'data.export.failed', 'user', target, 'Export des données en échec',
      jsonb_build_object('request_id', failed.id, 'reason', 'account_gone'));
  END LOOP;

  UPDATE account_deletion_requests SET status = 'done', completed_at = now(), updated_at = now()
    WHERE id = req.id;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (NULL, 'account.deletion.done', audit_type, audit_target,
    CASE WHEN req.player_id IS NULL THEN 'Compte anonymisé' ELSE 'Fiche anonymisée' END,
    jsonb_build_object('request_id', req.id));
  RETURN 'done';
END $$;

REVOKE EXECUTE ON FUNCTION oz_player_deletion_request(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_deletion_status(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_player_deletion_cancel(text) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_player_deletion_pending(uuid) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_deletion_request(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_deletion_status(text) TO oz_app;
    GRANT EXECUTE ON FUNCTION oz_player_deletion_cancel(text) TO oz_app;
  END IF;
END $$;
