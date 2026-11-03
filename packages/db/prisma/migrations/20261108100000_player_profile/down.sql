-- Annule 20261108100000_player_profile (lot 1.13a).

DROP FUNCTION oz_player_set_visibility(uuid, jsonb);
DROP FUNCTION oz_player_kyc_level(uuid);
DROP TRIGGER "players_visibility_guard" ON "players";
DROP FUNCTION oz_players_visibility_guard();
ALTER TABLE "players" DROP CONSTRAINT "players_visibility_blocks_check";
