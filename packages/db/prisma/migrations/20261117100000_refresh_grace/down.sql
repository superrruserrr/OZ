-- Retour à la rotation sans fenêtre de grâce (lot 1.3b).

CREATE OR REPLACE FUNCTION oz_auth_rotate_session(p_token_hash text, p_new_hash text, p_ip inet, p_ttl interval)
RETURNS TABLE (outcome text, user_id uuid, family_id uuid, session_id uuid, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  current_row sessions%ROWTYPE;
  created sessions%ROWTYPE;
  revoked integer;
  next_expiry timestamptz;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_token_hash(p_new_hash);
  PERFORM oz_auth_check_session_ttl(p_ttl, p_ttl);
  SELECT * INTO current_row FROM sessions s
  WHERE s.refresh_token_hash = p_token_hash AND s.deleted_at IS NULL;
  IF FOUND THEN
    -- Famille verrouillée, puis ligne relue : un rejeu concurrent d'une rotation voit la ligne créée.
    PERFORM oz_sessions_lock_family(current_row.family_id);
    SELECT * INTO current_row FROM sessions s WHERE s.id = current_row.id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF current_row.revoked_at IS NOT NULL THEN
    IF current_row.revoked_reason = 'rotated' THEN
      UPDATE sessions s SET revoked_at = now(), revoked_reason = 'reuse_detected'
      WHERE s.family_id = current_row.family_id AND s.revoked_at IS NULL;
      GET DIAGNOSTICS revoked = ROW_COUNT;
      -- Famille déjà fermée (déconnexion, révocation antérieure) : rien à révoquer ni à signaler.
      IF revoked > 0 THEN
        INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
        VALUES (current_row.user_id, 'user.session.reuse_detected', 'session', current_row.id,
                'Réutilisation d''un jeton de rafraîchissement : famille de sessions révoquée');
        RETURN QUERY SELECT 'reuse'::text, current_row.user_id, current_row.family_id, NULL::uuid, NULL::timestamptz;
        RETURN;
      END IF;
    END IF;
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- Ligne sans terme de famille (antérieure au lot 1.3b) : son échéance courante devient ce terme.
  next_expiry := least(now() + p_ttl, coalesce(current_row.family_expires_at, current_row.expires_at));
  IF current_row.expires_at <= now() OR next_expiry <= now()
     OR NOT oz_auth_can_hold_session(current_row.user_id) THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE sessions s SET revoked_at = now(), revoked_reason = 'rotated', last_used_at = now()
  WHERE s.id = current_row.id;
  INSERT INTO sessions (user_id, family_id, refresh_token_hash, user_agent, ip, expires_at, family_expires_at, last_used_at)
  VALUES (current_row.user_id, current_row.family_id, p_new_hash, current_row.user_agent,
          coalesce(oz_auth_truncate_ip(p_ip), current_row.ip), next_expiry,
          coalesce(current_row.family_expires_at, next_expiry), now())
  RETURNING * INTO created;
  RETURN QUERY SELECT 'rotated'::text, created.user_id, created.family_id, created.id, created.expires_at;
END $$;
