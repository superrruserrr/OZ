-- Retour arrière du lot 1.7a : brouillons d'inscription et chemins privilégiés retirés. Les fiches,
-- tuteurs et rôles déjà créés restent (données de personnes, jamais supprimées par un retour arrière).
DROP TRIGGER "users_erase_player_signups" ON "users";
DROP FUNCTION oz_player_signups_erase();
DROP FUNCTION oz_player_signup_complete(text, text);
DROP FUNCTION oz_player_signup_read(text);
DROP FUNCTION oz_player_signup_save(text, jsonb, text);
DROP FUNCTION oz_player_signup_birth_ok(date);
DROP FUNCTION oz_age_years(date, date);
DROP FUNCTION oz_player_signup_open(bytea, text);
DROP FUNCTION oz_player_signup_account();
DROP POLICY "user_roles_privileged_insert" ON "user_roles";
DROP POLICY "guardians_privileged_insert" ON "guardians";
DROP TABLE "player_signups";
