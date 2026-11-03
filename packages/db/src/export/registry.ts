/**
 * Classement de chaque colonne de la base pour l'export des données personnelles (lot 1.16ba,
 * EX-118 n° 2). Une colonne est rendue sous `section.champ` du JSON de `oz_personal_data_export`, ou
 * exclue avec son motif. Toute colonne absente fait échouer `pnpm test`, comme le registre
 * d'anonymisation ; un test d'intégration exige que le JSON rendu porte exactement ces champs.
 */
export const EXPORT_SECTIONS = [
  'account',
  'roles',
  'sessions',
  'players',
  'guardians',
  'consents',
  'documents',
  'kycCases',
  'notifications',
  'auditLog',
] as const;
export type ExportSection = (typeof EXPORT_SECTIONS)[number];

export type ExportField = `${ExportSection}.${string}`;
export interface ExportExclusion {
  readonly excluded: string;
}
export type ExportColumn = ExportField | ExportExclusion;
export type ExportRegistry = Readonly<Record<string, Readonly<Record<string, ExportColumn>>>>;

/** Champs calculés par l'assemblage, sans colonne d'origine unique. */
export const COMPUTED_FIELDS: readonly ExportField[] = [
  // Profil propre ou enfant mineur (D4).
  'players.relation',
  // `self`, `guardian` ou `other` : l'auteur tiers d'un consentement n'est jamais nommé.
  'consents.grantedBy',
  // `self`, `system` ou les rôles de l'acteur tiers, jamais son identité (D5).
  'auditLog.actor',
];

const excluded = (reason: string): ExportExclusion => ({ excluded: reason });

// Motifs d'exclusion partagés.
const SECRET = excluded('secret ou empreinte (D6)');
const BLIND_INDEX = excluded('index aveugle, la valeur claire est exportée (D6)');
const STORAGE = excluded('clé de stockage (D6)');
const LINK = excluded('lien interne, la ligne liée est exportée');
const AUTHOR = excluded('auteur interne de la ligne, identité d’un tiers possible');
const SOFT_DELETE = excluded('ligne supprimée, jamais exportée');
const INTERNAL = excluded('donnée technique sans portée pour la personne');
const NOT_PERSONAL = (what: string): ExportExclusion =>
  excluded(`${what}, sans donnée de la personne`);

const AUTHORS = { created_by: AUTHOR, updated_by: AUTHOR } as const;

export const EXPORT_REGISTRY: ExportRegistry = {
  system_settings: {
    id: NOT_PERSONAL('réglage'),
    key: NOT_PERSONAL('réglage'),
    value: NOT_PERSONAL('réglage'),
    created_at: NOT_PERSONAL('réglage'),
    updated_at: NOT_PERSONAL('réglage'),
  },
  users: {
    id: 'account.id',
    email: 'account.email',
    password_hash: SECRET,
    status: 'account.status',
    totp_secret_encrypted: SECRET,
    totp_enabled_at: 'account.twoFactorEnabledAt',
    totp_pending_secret_encrypted: SECRET,
    totp_last_step: SECRET,
    email_verified_at: 'account.emailVerifiedAt',
    phone_verified_at: 'account.phoneVerifiedAt',
    phone_encrypted: 'account.phone',
    phone_hmac: BLIND_INDEX,
    last_seen_at: 'account.lastSeenAt',
    created_at: 'account.createdAt',
    updated_at: 'account.updatedAt',
    deleted_at: SOFT_DELETE,
  },
  user_roles: {
    id: INTERNAL,
    user_id: LINK,
    role: 'roles.role',
    organization_id: 'roles.organizationId',
    created_at: 'roles.grantedAt',
    updated_at: INTERNAL,
    deleted_at: 'roles.revokedAt',
    ...AUTHORS,
  },
  sessions: {
    id: 'sessions.id',
    user_id: LINK,
    family_id: INTERNAL,
    refresh_token_hash: SECRET,
    user_agent: 'sessions.userAgent',
    device_fingerprint: SECRET,
    // Déjà tronquée à l'enregistrement (/24 ou /48).
    ip: 'sessions.ip',
    expires_at: 'sessions.expiresAt',
    last_used_at: 'sessions.lastUsedAt',
    revoked_at: 'sessions.revokedAt',
    revoked_reason: 'sessions.revokedReason',
    family_expires_at: INTERNAL,
    created_at: 'sessions.createdAt',
    updated_at: INTERNAL,
    deleted_at: SOFT_DELETE,
  },
  // Personne morale : seul son nom accompagne le rôle tenu.
  organizations: {
    id: LINK,
    name: 'roles.organizationName',
    type: NOT_PERSONAL('organisation'),
    registration_number: NOT_PERSONAL('organisation'),
    country: NOT_PERSONAL('organisation'),
    region: NOT_PERSONAL('organisation'),
    city: NOT_PERSONAL('organisation'),
    contact_email: NOT_PERSONAL('organisation'),
    verification_status: NOT_PERSONAL('organisation'),
    subscription_id: NOT_PERSONAL('organisation'),
    created_at: NOT_PERSONAL('organisation'),
    updated_at: NOT_PERSONAL('organisation'),
    deleted_at: NOT_PERSONAL('organisation'),
    ...AUTHORS,
  },
  players: {
    id: 'players.id',
    user_id: LINK,
    oz_id: 'players.ozId',
    first_name: 'players.firstName',
    last_name: 'players.lastName',
    birth_date: 'players.birthDate',
    nationality: 'players.nationality',
    country: 'players.country',
    region: 'players.region',
    city: 'players.city',
    phone_encrypted: 'players.phone',
    phone_hmac: BLIND_INDEX,
    document_number_encrypted: 'players.documentNumber',
    document_number_hmac: BLIND_INDEX,
    primary_position: 'players.primaryPosition',
    secondary_position: 'players.secondaryPosition',
    dominant_foot: 'players.dominantFoot',
    height_cm: 'players.heightCm',
    weight_kg: 'players.weightKg',
    verification_status: 'players.verificationStatus',
    guardian_id: LINK,
    organization_id: 'players.organizationId',
    visibility: 'players.visibility',
    search_vector: excluded('index de recherche dérivé des noms exportés'),
    created_at: 'players.createdAt',
    updated_at: 'players.updatedAt',
    deleted_at: SOFT_DELETE,
    ...AUTHORS,
  },
  guardians: {
    id: 'guardians.id',
    user_id: LINK,
    first_name: 'guardians.firstName',
    last_name: 'guardians.lastName',
    relationship: 'guardians.relationship',
    country: 'guardians.country',
    phone_encrypted: 'guardians.phone',
    phone_hmac: BLIND_INDEX,
    email_encrypted: 'guardians.email',
    email_hmac: BLIND_INDEX,
    document_number_encrypted: 'guardians.documentNumber',
    document_number_hmac: BLIND_INDEX,
    verification_status: 'guardians.verificationStatus',
    created_at: 'guardians.createdAt',
    updated_at: 'guardians.updatedAt',
    deleted_at: SOFT_DELETE,
    ...AUTHORS,
  },
  consents: {
    id: 'consents.id',
    type: 'consents.type',
    text_version: 'consents.textVersion',
    player_id: 'consents.playerId',
    granted_by_user_id: excluded('rendu par `grantedBy`, sans identité de tiers'),
    granted_by_guardian_id: excluded('rendu par `grantedBy`, sans identité de tiers'),
    granted_at: 'consents.grantedAt',
    revoked_at: 'consents.revokedAt',
    created_at: INTERNAL,
    updated_at: INTERNAL,
    deleted_at: SOFT_DELETE,
    ...AUTHORS,
  },
  // Pièces : métadonnées seules (D1), le fichier reste lisible par URL signée.
  documents: {
    id: 'documents.id',
    type: 'documents.type',
    player_id: 'documents.playerId',
    guardian_id: 'documents.guardianId',
    organization_id: INTERNAL,
    uploaded_by: AUTHOR,
    storage_key: STORAGE,
    mime_type: 'documents.mimeType',
    size_bytes: 'documents.sizeBytes',
    sha256: SECRET,
    av_status: 'documents.status',
    av_checked_at: 'documents.checkedAt',
    ocr_extract_encrypted: excluded('contenu extrait de la pièce (D1)'),
    document_number_encrypted: excluded('numéro lu sur la pièce (D1), exporté depuis la fiche'),
    document_number_hmac: BLIND_INDEX,
    retention_until: 'documents.retentionUntil',
    rejection_reason: 'documents.rejectionReason',
    width: INTERNAL,
    height: INTERNAL,
    page_count: INTERNAL,
    perceptual_hash: SECRET,
    purged_at: 'documents.purgedAt',
    created_at: 'documents.uploadedAt',
    updated_at: INTERNAL,
    deleted_at: SOFT_DELETE,
    ...AUTHORS,
  },
  document_duplicates: {
    document_id: INTERNAL,
    duplicate_of_id: excluded('lien vers la pièce d’un tiers possible'),
    created_at: INTERNAL,
  },
  document_uploads: {
    id: INTERNAL,
    requested_by: INTERNAL,
    document_type: INTERNAL,
    player_id: INTERNAL,
    guardian_id: INTERNAL,
    organization_id: INTERNAL,
    content_type: INTERNAL,
    size_bytes: INTERNAL,
    sha256: SECRET,
    status: INTERNAL,
    expires_at: INTERNAL,
    completed_at: INTERNAL,
    document_id: INTERNAL,
    reject_reason: INTERNAL,
    created_at: INTERNAL,
  },
  kyc_cases: {
    id: 'kycCases.id',
    player_id: 'kycCases.playerId',
    organization_id: INTERNAL,
    level: 'kycCases.level',
    status: 'kycCases.status',
    checks: excluded('contrôles internes, données extraites des pièces (D1)'),
    submitted_at: 'kycCases.submittedAt',
    decided_by: AUTHOR,
    second_decided_by: AUTHOR,
    decision_reason: 'kycCases.decisionReason',
    decided_at: 'kycCases.decidedAt',
    created_at: INTERNAL,
    updated_at: INTERNAL,
    deleted_at: SOFT_DELETE,
    ...AUTHORS,
  },
  kyc_case_documents: {
    kyc_case_id: INTERNAL,
    document_id: INTERNAL,
    created_at: INTERNAL,
    created_by: AUTHOR,
  },
  imports: {
    id: NOT_PERSONAL('import'),
    organization_id: NOT_PERSONAL('import'),
    source: NOT_PERSONAL('import'),
    file_name: NOT_PERSONAL('import'),
    file_sha256: NOT_PERSONAL('import'),
    file_storage_key: STORAGE,
    mapping: NOT_PERSONAL('import'),
    status: NOT_PERSONAL('import'),
    rows_total: NOT_PERSONAL('import'),
    rows_ok: NOT_PERSONAL('import'),
    rows_rejected: NOT_PERSONAL('import'),
    rows_duplicate: NOT_PERSONAL('import'),
    report_key: STORAGE,
    started_at: NOT_PERSONAL('import'),
    finished_at: NOT_PERSONAL('import'),
    created_at: NOT_PERSONAL('import'),
    updated_at: NOT_PERSONAL('import'),
    deleted_at: NOT_PERSONAL('import'),
    ...AUTHORS,
  },
  subscriptions: {
    id: NOT_PERSONAL('abonnement'),
    organization_id: NOT_PERSONAL('abonnement'),
    tier: NOT_PERSONAL('abonnement'),
    status: NOT_PERSONAL('abonnement'),
    provider: NOT_PERSONAL('abonnement'),
    provider_reference: NOT_PERSONAL('abonnement'),
    period_start: NOT_PERSONAL('abonnement'),
    period_end: NOT_PERSONAL('abonnement'),
    quotas: NOT_PERSONAL('abonnement'),
    cancelled_at: NOT_PERSONAL('abonnement'),
    created_at: NOT_PERSONAL('abonnement'),
    updated_at: NOT_PERSONAL('abonnement'),
    deleted_at: NOT_PERSONAL('abonnement'),
    ...AUTHORS,
  },
  notifications: {
    id: INTERNAL,
    recipient_user_id: LINK,
    channel: 'notifications.channel',
    template: 'notifications.template',
    payload: 'notifications.payload',
    status: 'notifications.status',
    attempts: INTERNAL,
    last_error: excluded('erreur du fournisseur d’envoi'),
    scheduled_at: 'notifications.scheduledAt',
    sent_at: 'notifications.sentAt',
    read_at: 'notifications.readAt',
    created_at: INTERNAL,
    updated_at: INTERNAL,
    deleted_at: SOFT_DELETE,
  },
  // Journal (D5) : métadonnées rendues pour les seules entrées dont la personne est l'acteur.
  audit_log: {
    id: INTERNAL,
    chain_position: excluded('ordre de la chaîne, rendu par l’ordre des entrées'),
    actor_user_id: excluded('rendu par `actor`, sans identité de tiers (D5)'),
    action: 'auditLog.action',
    target_type: 'auditLog.targetType',
    target_id: 'auditLog.targetId',
    reason: 'auditLog.reason',
    request_id: INTERNAL,
    metadata: 'auditLog.metadata',
    prev_hash: INTERNAL,
    hash: INTERNAL,
    created_at: 'auditLog.at',
  },
  audit_chain_state: {
    id: NOT_PERSONAL('état de la chaîne'),
    last_position: NOT_PERSONAL('état de la chaîne'),
    last_hash: NOT_PERSONAL('état de la chaîne'),
  },
  audit_chain_checks: {
    id: NOT_PERSONAL('vérification de la chaîne'),
    checked_at: NOT_PERSONAL('vérification de la chaîne'),
    head_position: NOT_PERSONAL('vérification de la chaîne'),
    anchor_position: NOT_PERSONAL('vérification de la chaîne'),
    defect_position: NOT_PERSONAL('vérification de la chaîne'),
  },
  oz_id_registry: {
    oz_id: excluded('exporté depuis la fiche joueur'),
    player_id: LINK,
    issued_at: INTERNAL,
  },
  auth_tokens: {
    id: INTERNAL,
    user_id: LINK,
    purpose: INTERNAL,
    token_hash: SECRET,
    expires_at: INTERNAL,
    consumed_at: INTERNAL,
    created_at: INTERNAL,
  },
  auth_recovery_codes: {
    id: INTERNAL,
    user_id: LINK,
    code_hash: SECRET,
    consumed_at: INTERNAL,
    created_at: INTERNAL,
  },
  // L'export ne se décrit pas lui-même : le suivi est lu par `GET /account/data-export`.
  data_export_requests: {
    id: INTERNAL,
    user_id: LINK,
    status: INTERNAL,
    requested_at: INTERNAL,
    ready_at: INTERNAL,
    expires_at: INTERNAL,
    storage_key: STORAGE,
    failure_reason: INTERNAL,
    updated_at: INTERNAL,
  },
};

/** Champs attendus dans chaque section du JSON : colonnes exportées et champs calculés. */
export function exportedFields(
  registry: ExportRegistry = EXPORT_REGISTRY,
): Record<ExportSection, string[]> {
  const fields = Object.fromEntries(EXPORT_SECTIONS.map((s) => [s, new Set<string>()])) as Record<
    ExportSection,
    Set<string>
  >;
  const columns = Object.values(registry).flatMap((table) => Object.values(table));
  for (const column of [...columns, ...COMPUTED_FIELDS]) {
    if (typeof column !== 'string') continue;
    const [section, field] = column.split('.') as [ExportSection, string];
    fields[section].add(field);
  }
  return Object.fromEntries(EXPORT_SECTIONS.map((s) => [s, [...fields[s]].sort()])) as Record<
    ExportSection,
    string[]
  >;
}
