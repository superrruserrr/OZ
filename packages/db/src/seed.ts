import type { AppEnv } from '@oz/config';
import { REFERENCE_DATE } from '@oz/testing';
import { createDbClient } from './client.js';

/** Graine du jeu synthétique : la changer change toutes les données générées. */
export const SEED = 2026;

// Réglages techniques du poste et de la prévisualisation. Les profils synthétiques (fabriques
// @oz/testing) s'y ajouteront avec leurs tables, au lot 1.1.
const SETTINGS = [
  {
    key: 'seed.dataset',
    value: { synthetic: true, source: '@oz/testing', seed: SEED, referenceDate: REFERENCE_DATE },
  },
  { key: 'platform.default_locale', value: 'fr' },
  { key: 'platform.supported_locales', value: ['fr', 'en'] },
] as const;

/**
 * Remplit une base locale ou de prévisualisation avec des données synthétiques déterministes (R10,
 * EX-T10.1). Idempotent : relancer ne duplique ni ne modifie rien. Refusé en recette et en production,
 * qui ne reçoivent que des données anonymisées ou réelles.
 */
export async function seedDatabase(options: {
  databaseUrl: string;
  appEnv: AppEnv;
}): Promise<number> {
  if (options.appEnv === 'staging' || options.appEnv === 'production') {
    throw new Error(
      `Seeds refusées en ${options.appEnv} : données synthétiques réservées au poste et à la prévisualisation (R10).`,
    );
  }
  const db = createDbClient(options.databaseUrl);
  try {
    for (const { key, value } of SETTINGS) {
      // `update: {}` : une valeur déjà présente n'est jamais réécrite (idempotence stricte).
      await db.systemSetting.upsert({ where: { key }, create: { key, value }, update: {} });
    }
    return SETTINGS.length;
  } finally {
    await db.$disconnect();
  }
}
