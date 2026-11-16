-- Renvoi de l'email de confirmation (lot 1.7cc, EX-103 n° 1, n° 9, n° 10 ; dette D-132).
-- Un compte en attente dont le lien est perdu ou expiré en reçoit un nouveau : les jetons de
-- confirmation précédents sont consommés, un seul lien reste valable. Renvoie l'identifiant du
-- compte (l'API envoie l'email), sinon NULL (compte inconnu, déjà vérifié, suspendu, supprimé) ;
-- la réponse HTTP est la même dans tous les cas.

CREATE FUNCTION oz_auth_resend_verification(p_email text, p_token_hash text, p_ttl interval) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  owner uuid;
BEGIN
  PERFORM oz_auth_check_token_hash(p_token_hash);
  PERFORM oz_auth_check_ttl(p_ttl);
  SELECT id INTO owner FROM users
  WHERE email = lower(btrim(p_email)) AND deleted_at IS NULL
    AND status = 'pending_verification' AND email_verified_at IS NULL
  FOR UPDATE;
  IF owner IS NULL THEN RETURN NULL; END IF;
  UPDATE auth_tokens SET consumed_at = now()
  WHERE user_id = owner AND purpose = 'email_verification' AND consumed_at IS NULL;
  INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
  VALUES (owner, 'email_verification', p_token_hash, now() + p_ttl);
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
  VALUES (owner, 'user.email.verification_resent', 'user', owner, 'Renvoi de l''email de confirmation');
  RETURN owner;
END $$;

REVOKE EXECUTE ON FUNCTION oz_auth_resend_verification(text, text, interval) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_auth_resend_verification(text, text, interval) TO oz_app;
  END IF;
END $$;
