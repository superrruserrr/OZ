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
    WHERE user_id = me AND status = 'pending' AND scheduled_for > now()
    RETURNING * INTO cancelled;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.cancelled', 'user', me, 'Suppression du compte annulée',
    jsonb_build_object('request_id', cancelled.id));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION oz_account_anonymize(p_request uuid)
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

DROP POLICY "players_third_party_read" ON "players";
CREATE POLICY "players_third_party_read" ON "players" FOR SELECT
  USING ("deleted_at" IS NULL AND (
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
DROP FUNCTION oz_account_deletion_pending(uuid);
CREATE OR REPLACE FUNCTION oz_account_deletion_due(p_limit integer)
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
DROP FUNCTION oz_account_deletion_frozen_once(uuid, uuid);
