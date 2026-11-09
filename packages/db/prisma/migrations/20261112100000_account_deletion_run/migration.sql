-- Lot 1.16cba : exécution de la suppression de compte (EX-118 n° 3, design.md §5.10). Fiche
-- invisible des tiers pendant le délai de rétractation (D1), annulation jusqu'à l'exécution (D2),
-- gel d'un compte suspendu (D3), dossiers KYC ouverts clos (D4).

-- ---------------------------------------------------------------------------------------------
-- D1 : suppression en attente du titulaire. Lit `account_deletion_requests` sous le chemin
-- privilégié (la RLS n'y montre que ses propres demandes) ; rend un booléen, rien d'autre.
-- ---------------------------------------------------------------------------------------------

CREATE FUNCTION oz_account_deletion_pending(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_user IS NOT NULL AND EXISTS (
    SELECT 1 FROM account_deletion_requests r WHERE r.user_id = p_user AND r.status = 'pending')
$$;
REVOKE EXECUTE ON FUNCTION oz_account_deletion_pending(uuid) FROM PUBLIC;

-- Lecture tierce (lot 1.4b) : même règle, sauf fiche d'un titulaire en délai de rétractation. Le
-- titulaire (`players_owner`), son tuteur et l'administrateur (`players_admin_read`) la lisent.
DROP POLICY "players_third_party_read" ON "players";
CREATE POLICY "players_third_party_read" ON "players" FOR SELECT
  USING ("deleted_at" IS NULL AND NOT oz_account_deletion_pending("user_id") AND (
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
-- D2 : annulation jusqu'à l'exécution effective, échéance passée comprise (verrou de la demande
-- partagé avec l'anonymisation : l'une ou l'autre l'emporte, jamais les deux).
-- ---------------------------------------------------------------------------------------------

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
    WHERE user_id = me AND status = 'pending'
    RETURNING * INTO cancelled;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'account.deletion.cancelled', 'user', me, 'Suppression du compte annulée',
    jsonb_build_object('request_id', cancelled.id));
  RETURN true;
END $$;

-- ---------------------------------------------------------------------------------------------
-- D3 et D4 : gel d'un compte suspendu ; dossiers KYC ouverts clos ; exports en cours audités.
-- Rend `done`, `frozen`, `not_due`, le statut en place (`cancelled`, `done`) ou `unknown`.
-- ---------------------------------------------------------------------------------------------

-- Gel déjà signalé pour cette demande (audit `account.deletion.frozen`).
CREATE FUNCTION oz_account_deletion_frozen_once(p_user uuid, p_request uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM audit_log a WHERE a.target_type = 'user' AND a.target_id = p_user
    AND a.action = 'account.deletion.frozen' AND a.metadata ->> 'request_id' = p_request::text)
$$;
REVOKE EXECUTE ON FUNCTION oz_account_deletion_frozen_once(uuid, uuid) FROM PUBLIC;

-- Demandes échues ; un compte suspendu dont le gel est déjà signalé est écarté jusqu'à la levée,
-- pour qu'il ne retienne pas le lot (une alerte par demande, D3).
CREATE OR REPLACE FUNCTION oz_account_deletion_due(p_limit integer)
RETURNS SETOF uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM oz_account_deletion_worker_only();
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'suppression : lot de 1 à 500' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN QUERY SELECT r.id FROM account_deletion_requests r JOIN users u ON u.id = r.user_id
    WHERE r.status = 'pending' AND r.scheduled_for <= now()
      AND NOT (u.status = 'suspended' AND oz_account_deletion_frozen_once(r.user_id, r.id))
    ORDER BY r.scheduled_for LIMIT p_limit;
END $$;

CREATE OR REPLACE FUNCTION oz_account_anonymize(p_request uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  req account_deletion_requests;
  target uuid;
  player_ids uuid[];
  guardian_ids uuid[];
  failed data_export_requests;
BEGIN
  PERFORM oz_account_deletion_worker_only();
  SELECT * INTO req FROM account_deletion_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown'; END IF;
  IF req.status <> 'pending' THEN RETURN req.status; END IF;
  IF req.scheduled_for > now() THEN RETURN 'not_due'; END IF;
  target := req.user_id;
  -- D3 : compte suspendu = gel (conservation légale possible, art. 17(3) RGPD). Rien n'est modifié,
  -- la demande reste en attente et reprend au balayage suivant la levée ; une alerte par demande.
  IF EXISTS (SELECT 1 FROM users u WHERE u.id = target AND u.status = 'suspended') THEN
    IF NOT oz_account_deletion_frozen_once(target, req.id) THEN
      INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
      VALUES (NULL, 'account.deletion.frozen', 'user', target, 'Suppression gelée : compte suspendu',
        jsonb_build_object('request_id', req.id));
    END IF;
    RETURN 'frozen';
  END IF;
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
  -- D4 : dossier encore ouvert d'une fiche supprimée, clos sans décision et plus jamais décidable.
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
  -- Exports en cours : en échec, audités comme par `oz_data_export_fail`.
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
  VALUES (NULL, 'account.deletion.done', 'user', target, 'Compte anonymisé',
    jsonb_build_object('request_id', req.id));
  RETURN 'done';
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_account_deletion_pending(uuid) TO oz_app;
  END IF;
END $$;
