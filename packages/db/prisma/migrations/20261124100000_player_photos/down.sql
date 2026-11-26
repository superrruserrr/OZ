DROP FUNCTION IF EXISTS oz_player_remove_photo(uuid, uuid);
DROP FUNCTION IF EXISTS oz_player_set_profile_photo(uuid, uuid);
DROP FUNCTION IF EXISTS oz_player_photo_manager(uuid);
DROP FUNCTION IF EXISTS oz_player_photos(uuid);
DROP TRIGGER IF EXISTS "document_uploads_photo_limit" ON "document_uploads";
DROP FUNCTION IF EXISTS oz_document_uploads_photo_limit();
DROP FUNCTION IF EXISTS oz_player_photo_count(uuid);
DROP TRIGGER IF EXISTS "documents_photo_retention" ON "documents";
DROP FUNCTION IF EXISTS oz_documents_photo_retention();
DROP TRIGGER IF EXISTS "players_profile_photo_guard" ON "players";
DROP FUNCTION IF EXISTS oz_players_profile_photo_guard();
ALTER TABLE "players" DROP CONSTRAINT IF EXISTS "players_profile_photo_id_fkey";
ALTER TABLE "players" DROP COLUMN IF EXISTS "profile_photo_id";
UPDATE "players" SET "visibility" = "visibility" - 'photos';
ALTER TABLE "players" DROP CONSTRAINT "players_visibility_blocks_check";
ALTER TABLE "players" ADD CONSTRAINT "players_visibility_blocks_check" CHECK (
  ("visibility" - ARRAY['location', 'physical', 'sport']) = '{}'::jsonb
  AND coalesce(jsonb_typeof("visibility" -> 'location'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'physical'), 'boolean') = 'boolean'
  AND coalesce(jsonb_typeof("visibility" -> 'sport'), 'boolean') = 'boolean');
