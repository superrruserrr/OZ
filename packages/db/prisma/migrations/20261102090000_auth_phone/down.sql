-- Annule 20261102090000_auth_phone (lot 1.3cc).

DROP FUNCTION oz_auth_set_verified_phone(uuid, text, text, text);

DROP TRIGGER "users_guard_phone" ON "users";
DROP FUNCTION oz_users_guard_phone();

DROP INDEX "users_phone_hmac_idx";

-- Le numéro disparaît : sa date ne doit plus faire croire à un compte vérifié (KYC 1).
-- RLS forcée : sans ce relâchement, oz_migrator ne verrait aucune ligne (0 mise à jour, sans erreur).
ALTER TABLE "users" NO FORCE ROW LEVEL SECURITY;
UPDATE "users" SET "phone_verified_at" = NULL WHERE "phone_verified_at" IS NOT NULL;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

ALTER TABLE "users"
  DROP CONSTRAINT "users_phone_verified_check",
  DROP CONSTRAINT "users_phone_pair_check",
  DROP COLUMN "phone_hmac",
  DROP COLUMN "phone_encrypted";
