-- Annule 20261026130000_init, dans l'ordre inverse.
-- Les extensions ne sont pas supprimées : elles relèvent du provisionnement de la base (pnpm dev:up,
-- Terraform au lot 0.8) et peuvent exister avant cette migration (docs/db/migrations.md).
DROP TABLE "system_settings";
DROP FUNCTION oz_uuid_v7();
