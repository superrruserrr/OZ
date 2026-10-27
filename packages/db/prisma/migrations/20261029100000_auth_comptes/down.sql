-- Annule 20261029100000_auth_comptes (lot 1.3a).

DROP FUNCTION oz_auth_rehash_password(uuid, text, text);
DROP FUNCTION oz_auth_reset_password(text, text);
DROP FUNCTION oz_auth_request_password_reset(text, text, interval);
DROP FUNCTION oz_auth_verify_email(text);
DROP FUNCTION oz_auth_mark_email_verified(uuid);
DROP FUNCTION oz_auth_consume_token(text, auth_token_purpose);
DROP FUNCTION oz_auth_credentials(text);
DROP FUNCTION oz_auth_register(text, text, text, interval);
DROP FUNCTION oz_auth_check_token_hash(text);
DROP FUNCTION oz_auth_check_ttl(interval);
DROP FUNCTION oz_auth_is_password_hash(text);

DROP POLICY "audit_log_insert_privileged" ON "audit_log";
DROP POLICY "sessions_privileged" ON "sessions";
DROP POLICY "users_privileged" ON "users";

DROP TABLE "auth_tokens";
DROP TYPE "auth_token_purpose";
