-- Annule 20261102150000_rbac_rls (lot 1.4b).

DROP POLICY "players_admin_read" ON "players";
DROP POLICY "players_third_party_read" ON "players";

DROP FUNCTION oz_player_published(uuid, uuid, verification_status);
DROP FUNCTION oz_is_verified_member(uuid, role_kind[]);
DROP FUNCTION oz_has_verified_role(role_kind[]);
DROP FUNCTION oz_is_minor(date);
DROP FUNCTION oz_is_minor_at(date, date);

DROP POLICY "consents_privileged_read" ON "consents";
DROP POLICY "guardians_privileged_read" ON "guardians";
DROP POLICY "organizations_privileged_read" ON "organizations";
