/**
 * Classement de chaque colonne de la base pour l'anonymisation (R10, EX-T10). Toute colonne absente
 * de ce registre bloque l'anonymisation et fait échouer `pnpm test` : une nouvelle table de personnes
 * ne peut pas arriver en recette sans stratégie décidée en revue.
 */
export type ColumnStrategy =
  /** Ni identifiante ni personnelle : conservée telle quelle (clés, horodatages, réglages). */
  | 'technical'
  | 'first_name'
  | 'last_name'
  /** Année conservée (statistiques par âge), jour et mois remplacés. */
  | 'birth_date'
  | 'email'
  | 'phone'
  | 'document_number'
  /** Texte libre pouvant contenir n'importe quelle donnée : remplacé par un texte neutre. */
  | 'free_text'
  /** Effacée (NULL). */
  | 'null';

export type Registry = Readonly<Record<string, Readonly<Record<string, ColumnStrategy>>>>;

/** Tables internes des outils, sans donnée de personne. */
export const EXEMPT_TABLES: readonly string[] = ['_prisma_migrations'];

export const ANONYMIZATION_REGISTRY: Registry = {
  system_settings: {
    id: 'technical',
    key: 'technical',
    value: 'technical',
    created_at: 'technical',
    updated_at: 'technical',
  },
};
