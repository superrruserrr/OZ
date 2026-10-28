-- Annule 20261030100000_auth_sessions (lot 1.3b).

DROP FUNCTION oz_auth_logout(text);
DROP FUNCTION oz_auth_rotate_session(text, text, inet, interval);
DROP FUNCTION oz_auth_open_session(uuid, text, text, inet, interval, interval);
DROP FUNCTION oz_auth_can_hold_session(uuid);
DROP FUNCTION oz_auth_check_session_ttl(interval, interval);
DROP FUNCTION oz_auth_truncate_ip(inet);
DROP FUNCTION oz_sessions_lock_family(uuid);

DROP TRIGGER "sessions_guard" ON "sessions";
DROP FUNCTION oz_sessions_guard();
DROP POLICY "sessions_self_revoke" ON "sessions";
DROP POLICY "sessions_self_read" ON "sessions";
CREATE POLICY "sessions_self" ON "sessions" FOR ALL
  USING ("user_id" = oz_current_user_id()) WITH CHECK ("user_id" = oz_current_user_id());

-- Version du lot 1.3a, sans motif de révocation.
CREATE OR REPLACE FUNCTION oz_auth_reset_password(p_token_hash text, p_password_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid;
  address text;
BEGIN
  IF p_password_hash IS NULL OR NOT oz_auth_is_password_hash(p_password_hash) THEN
    RAISE EXCEPTION 'hash de mot de passe Argon2id attendu' USING ERRCODE = 'check_violation';
  END IF;
  owner := oz_auth_consume_token(p_token_hash, 'password_reset');
  IF owner IS NULL THEN RETURN NULL; END IF;
  -- Un compte suspendu ou clos depuis la demande ne change plus de mot de passe.
  UPDATE users
  SET password_hash = p_password_hash,
      email_verified_at = coalesce(email_verified_at, now()),
      status = CASE WHEN status = 'pending_verification' THEN 'active'::user_status ELSE status END,
      updated_at = now()
  WHERE id = owner AND deleted_at IS NULL AND status IN ('pending_verification', 'active')
  RETURNING email INTO address;
  IF address IS NULL THEN RETURN NULL; END IF;
  UPDATE auth_tokens SET consumed_at = now()
  WHERE user_id = owner AND purpose = 'password_reset' AND consumed_at IS NULL;
  UPDATE sessions SET revoked_at = now(), updated_at = now()
  WHERE user_id = owner AND revoked_at IS NULL;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (owner, 'user.password.reset', 'user', owner, 'Réinitialisation du mot de passe');
  RETURN address;
END $$;

ALTER TABLE "sessions"
  DROP CONSTRAINT "sessions_user_agent_check",
  DROP CONSTRAINT "sessions_family_expires_at_check",
  DROP CONSTRAINT "sessions_revoked_consistency_check",
  DROP CONSTRAINT "sessions_revoked_reason_check",
  DROP COLUMN "family_expires_at",
  DROP COLUMN "revoked_reason";
