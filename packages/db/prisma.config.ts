import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';
import { commandNeedsDatabase } from './src/prisma-command.js';

// Poste de développement : le .env racine fournit DATABASE_URL s'il n'est pas déjà défini.
// Une valeur déjà présente dans l'environnement (tests, CI, déploiement) n'est jamais écrasée ;
// une valeur vide compte comme absente.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// L'URL de la base vient toujours de l'environnement (R8) ; `prisma generate` n'en a pas besoin.
const url = process.env.DATABASE_URL;
if (!url && commandNeedsDatabase(process.argv)) {
  throw new Error('DATABASE_URL requise pour cette commande Prisma (voir docs/db/migrations.md).');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url } } : {}),
});
