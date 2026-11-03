-- Lot 1.16ba : export des données personnelles (EX-118 n° 2, design.md §5.10). Inventaire assemblé
-- en base par oz_personal_data_export (exécutée par le worker au lot 1.16bb), demandes d'export
-- enregistrées par oz_data_export_request. Le classement de chaque colonne fait foi dans
-- packages/db/src/export/registry.ts : un test exige que le JSON rendu le respecte exactement.

-- Demandes d'export : une active au plus par personne (D3), suivi lu par le demandeur seul.
CREATE TABLE "data_export_requests" (
    "id" UUID NOT NULL DEFAULT oz_uuid_v7(),
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "ready_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "storage_key" TEXT,
    "failure_reason" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "data_export_requests_status_check"
      CHECK ("status" IN ('pending', 'processing', 'ready', 'failed', 'expired')),
    -- Une archive prête a sa clé et ses échéances ; un échec, son motif.
    CONSTRAINT "data_export_requests_ready_check" CHECK (
      ("status" = 'ready') <= ("storage_key" IS NOT NULL AND "ready_at" IS NOT NULL
        AND "expires_at" IS NOT NULL AND "expires_at" > "ready_at")),
    CONSTRAINT "data_export_requests_failed_check" CHECK (("status" = 'failed') = ("failure_reason" IS NOT NULL))
);
CREATE UNIQUE INDEX "data_export_requests_one_active_key" ON "data_export_requests"("user_id")
  WHERE "status" IN ('pending', 'processing', 'ready');
CREATE INDEX "data_export_requests_user_id_requested_at_idx" ON "data_export_requests"("user_id", "requested_at");
CREATE INDEX "data_export_requests_status_idx" ON "data_export_requests"("status");
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_export_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "data_export_requests" FORCE ROW LEVEL SECURITY;

-- Le demandeur lit ses demandes ; toute écriture passe par le chemin privilégié.
CREATE POLICY "data_export_requests_owner_read" ON "data_export_requests" FOR SELECT
  USING ("user_id" = (SELECT oz_current_user_id()));
CREATE POLICY "data_export_requests_privileged" ON "data_export_requests" FOR ALL
  USING (oz_privileged()) WITH CHECK (oz_privileged());

-- Lecture par le chemin privilégié des tables que l'assemblage parcourt sans politique jusqu'ici.
CREATE POLICY "kyc_cases_privileged_read" ON "kyc_cases" FOR SELECT USING (oz_privileged());
CREATE POLICY "notifications_privileged_read" ON "notifications" FOR SELECT USING (oz_privileged());

-- Demande d'export (D3) : compte en état, aucune demande active, aucune acceptée depuis 24 heures.
-- Rend {outcome: accepted, id, requestedAt}, {outcome: active}, {outcome: too_soon, nextRequestAt}
-- ou {outcome: refused} (compte supprimé, suspendu ou clos) ; sans contexte utilisateur, lève.
CREATE FUNCTION oz_data_export_request()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  last_at timestamptz;
  created data_export_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'export : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Verrou du compte, puis son état : deux demandes simultanées ne passent pas toutes deux le
  -- contrôle de délai, et une suspension concurrente est vue.
  IF NOT EXISTS (
    SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
      AND u.status IN ('pending_verification', 'active')
    FOR UPDATE
  ) THEN
    RETURN jsonb_build_object('outcome', 'refused');
  END IF;
  IF EXISTS (SELECT 1 FROM data_export_requests r
             WHERE r.user_id = me AND r.status IN ('pending', 'processing', 'ready')) THEN
    RETURN jsonb_build_object('outcome', 'active');
  END IF;
  -- Un échec de production (faute du système) ne retient pas la personne 24 heures.
  SELECT max(r.requested_at) INTO last_at FROM data_export_requests r
    WHERE r.user_id = me AND r.status <> 'failed';
  IF last_at IS NOT NULL AND last_at > now() - interval '24 hours' THEN
    RETURN jsonb_build_object('outcome', 'too_soon', 'nextRequestAt', last_at + interval '24 hours');
  END IF;
  INSERT INTO data_export_requests (user_id) VALUES (me) RETURNING * INTO created;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'data.export.requested', 'user', me, 'Export des données demandé', '{}'::jsonb);
  RETURN jsonb_build_object('outcome', 'accepted', 'id', created.id, 'requestedAt', created.requested_at);
END $$;

-- Toutes les données personnelles d'un compte (D1 à D7 du lot 1.16ba), en JSON versionné. NULL si
-- le compte n'existe pas ou est supprimé. `p_key` : clé `oz_encrypt` (DATABASE_ENCRYPTION_KEY).
CREATE FUNCTION oz_personal_data_export(p_user uuid, p_key text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  account users;
  player_ids uuid[];
  guardian_ids uuid[];
  session_ids uuid[];
  document_ids uuid[];
BEGIN
  -- Hors du chemin privilégié, la RLS cacherait tout : échec explicite, jamais un export vide.
  IF NOT oz_privileged() THEN
    RAISE EXCEPTION 'export : chemin privilégié requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO account FROM users u WHERE u.id = p_user AND u.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT coalesce(array_agg(g.id), '{}') INTO guardian_ids
    FROM guardians g WHERE g.user_id = p_user AND g.deleted_at IS NULL;
  -- Son profil, et ses enfants mineurs dont il est le tuteur vérifié (D4).
  SELECT coalesce(array_agg(p.id), '{}') INTO player_ids FROM players p
    WHERE p.deleted_at IS NULL AND (p.user_id = p_user OR (
      oz_is_minor(p.birth_date) AND EXISTS (
        SELECT 1 FROM guardians g WHERE g.id = p.guardian_id AND g.id = ANY (guardian_ids)
          AND g.verification_status = 'verified')));
  SELECT coalesce(array_agg(s.id), '{}') INTO session_ids
    FROM sessions s WHERE s.user_id = p_user AND s.deleted_at IS NULL;
  SELECT coalesce(array_agg(d.id), '{}') INTO document_ids FROM documents d
    WHERE d.deleted_at IS NULL AND (d.player_id = ANY (player_ids) OR d.guardian_id = ANY (guardian_ids));

  RETURN jsonb_build_object(
    'formatVersion', 1,
    'generatedAt', now(),
    'account', jsonb_build_object(
      'id', account.id,
      'email', account.email,
      'phone', oz_decrypt(account.phone_encrypted, p_key),
      'status', account.status,
      'emailVerifiedAt', account.email_verified_at,
      'phoneVerifiedAt', account.phone_verified_at,
      'twoFactorEnabledAt', account.totp_enabled_at,
      'lastSeenAt', account.last_seen_at,
      'createdAt', account.created_at,
      'updatedAt', account.updated_at),
    'roles', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'role', r.role,
        'organizationId', r.organization_id,
        'organizationName', o.name,
        'grantedAt', r.created_at,
        'revokedAt', r.deleted_at) ORDER BY r.created_at), '[]')
      FROM user_roles r LEFT JOIN organizations o ON o.id = r.organization_id
      WHERE r.user_id = p_user),
    'sessions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'userAgent', s.user_agent,
        'ip', host(s.ip),
        'createdAt', s.created_at,
        'lastUsedAt', s.last_used_at,
        'expiresAt', s.expires_at,
        'revokedAt', s.revoked_at,
        'revokedReason', s.revoked_reason) ORDER BY s.created_at), '[]')
      FROM sessions s WHERE s.id = ANY (session_ids)),
    'players', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'relation', CASE WHEN p.user_id = p_user THEN 'self' ELSE 'child' END,
        'id', p.id,
        'ozId', p.oz_id,
        'firstName', p.first_name,
        'lastName', p.last_name,
        'birthDate', p.birth_date,
        'nationality', p.nationality,
        'country', p.country,
        'region', p.region,
        'city', p.city,
        'phone', oz_decrypt(p.phone_encrypted, p_key),
        'documentNumber', oz_decrypt(p.document_number_encrypted, p_key),
        'primaryPosition', p.primary_position,
        'secondaryPosition', p.secondary_position,
        'dominantFoot', p.dominant_foot,
        'heightCm', p.height_cm,
        'weightKg', p.weight_kg,
        'verificationStatus', p.verification_status,
        'organizationId', p.organization_id,
        'visibility', p.visibility,
        'createdAt', p.created_at,
        'updatedAt', p.updated_at) ORDER BY p.created_at), '[]')
      FROM players p WHERE p.id = ANY (player_ids)),
    'guardians', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', g.id,
        'firstName', g.first_name,
        'lastName', g.last_name,
        'relationship', g.relationship,
        'country', g.country,
        'phone', oz_decrypt(g.phone_encrypted, p_key),
        'email', oz_decrypt(g.email_encrypted, p_key),
        'documentNumber', oz_decrypt(g.document_number_encrypted, p_key),
        'verificationStatus', g.verification_status,
        'createdAt', g.created_at,
        'updatedAt', g.updated_at) ORDER BY g.created_at), '[]')
      FROM guardians g WHERE g.id = ANY (guardian_ids)),
    'consents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'type', c.type,
        'textVersion', c.text_version,
        'playerId', c.player_id,
        'grantedBy', CASE
          WHEN c.granted_by_user_id = p_user OR c.granted_by_guardian_id = ANY (guardian_ids) THEN 'self'
          WHEN c.granted_by_guardian_id IS NOT NULL THEN 'guardian'
          ELSE 'other' END,
        'grantedAt', c.granted_at,
        'revokedAt', c.revoked_at) ORDER BY c.granted_at), '[]')
      -- Jamais le consentement d'un joueur hors de l'export (enfant majeur, lien non vérifié, D4).
      FROM consents c WHERE c.deleted_at IS NULL
        AND (c.player_id IS NULL OR c.player_id = ANY (player_ids))
        AND (c.player_id = ANY (player_ids)
          OR c.granted_by_user_id = p_user OR c.granted_by_guardian_id = ANY (guardian_ids))),
    -- Pièces : métadonnées seules (D1), ni clé de stockage, ni empreinte, ni contenu extrait.
    'documents', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'type', d.type,
        'playerId', d.player_id,
        'guardianId', d.guardian_id,
        'mimeType', d.mime_type,
        'sizeBytes', d.size_bytes,
        'status', d.av_status,
        'checkedAt', d.av_checked_at,
        'rejectionReason', d.rejection_reason,
        'retentionUntil', d.retention_until,
        'purgedAt', d.purged_at,
        'uploadedAt', d.created_at) ORDER BY d.created_at), '[]')
      FROM documents d WHERE d.id = ANY (document_ids)),
    'kycCases', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', k.id,
        'playerId', k.player_id,
        'level', k.level,
        'status', k.status,
        'submittedAt', k.submitted_at,
        'decisionReason', k.decision_reason,
        'decidedAt', k.decided_at) ORDER BY k.created_at), '[]')
      FROM kyc_cases k WHERE k.deleted_at IS NULL AND k.player_id = ANY (player_ids)),
    'notifications', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'channel', n.channel,
        'template', n.template,
        'payload', n.payload,
        'status', n.status,
        'scheduledAt', n.scheduled_at,
        'sentAt', n.sent_at,
        'readAt', n.read_at) ORDER BY n.created_at), '[]')
      FROM notifications n WHERE n.deleted_at IS NULL AND n.recipient_user_id = p_user),
    -- Journal (D5) : l'acteur tiers n'est rendu que par ses rôles ; ses métadonnées ne sortent pas.
    'auditLog', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'at', a.created_at,
        'actor', CASE
          WHEN a.actor_user_id = p_user THEN 'self'
          WHEN a.actor_user_id IS NULL THEN 'system'
          ELSE coalesce((SELECT string_agg(DISTINCT r.role::text, ',')
                         FROM user_roles r WHERE r.user_id = a.actor_user_id AND r.deleted_at IS NULL), 'user')
          END,
        'action', a.action,
        'targetType', a.target_type,
        -- Cible d'autrui (fiche consultée par un recruteur, enfant devenu majeur) : ni son
        -- identifiant, ni les métadonnées qui la décrivent.
        'targetId', CASE WHEN s.in_scope THEN a.target_id END,
        'reason', a.reason,
        'metadata', CASE WHEN a.actor_user_id = p_user AND s.in_scope THEN a.metadata END)
        ORDER BY a.chain_position), '[]')
      FROM audit_log a, LATERAL (SELECT
          (a.target_type = 'user' AND a.target_id = p_user)
          OR (a.target_type IN ('player', 'oz_id') AND a.target_id = ANY (player_ids))
          OR (a.target_type = 'guardian' AND a.target_id = ANY (guardian_ids))
          OR (a.target_type = 'session' AND a.target_id = ANY (session_ids))
          OR (a.target_type = 'document' AND a.target_id = ANY (document_ids)) AS in_scope) s
      WHERE a.actor_user_id = p_user OR s.in_scope)
  );
END $$;

REVOKE EXECUTE ON FUNCTION oz_data_export_request() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION oz_personal_data_export(uuid, text) FROM PUBLIC;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app')
     AND NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    RAISE EXCEPTION 'rôle oz_worker absent : appliquer Terraform avant cette migration';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    GRANT EXECUTE ON FUNCTION oz_data_export_request() TO oz_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_worker') THEN
    GRANT EXECUTE ON FUNCTION oz_personal_data_export(uuid, text) TO oz_worker;
  END IF;
  -- Privilège par défaut éventuel d'un fournisseur managé (D-038) : l'API n'assemble jamais.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app') THEN
    REVOKE EXECUTE ON FUNCTION oz_personal_data_export(uuid, text) FROM oz_app;
  END IF;
END $$;
