-- Annule 20261101100000_auth_totp (lot 1.3cb).

DROP FUNCTION oz_auth_totp_replace_recovery(uuid, text[]);
DROP FUNCTION oz_auth_totp_consume_recovery(uuid, text);
DROP FUNCTION oz_auth_totp_consume_step(uuid, bigint);
DROP FUNCTION oz_auth_totp_disable(uuid, uuid);
DROP FUNCTION oz_auth_totp_enable(uuid, text, bigint, text[], text, uuid);
DROP FUNCTION oz_auth_totp_begin(uuid, text, text);
DROP FUNCTION oz_auth_totp_state(uuid, text);
DROP FUNCTION oz_auth_totp_revoke_others(uuid, uuid);
DROP FUNCTION oz_auth_totp_required(uuid);
DROP FUNCTION oz_auth_check_recovery_hashes(text[]);
DROP FUNCTION oz_auth_check_totp_secret(text);

DROP POLICY "user_roles_privileged_read" ON "user_roles";

DROP TRIGGER "users_guard_totp" ON "users";
DROP FUNCTION oz_users_guard_totp();

DROP TABLE "auth_recovery_codes";

ALTER TABLE "sessions" DROP CONSTRAINT "sessions_revoked_reason_check";
UPDATE "sessions" SET "revoked_reason" = 'revoked_by_user' WHERE "revoked_reason" = 'two_factor_changed';
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_reason_check" CHECK (
  "revoked_reason" IN ('rotated', 'logout', 'revoked_by_user', 'logout_all', 'reuse_detected', 'password_reset')
);

ALTER TABLE "users"
  DROP CONSTRAINT "users_totp_last_step_check",
  DROP CONSTRAINT "users_totp_enabled_check",
  DROP COLUMN "totp_last_step",
  DROP COLUMN "totp_pending_secret_encrypted";
