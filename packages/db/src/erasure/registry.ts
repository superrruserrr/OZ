/**
 * Effacement d'un compte (lot 1.16ca, EX-118 n° 3) : classement de chaque colonne de la base pour
 * `oz_account_anonymize`. Toute colonne absente fait échouer les tests ; le registre porte les mêmes
 * colonnes que le registre d'anonymisation des copies (`../anonymize/registry.ts`).
 *
 * - `erase` : valeur personnelle des lignes du compte, effacée (NULL) ou remplacée par une valeur
 *   neutre ; vérifié par la preuve d'anonymisation (`test/account-deletion.int.test.ts`).
 * - `aggregate` : conservée, non identifiante une fois les colonnes `erase` effacées (statistiques).
 * - `proof` : conservée comme preuve d'une obligation légale ou de sécurité (consentement, journal).
 * - `technical` : clés, statuts, horodatages, empreintes non réversibles, réglages.
 */
export type ErasureAction = 'erase' | 'aggregate' | 'proof' | 'technical';

export interface ErasureTable {
  /** Lignes concernées par la suppression du compte, ou pourquoi aucune ne l'est. */
  readonly scope: string;
  readonly columns: Readonly<Record<string, ErasureAction>>;
}

export type ErasureRegistry = Readonly<Record<string, ErasureTable>>;

const KEYS = {
  id: 'technical',
  created_at: 'technical',
  updated_at: 'technical',
  deleted_at: 'technical',
} as const;
const AUTHORS = { created_by: 'technical', updated_by: 'technical' } as const;

export const ERASURE_REGISTRY: ErasureRegistry = {
  system_settings: {
    scope: 'Aucune : réglages de la plateforme.',
    columns: {
      id: 'technical',
      key: 'technical',
      value: 'technical',
      ...pick('created_at', 'updated_at'),
    },
  },
  users: {
    scope:
      'Le compte : statut `closed`, `deleted_at` posé, adresse remplacée par `deleted+<id>@invalid`.',
    columns: {
      ...KEYS,
      email: 'erase',
      password_hash: 'erase',
      status: 'technical',
      totp_secret_encrypted: 'erase',
      totp_enabled_at: 'erase',
      totp_pending_secret_encrypted: 'erase',
      totp_last_step: 'erase',
      email_verified_at: 'erase',
      phone_verified_at: 'erase',
      phone_encrypted: 'erase',
      phone_hmac: 'erase',
      last_seen_at: 'erase',
    },
  },
  user_roles: {
    scope:
      'Les rôles du compte : retirés (`deleted_at`), le type de rôle reste pour les statistiques.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      user_id: 'technical',
      role: 'aggregate',
      organization_id: 'aggregate',
    },
  },
  sessions: {
    scope: 'Les sessions du compte : révoquées, appareil et adresse IP effacés.',
    columns: {
      ...KEYS,
      user_id: 'technical',
      family_id: 'technical',
      refresh_token_hash: 'technical',
      user_agent: 'erase',
      device_fingerprint: 'erase',
      ip: 'erase',
      expires_at: 'technical',
      last_used_at: 'technical',
      revoked_at: 'technical',
      revoked_reason: 'technical',
      family_expires_at: 'technical',
    },
  },
  organizations: {
    scope:
      'Aucune : une organisation n’est pas une personne ; elle survit au compte qui l’a créée.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      type: 'technical',
      name: 'technical',
      registration_number: 'technical',
      country: 'technical',
      region: 'technical',
      city: 'technical',
      contact_email: 'technical',
      verification_status: 'technical',
      subscription_id: 'technical',
    },
  },
  players: {
    scope:
      'Les fiches dont le compte est titulaire : identité effacée, date de naissance au 1er janvier, OZ ID conservé et réservé (CP-03), fiche retirée (`deleted_at`).',
    columns: {
      ...KEYS,
      ...AUTHORS,
      user_id: 'technical',
      oz_id: 'proof',
      first_name: 'erase',
      last_name: 'erase',
      birth_date: 'erase',
      nationality: 'aggregate',
      country: 'aggregate',
      region: 'aggregate',
      city: 'erase',
      phone_encrypted: 'erase',
      phone_hmac: 'erase',
      document_number_encrypted: 'erase',
      document_number_hmac: 'erase',
      primary_position: 'aggregate',
      secondary_position: 'aggregate',
      dominant_foot: 'aggregate',
      height_cm: 'aggregate',
      weight_kg: 'aggregate',
      verification_status: 'aggregate',
      guardian_id: 'technical',
      organization_id: 'aggregate',
      visibility: 'technical',
      search_vector: 'erase',
    },
  },
  guardians: {
    scope:
      'Les fiches tuteur du compte : identité et coordonnées effacées, fiche retirée ; l’enfant reste, sans tuteur vérifié.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      user_id: 'technical',
      first_name: 'erase',
      last_name: 'erase',
      relationship: 'aggregate',
      country: 'aggregate',
      phone_encrypted: 'erase',
      phone_hmac: 'erase',
      email_encrypted: 'erase',
      email_hmac: 'erase',
      document_number_encrypted: 'erase',
      document_number_hmac: 'erase',
      verification_status: 'technical',
    },
  },
  consents: {
    scope:
      'Conservés : preuve du consentement donné (type, version, dates) ; ils ne désignent plus qu’un compte anonyme.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      type: 'proof',
      text_version: 'proof',
      player_id: 'proof',
      granted_by_user_id: 'proof',
      granted_by_guardian_id: 'proof',
      granted_at: 'proof',
      revoked_at: 'proof',
    },
  },
  audit_log: {
    scope:
      'Jamais modifié (chaîne, EX-T11) : acteur et cible désignent un compte devenu anonyme (pseudonymisation, D4).',
    columns: {
      id: 'proof',
      created_at: 'proof',
      chain_position: 'proof',
      actor_user_id: 'proof',
      action: 'proof',
      target_type: 'proof',
      target_id: 'proof',
      reason: 'proof',
      request_id: 'proof',
      metadata: 'proof',
      prev_hash: 'proof',
      hash: 'proof',
    },
  },
  audit_chain_state: {
    scope: 'Aucune : état de la chaîne.',
    columns: { id: 'technical', last_position: 'technical', last_hash: 'technical' },
  },
  audit_chain_checks: {
    scope: 'Aucune : vérifications de la chaîne.',
    columns: {
      id: 'technical',
      checked_at: 'technical',
      head_position: 'technical',
      anchor_position: 'technical',
      defect_position: 'technical',
    },
  },
  documents: {
    scope:
      'Les pièces des fiches du compte : numéro et extrait effacés, échéance ramenée à l’instant (fichiers purgés par le worker, D5).',
    columns: {
      ...KEYS,
      ...AUTHORS,
      type: 'aggregate',
      player_id: 'technical',
      guardian_id: 'technical',
      organization_id: 'technical',
      uploaded_by: 'technical',
      storage_key: 'technical',
      mime_type: 'technical',
      size_bytes: 'technical',
      sha256: 'technical',
      av_status: 'technical',
      av_checked_at: 'technical',
      ocr_extract_encrypted: 'erase',
      document_number_encrypted: 'erase',
      document_number_hmac: 'erase',
      retention_until: 'technical',
      rejection_reason: 'technical',
      width: 'technical',
      height: 'technical',
      page_count: 'technical',
      perceptual_hash: 'technical',
      purged_at: 'technical',
    },
  },
  document_duplicates: {
    scope: 'Liens entre pièces : sans donnée personnelle.',
    columns: {
      ...pick('created_at'),
      document_id: 'technical',
      duplicate_of_id: 'technical',
    },
  },
  document_uploads: {
    scope: 'Intentions de dépôt : métadonnées techniques seules.',
    columns: {
      ...pick('id', 'created_at'),
      requested_by: 'technical',
      document_type: 'technical',
      player_id: 'technical',
      guardian_id: 'technical',
      organization_id: 'technical',
      content_type: 'technical',
      size_bytes: 'technical',
      sha256: 'technical',
      status: 'technical',
      expires_at: 'technical',
      completed_at: 'technical',
      document_id: 'technical',
      reject_reason: 'technical',
    },
  },
  kyc_cases: {
    scope:
      'Les dossiers des fiches du compte : contrôles et motif libre effacés ; niveau, statut et dates conservés.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      player_id: 'technical',
      organization_id: 'technical',
      level: 'aggregate',
      status: 'aggregate',
      checks: 'erase',
      submitted_at: 'aggregate',
      decided_by: 'proof',
      second_decided_by: 'proof',
      decision_reason: 'erase',
      decided_at: 'aggregate',
    },
  },
  kyc_case_documents: {
    scope: 'Liens dossier-pièce : sans donnée personnelle.',
    columns: {
      ...pick('created_at'),
      kyc_case_id: 'technical',
      document_id: 'technical',
      created_by: 'technical',
    },
  },
  imports: {
    scope: 'Aucune : imports d’une organisation.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      organization_id: 'technical',
      source: 'technical',
      file_name: 'technical',
      file_sha256: 'technical',
      file_storage_key: 'technical',
      mapping: 'technical',
      status: 'technical',
      rows_total: 'technical',
      rows_ok: 'technical',
      rows_rejected: 'technical',
      rows_duplicate: 'technical',
      report_key: 'technical',
      started_at: 'technical',
      finished_at: 'technical',
    },
  },
  subscriptions: {
    scope: 'Aucune : abonnements d’une organisation.',
    columns: {
      ...KEYS,
      ...AUTHORS,
      organization_id: 'technical',
      tier: 'technical',
      status: 'technical',
      provider: 'technical',
      provider_reference: 'technical',
      period_start: 'technical',
      period_end: 'technical',
      quotas: 'technical',
      cancelled_at: 'technical',
    },
  },
  notifications: {
    scope: 'Les notifications du compte : contenu et erreur d’envoi effacés.',
    columns: {
      ...KEYS,
      recipient_user_id: 'technical',
      channel: 'technical',
      template: 'technical',
      payload: 'erase',
      status: 'technical',
      attempts: 'technical',
      last_error: 'erase',
      scheduled_at: 'technical',
      sent_at: 'technical',
      read_at: 'technical',
    },
  },
  oz_id_registry: {
    scope: 'Conservé : l’OZ ID reste réservé à vie (EX-118 n° 3, CP-03).',
    columns: { oz_id: 'proof', player_id: 'proof', issued_at: 'proof' },
  },
  auth_tokens: {
    scope: 'Les jetons du compte : consommés (empreintes SHA-256 seules, non réversibles).',
    columns: {
      ...pick('id', 'created_at'),
      user_id: 'technical',
      purpose: 'technical',
      token_hash: 'technical',
      expires_at: 'technical',
      consumed_at: 'technical',
    },
  },
  auth_recovery_codes: {
    scope: 'Les codes de secours du compte : consommés (empreintes HMAC seules).',
    columns: {
      ...pick('id', 'created_at'),
      user_id: 'technical',
      code_hash: 'technical',
      consumed_at: 'technical',
    },
  },
  data_export_requests: {
    scope:
      'Les demandes d’export du compte : archive prête rendue échue (supprimée par le worker), en cours passée en échec.',
    columns: {
      ...pick('id', 'updated_at'),
      user_id: 'technical',
      status: 'technical',
      requested_at: 'technical',
      ready_at: 'technical',
      expires_at: 'technical',
      storage_key: 'technical',
      failure_reason: 'technical',
    },
  },
  account_deletion_requests: {
    scope:
      'Les demandes de suppression du compte ou de la fiche d’un enfant : conservées, `done` (preuve de la suppression).',
    columns: {
      ...pick('id', 'updated_at'),
      user_id: 'proof',
      player_id: 'proof',
      requested_by_user_id: 'proof',
      status: 'proof',
      requested_at: 'proof',
      scheduled_for: 'proof',
      cancelled_at: 'proof',
      completed_at: 'proof',
    },
  },
};

function pick<K extends string>(...names: K[]): Record<K, 'technical'> {
  return Object.fromEntries(names.map((name) => [name, 'technical'])) as Record<K, 'technical'>;
}

/** Colonnes effacées, `table.colonne`. */
export function erasedColumns(registry: ErasureRegistry = ERASURE_REGISTRY): string[] {
  return Object.entries(registry).flatMap(([table, { columns }]) =>
    Object.entries(columns).flatMap(([column, action]) =>
      action === 'erase' ? [`${table}.${column}`] : [],
    ),
  );
}

/** Colonnes non techniques par table (`docs/security/account-deletion.md`) : effacées, gardées. */
export function erasureInventory(
  registry: ErasureRegistry = ERASURE_REGISTRY,
): Record<string, Record<Exclude<ErasureAction, 'technical'>, string[]>> {
  const inventory: Record<string, Record<Exclude<ErasureAction, 'technical'>, string[]>> = {};
  for (const [table, { columns }] of Object.entries(registry)) {
    const row = { erase: [] as string[], aggregate: [] as string[], proof: [] as string[] };
    for (const [column, action] of Object.entries(columns)) {
      if (action !== 'technical') row[action].push(column);
    }
    if (row.erase.length + row.aggregate.length + row.proof.length > 0) inventory[table] = row;
  }
  return inventory;
}
