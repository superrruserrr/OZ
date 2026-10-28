import type { AuthSqlClient } from './auth.js';

const SETTING_KEY = /^[a-z][a-z0-9_.]{0,63}$/;

/**
 * Valeur JSON d'un réglage technique (`system_settings`, sans RLS) ; null s'il est absent. Réglages
 * modifiables sans redéploiement (limites de débit, D2 du lot 1.3ca).
 */
export async function readSetting(db: AuthSqlClient, key: string): Promise<unknown> {
  if (!SETTING_KEY.test(key)) throw new Error('Réglage : clé hors format.');
  const rows = await db.$queryRaw<{ value: unknown }[]>`
    SELECT value FROM system_settings WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}
