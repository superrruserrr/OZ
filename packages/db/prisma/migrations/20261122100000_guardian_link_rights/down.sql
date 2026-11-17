-- Retour arrière du lot 1.19a : publication d'un mineur et droits du tuteur de nouveau réservés au
-- tuteur vérifié (KYC 2). Définitions reprises telles quelles de leurs migrations d'origine.

CREATE OR REPLACE FUNCTION oz_player_published(player uuid, guardian uuid, status verification_status)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT status = 'verified' AND guardian IS NOT NULL AND EXISTS (
    SELECT 1 FROM guardians g JOIN consents c ON c.granted_by_guardian_id = g.id
    WHERE g.id = guardian AND g.deleted_at IS NULL AND g.verification_status = 'verified'
      AND c.player_id = player AND c.type = 'guardian_profile_publication'
      AND c.revoked_at IS NULL AND c.deleted_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION oz_player_set_visibility(p_player uuid, p_visibility jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  target players;
  minor boolean;
  result jsonb;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'visibilité : contexte utilisateur requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_visibility IS NULL OR jsonb_typeof(p_visibility) <> 'object' OR p_visibility = '{}'::jsonb THEN
    RAISE EXCEPTION 'visibilité : au moins un bloc attendu' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO target FROM players p WHERE p.id = p_player AND p.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  minor := oz_is_minor(target.birth_date);
  -- Même règle que CASL, redécidée ici : compte en état, rôle tenu, lien établi.
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
                 AND u.status IN ('pending_verification', 'active')) THEN
    RETURN NULL;
  END IF;
  IF NOT ((NOT minor AND target.user_id = me AND oz_has_verified_role(ARRAY['player']::role_kind[]))
          OR (minor AND oz_has_verified_role(ARRAY['guardian']::role_kind[]) AND EXISTS (
            SELECT 1 FROM guardians g
            WHERE g.id = target.guardian_id AND g.user_id = me AND g.deleted_at IS NULL
              AND g.verification_status = 'verified'))) THEN
    RETURN NULL;
  END IF;
  -- Clés et types vérifiés par la contrainte `players_visibility_blocks_check`.
  UPDATE players SET visibility = visibility || p_visibility, updated_by = me
    WHERE id = target.id RETURNING visibility INTO result;
  INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
  VALUES (me, 'player.visibility.updated', 'player', target.id,
    CASE WHEN minor THEN 'Visibilité réglée par le tuteur' ELSE 'Visibilité réglée par le titulaire' END,
    jsonb_build_object('blocks', p_visibility));
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION oz_personal_data_export(p_user uuid, p_key text)
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

CREATE OR REPLACE FUNCTION oz_guardian_child(p_oz_id text, me uuid) RETURNS players
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.* FROM players p JOIN guardians g ON g.id = p.guardian_id
    WHERE p.oz_id = p_oz_id AND p.deleted_at IS NULL AND oz_is_minor(p.birth_date)
      AND g.user_id = me AND g.deleted_at IS NULL AND g.verification_status = 'verified'
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = me AND u.deleted_at IS NULL
        AND u.status IN ('pending_verification', 'active'))
  FOR UPDATE OF p
$$;

CREATE OR REPLACE FUNCTION oz_player_deletion_status(p_oz_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := oz_current_user_id();
  found_request account_deletion_requests;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'suppression : compte requis' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.* INTO found_request FROM account_deletion_requests r
    JOIN players p ON p.id = r.player_id JOIN guardians g ON g.id = p.guardian_id
    WHERE p.oz_id = p_oz_id AND r.status = 'pending' AND oz_is_minor(p.birth_date)
      AND g.user_id = me AND g.deleted_at IS NULL AND g.verification_status = 'verified';
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('id', found_request.id, 'requestedAt', found_request.requested_at,
    'scheduledFor', found_request.scheduled_for);
END $$;

DROP FUNCTION oz_guardian_link_approved(verification_status);
