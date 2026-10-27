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
  /** Objet JSON pouvant contenir n'importe quelle donnée : remplacé par `{}`. */
  | 'empty_json'
  /** Effacée (NULL). */
  | 'null'
  /** Colonne `bytea` chiffrée par `oz_encrypt` : valeur synthétique rechiffrée avec la clé de la copie. */
  | `encrypted:${SecretKind}`
  /** Index aveugle `oz_blind_index` de la même valeur synthétique, avec la clé de la copie. */
  | `blind_index:${SecretKind}`;

/** Valeurs protégées par chiffrement colonne (plan §6.9, D2 du lot 1.1). */
export type SecretKind = 'phone' | 'email' | 'document_number';

export type Registry = Readonly<Record<string, Readonly<Record<string, ColumnStrategy>>>>;

/** Tables internes des outils, sans donnée de personne. */
export const EXEMPT_TABLES: readonly string[] = ['_prisma_migrations'];

const TIMESTAMPS = {
  id: 'technical',
  created_at: 'technical',
  updated_at: 'technical',
  deleted_at: 'technical',
} as const;
const AUTHORS = { created_by: 'technical', updated_by: 'technical' } as const;

export const ANONYMIZATION_REGISTRY: Registry = {
  system_settings: {
    id: 'technical',
    key: 'technical',
    value: 'technical',
    created_at: 'technical',
    updated_at: 'technical',
  },
  users: {
    ...TIMESTAMPS,
    email: 'email',
    // Hachage Argon2id d'un mot de passe réel : effacé, la copie n'ouvre aucune session existante.
    password_hash: 'null',
    status: 'technical',
    totp_secret_encrypted: 'null',
    totp_enabled_at: 'null',
    email_verified_at: 'technical',
    phone_verified_at: 'technical',
    last_seen_at: 'technical',
  },
  user_roles: {
    ...TIMESTAMPS,
    ...AUTHORS,
    user_id: 'technical',
    role: 'technical',
    organization_id: 'technical',
  },
  sessions: {
    ...TIMESTAMPS,
    user_id: 'technical',
    family_id: 'technical',
    refresh_token_hash: 'technical',
    user_agent: 'null',
    device_fingerprint: 'null',
    ip: 'null',
    expires_at: 'technical',
    last_used_at: 'technical',
    revoked_at: 'technical',
  },
  // Personnes morales : nom et immatriculation publics, contact professionnel effacé.
  organizations: {
    ...TIMESTAMPS,
    ...AUTHORS,
    type: 'technical',
    name: 'technical',
    registration_number: 'technical',
    country: 'technical',
    region: 'technical',
    city: 'technical',
    contact_email: 'email',
    verification_status: 'technical',
  },
  players: {
    ...TIMESTAMPS,
    ...AUTHORS,
    user_id: 'technical',
    oz_id: 'technical',
    first_name: 'first_name',
    last_name: 'last_name',
    birth_date: 'birth_date',
    nationality: 'technical',
    country: 'technical',
    region: 'technical',
    city: 'technical',
    phone_encrypted: 'encrypted:phone',
    phone_hmac: 'blind_index:phone',
    document_number_encrypted: 'encrypted:document_number',
    document_number_hmac: 'blind_index:document_number',
    primary_position: 'technical',
    secondary_position: 'technical',
    dominant_foot: 'technical',
    height_cm: 'technical',
    weight_kg: 'technical',
    verification_status: 'technical',
    guardian_id: 'technical',
    organization_id: 'technical',
    visibility: 'technical',
  },
  guardians: {
    ...TIMESTAMPS,
    ...AUTHORS,
    user_id: 'technical',
    first_name: 'first_name',
    last_name: 'last_name',
    relationship: 'technical',
    country: 'technical',
    phone_encrypted: 'encrypted:phone',
    phone_hmac: 'blind_index:phone',
    email_encrypted: 'encrypted:email',
    email_hmac: 'blind_index:email',
    document_number_encrypted: 'encrypted:document_number',
    document_number_hmac: 'blind_index:document_number',
    verification_status: 'technical',
  },
  consents: {
    ...TIMESTAMPS,
    ...AUTHORS,
    type: 'technical',
    text_version: 'technical',
    player_id: 'technical',
    granted_by_user_id: 'technical',
    granted_by_guardian_id: 'technical',
    granted_at: 'technical',
    revoked_at: 'technical',
  },
  // Journal immuable : réécrit sur la copie seulement, sa chaîne y est rompue (vérifiée en production).
  audit_log: {
    id: 'technical',
    chain_position: 'technical',
    actor_user_id: 'technical',
    action: 'technical',
    target_type: 'technical',
    target_id: 'technical',
    reason: 'free_text',
    request_id: 'technical',
    metadata: 'empty_json',
    prev_hash: 'technical',
    hash: 'technical',
    created_at: 'technical',
  },
  audit_chain_state: { id: 'technical', last_position: 'technical', last_hash: 'technical' },
};
