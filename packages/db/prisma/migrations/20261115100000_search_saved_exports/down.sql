-- Retour arrière du lot 1.14b : exports inscrits et recherches sauvegardées retirés.
DROP FUNCTION oz_search_export_record(uuid, integer, text, text[]);
DROP FUNCTION oz_search_export_quota(uuid);
DROP TABLE "search_exports";
DROP FUNCTION oz_saved_search_create(text, jsonb, text, text);
DROP TRIGGER "users_erase_saved_searches" ON "users";
DROP FUNCTION oz_saved_searches_erase();
DROP TABLE "saved_searches";
DROP FUNCTION oz_saved_searches_limit();
