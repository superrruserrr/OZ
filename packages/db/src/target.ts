import { parseEnv } from 'node:util';
import { resolveAppEnv, type AppEnv } from '@oz/config';

export { databaseTarget, type DatabaseTarget } from './database-target.js';

/**
 * Environnement des commandes à risque (rollback, seed, anonymisation). Le `.env` du poste n'est lu que
 * si DATABASE_URL n'est pas déjà définie : il ne peut pas compléter une URL exportée à la main (vers la
 * production, par exemple) avec son `APP_ENV=local`. APP_ENV est toujours exigé explicitement.
 */
export function cliEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  dotenvContent: string,
): { databaseUrl: string; appEnv: AppEnv } {
  // Une valeur vide compte comme absente.
  const exported = env.DATABASE_URL ? env.DATABASE_URL : undefined;
  const fromFile = exported === undefined ? parseEnv(dotenvContent) : {};
  const databaseUrl = exported ?? fromFile.DATABASE_URL ?? '';
  const rawAppEnv = env.APP_ENV || fromFile.APP_ENV;
  if (databaseUrl === '') throw new Error('DATABASE_URL manquante.');
  if (rawAppEnv === undefined || rawAppEnv === '') {
    throw new Error(
      'APP_ENV requis explicitement pour cette commande (local, preview, staging, production).',
    );
  }
  return { databaseUrl, appEnv: resolveAppEnv(rawAppEnv, env.NODE_ENV) };
}
