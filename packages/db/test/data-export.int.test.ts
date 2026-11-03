import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unclassifiedColumns } from '../src/anonymize/anonymize.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  latestDataExport,
  personalDataExport,
  requestDataExport,
  type PersonalDataExport,
} from '../src/data-export.js';
import { EXPORT_REGISTRY, EXPORT_SECTIONS, exportedFields } from '../src/export/registry.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  workerRoleUrl,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Export des données personnelles (lot 1.16ba, tâches 1 et 2, EX-118 n° 2) : assemblage par le
// worker (sections, exclusions D6, isolement, journal D5), demandes sous le contexte du demandeur (D3).

const KEY = 'k'.repeat(40);
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$U0FMVE1BUktFUg$SEFTSE1BUktFUg';
/** Valeurs qui ne doivent jamais sortir (D6, D1), quelle que soit leur forme. */
const SECRETS = {
  passwordHash: 'SEFTSE1BUktFUg',
  totpSecret: 'TOTPSECRETMARK',
  pendingTotpSecret: 'TOTPPENDINGMARK',
  refreshTokenHash: '1a'.repeat(32),
  authTokenHash: '2b'.repeat(32),
  recoveryCodeHash: '3c'.repeat(32),
  documentSha256: '4d'.repeat(32),
  deviceFingerprint: 'FINGERPRINTMARK',
  ocrExtract: 'OCREXTRACTMARK',
  documentNumberOnFile: 'DOCNUMONFILEMARK',
  perceptualHash: '123456789012345',
  kycChecks: 'KYCCHECKMARK',
  notificationError: 'PROVIDERERRORMARK',
  thirdPartyMetadata: 'ADMINMETAMARK',
  outOfScopeMetadata: 'GROWNVIEWMARK',
} as const;

let db: TestDatabase;
let app: AppConnection;
let worker: PrismaClient;
let api: PrismaClient;
const ids: Record<string, string> = {};
const id = (name: string): string => ids[name] ?? '';

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

const as = <T>(userId: string, fn: Parameters<typeof withUserContext<T>>[2]) =>
  withUserContext(api, userId, fn);

const exportOf = async (name: string): Promise<PersonalDataExport> => {
  const data = await personalDataExport(worker, id(name), KEY);
  if (data === null) throw new Error(`aucun export pour ${name}`);
  return data;
};
const section = (data: PersonalDataExport, name: string): Record<string, unknown>[] =>
  data[name] as Record<string, unknown>[];

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  worker = createDbClient(await workerRoleUrl(db));
  const apiUrl = new URL(db.url);
  apiUrl.username = 'oz_app_test';
  apiUrl.password = 'oz_app_test';
  api = createDbClient(apiUrl.toString());

  const user = async (email: string): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO users (email, email_verified_at, status) VALUES ($1, now(), 'active') RETURNING id`,
        [email],
      )
    ).id;
  ids.guardian = await user('tuteur@example.test');
  ids.otherGuardian = await user('autre-tuteur@example.test');
  ids.admin = await user('admin@example.test');
  ids.stranger = await user('inconnu@example.test');
  ids.requester = await user('demandeur@example.test');
  ids.suspended = await user('suspendu@example.test');
  ids.deleted = await user('supprime@example.test');
  await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [id('suspended')]);
  await db.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [id('deleted')]);

  // Compte complet : mot de passe, téléphone, 2FA active, codes de secours, jeton, session.
  await db.query(
    `UPDATE users SET password_hash = $2, phone_encrypted = oz_encrypt('+237690000009', $3),
       phone_hmac = oz_blind_index('+237690000009', $3), phone_verified_at = now(),
       totp_secret_encrypted = oz_encrypt($4, $3), totp_enabled_at = now(), totp_last_step = 42,
       totp_pending_secret_encrypted = oz_encrypt($5, $3)
     WHERE id = $1`,
    [id('guardian'), PASSWORD_HASH, KEY, SECRETS.totpSecret, SECRETS.pendingTotpSecret],
  );
  await db.query(`INSERT INTO auth_recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [
    id('guardian'),
    SECRETS.recoveryCodeHash,
  ]);
  await db.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, 'password_reset', $2, now() + interval '1 hour')`,
    [id('guardian'), SECRETS.authTokenHash],
  );
  await db.query(
    `INSERT INTO sessions (user_id, family_id, refresh_token_hash, user_agent, device_fingerprint, ip,
       expires_at)
     VALUES ($1, oz_uuid_v7(), $2, 'Navigateur synthétique', $3, '192.0.2.0/24', now() + interval '1 day')`,
    [id('guardian'), SECRETS.refreshTokenHash, SECRETS.deviceFingerprint],
  );
  const { id: org } = await one<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status, contact_email)
     VALUES ('academy', 'Académie synthétique', 'CM', 'verified', 'contact@academie.example.test')
     RETURNING id`,
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id)
     VALUES ($1, 'guardian', NULL), ($1, 'academy', $2), ($3, 'guardian', NULL), ($4, 'admin', NULL)`,
    [id('guardian'), org, id('otherGuardian'), id('admin')],
  );

  const guardianRow = async (userId: string, status: string): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country,
           verification_status, email_encrypted, email_hmac, document_number_encrypted,
           document_number_hmac)
         VALUES ($1, 'Tuteur', 'Synthétique', 'father', 'CM', $2::verification_status,
           oz_encrypt('tuteur.fiche@example.test', $3), oz_blind_index('tuteur.fiche@example.test', $3),
           oz_encrypt('TUTEURDOC1', $3), oz_blind_index('TUTEURDOC1', $3))
         RETURNING id`,
        [userId, status, KEY],
      )
    ).id;
  ids.verifiedLink = await guardianRow(id('guardian'), 'verified');
  ids.pendingLink = await guardianRow(id('guardian'), 'pending');
  ids.otherLink = await guardianRow(id('otherGuardian'), 'verified');

  const player = async (
    userId: string | null,
    birth: string,
    guardianId: string | null,
    documentNumber: string,
  ): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, city,
           verification_status, guardian_id, document_number_encrypted, document_number_hmac)
         VALUES ($1, 'Joueur', 'Synthétique', $2::date, 'CM', 'CM', 'Douala', 'verified', $3,
           oz_encrypt($4, $5), oz_blind_index($4, $5))
         RETURNING id`,
        [userId, birth, guardianId, documentNumber, KEY],
      )
    ).id;
  ids.ownProfile = await player(id('guardian'), '1985-02-03', null, 'JOUEURDOC1');
  ids.child = await player(null, '2013-04-05', id('verifiedLink'), 'ENFANTDOC1');
  ids.pendingChild = await player(null, '2014-04-05', id('pendingLink'), 'ENFANTDOC2');
  ids.otherChild = await player(null, '2012-04-05', id('otherLink'), 'AUTREDOC1');
  ids.grownChild = await player(null, '2000-04-05', id('verifiedLink'), 'MAJEURDOC1');

  await db.query(
    `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
     VALUES ('guardian_profile_publication', 'v1', $1, $2), ('guardian_profile_publication', 'v1', $3, $4)`,
    [id('child'), id('verifiedLink'), id('otherChild'), id('otherLink')],
  );
  // Consentements donnés hors de l'export : lien non vérifié, enfant devenu majeur.
  await db.query(
    `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
     VALUES ('guardian_data_processing', 'v1', $1, $2), ('guardian_data_processing', 'v1', $3, $4)`,
    [id('pendingChild'), id('pendingLink'), id('grownChild'), id('verifiedLink')],
  );
  await db.query(
    `INSERT INTO consents (type, text_version, granted_by_user_id) VALUES ('privacy_policy', 'v3', $1)`,
    [id('guardian')],
  );

  ids.document = (await one<{ id: string }>('SELECT oz_uuid_v7()::text AS id')).id;
  await db.query(
    `INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256,
         av_status, av_checked_at, ocr_extract_encrypted, document_number_encrypted,
         document_number_hmac, perceptual_hash, width, height, retention_until)
       VALUES ($8::uuid, 'birth_certificate', $1, $2, 'clean/' || $8, 'image/jpeg', 1024, $3, 'clean',
         now(), oz_encrypt($4, $6), oz_encrypt($5, $6), oz_blind_index($5, $6), $7::bigint, 800, 600,
         now() + interval '1 year')`,
    [
      id('child'),
      id('guardian'),
      SECRETS.documentSha256,
      SECRETS.ocrExtract,
      SECRETS.documentNumberOnFile,
      KEY,
      SECRETS.perceptualHash,
      id('document'),
    ],
  );
  await db.query(
    `INSERT INTO documents (type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256,
       retention_until)
     VALUES ('photo', $1, $2, 'incoming/' || oz_uuid_v7(), 'image/jpeg', 10, $3, now() + interval '1 year')`,
    [id('otherChild'), id('otherGuardian'), '5e'.repeat(32)],
  );
  await db.query(
    `INSERT INTO kyc_cases (player_id, level, status, checks, submitted_at, decided_by, decided_at,
       decision_reason)
     VALUES ($1, 2, 'rejected', jsonb_build_array(jsonb_build_object('note', $2::text)), now(), $3, now(),
       'Pièce illisible')`,
    [id('child'), SECRETS.kycChecks, id('admin')],
  );
  await db.query(
    `INSERT INTO notifications (recipient_user_id, channel, template, payload, status, last_error)
     VALUES ($1, 'email', 'auth.password_reset', jsonb_build_object('player_id', $2::text), 'failed', $3),
       ($4, 'email', 'auth.password_reset', '{}', 'queued', NULL)`,
    [id('guardian'), id('child'), SECRETS.notificationError, id('otherGuardian')],
  );

  // Journal : acteur lui-même, administrateur tiers sur l'enfant, entrée sans rapport.
  const audit = async (
    actor: string | null,
    action: string,
    targetType: string,
    target: string,
    metadata: object,
  ): Promise<void> => {
    await db.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, metadata)
       VALUES ($1, $2, $3, $4, 'Synthétique', $5::jsonb)`,
      [actor, action, targetType, target, JSON.stringify(metadata)],
    );
  };
  await audit(id('guardian'), 'player.visibility.updated', 'player', id('child'), {
    blocks: { physical: false },
  });
  await audit(id('admin'), 'player.profile.viewed', 'player', id('child'), {
    note: SECRETS.thirdPartyMetadata,
  });
  await audit(null, 'document.file.purged', 'document', id('document'), {});
  // Acteur lui-même sur la fiche d'autrui : ni l'identifiant, ni les métadonnées.
  await audit(id('guardian'), 'player.profile.viewed', 'player', id('grownChild'), {
    view: SECRETS.outOfScopeMetadata,
  });
  await audit(id('admin'), 'player.profile.viewed', 'player', id('otherChild'), {});
  await audit(id('otherGuardian'), 'player.visibility.updated', 'player', id('otherChild'), {});
}, 240_000);

afterAll(async () => {
  await worker.$disconnect();
  await api.$disconnect();
  await app.end();
  await db.stop();
});

describe('oz_personal_data_export', () => {
  it('le registre d’export classe toutes les colonnes de la base migrée', async () => {
    expect(await unclassifiedColumns(db.url, EXPORT_REGISTRY)).toEqual([]);
  });

  it('sections du compte, profil propre et enfants mineurs dont il est le tuteur vérifié (D4)', async () => {
    const data = await exportOf('guardian');
    expect(data.formatVersion).toBe(1);
    expect(data.account).toMatchObject({
      id: id('guardian'),
      email: 'tuteur@example.test',
      phone: '+237690000009',
      status: 'active',
    });
    expect(data.account.twoFactorEnabledAt).not.toBeNull();
    expect(
      section(data, 'roles')
        .map((r) => [r.role, r.organizationName])
        .sort(),
    ).toEqual([
      ['academy', 'Académie synthétique'],
      ['guardian', null],
    ]);
    expect(section(data, 'sessions')).toEqual([
      expect.objectContaining({ userAgent: 'Navigateur synthétique', ip: '192.0.2.0' }),
    ]);
    const players = section(data, 'players');
    expect(players.map((p) => [p.id, p.relation])).toEqual([
      [id('ownProfile'), 'self'],
      [id('child'), 'child'],
    ]);
    expect(players.map((p) => p.documentNumber)).toEqual(['JOUEURDOC1', 'ENFANTDOC1']);
    expect(section(data, 'guardians').map((g) => [g.id, g.email, g.verificationStatus])).toEqual([
      [id('verifiedLink'), 'tuteur.fiche@example.test', 'verified'],
      [id('pendingLink'), 'tuteur.fiche@example.test', 'pending'],
    ]);
    expect(section(data, 'consents').map((c) => [c.type, c.playerId, c.grantedBy])).toEqual([
      ['guardian_profile_publication', id('child'), 'self'],
      ['privacy_policy', null, 'self'],
    ]);
    expect(section(data, 'documents')).toEqual([
      expect.objectContaining({ id: id('document'), type: 'birth_certificate', status: 'clean' }),
    ]);
    expect(section(data, 'kycCases')).toEqual([
      expect.objectContaining({
        playerId: id('child'),
        status: 'rejected',
        decisionReason: 'Pièce illisible',
      }),
    ]);
    expect(section(data, 'notifications')).toEqual([
      expect.objectContaining({
        template: 'auth.password_reset',
        payload: { player_id: id('child') },
      }),
    ]);
  });

  it('aucun secret, empreinte, index aveugle ni clé de stockage (D6) ; contenu des pièces absent (D1)', async () => {
    const json = JSON.stringify(await exportOf('guardian'));
    for (const [name, value] of Object.entries(SECRETS)) {
      expect(json.includes(value), name).toBe(false);
    }
    const stored = await db.query<{ value: string }>(
      `SELECT encode(phone_hmac, 'hex') AS value FROM users WHERE id = $1
       UNION ALL SELECT encode(document_number_hmac, 'hex') FROM players WHERE id = ANY ($2)
       UNION ALL SELECT encode(email_hmac, 'hex') FROM guardians WHERE user_id = $1
       UNION ALL SELECT encode(document_number_hmac, 'hex') FROM guardians WHERE user_id = $1
       UNION ALL SELECT encode(document_number_hmac, 'hex') FROM documents WHERE id = $3
       UNION ALL SELECT storage_key FROM documents WHERE id = $3
       UNION ALL SELECT family_id::text FROM sessions WHERE user_id = $1`,
      [id('guardian'), [id('ownProfile'), id('child')], id('document')],
    );
    expect(stored.length).toBe(10);
    for (const { value } of stored) expect(json.includes(value), value).toBe(false);
  });

  it('les champs de chaque section correspondent exactement au registre', async () => {
    const data = await exportOf('guardian');
    expect(Object.keys(data).sort()).toEqual(
      ['formatVersion', 'generatedAt', ...EXPORT_SECTIONS].sort(),
    );
    const expected = exportedFields();
    expect(Object.keys(data.account).sort()).toEqual(expected.account);
    for (const name of EXPORT_SECTIONS.filter((s) => s !== 'account')) {
      const rows = section(data, name);
      expect(rows.length, name).toBeGreaterThan(0);
      for (const row of rows) expect(Object.keys(row).sort(), name).toEqual(expected[name]);
    }
  });

  it('aucun autre utilisateur : enfant d’un autre tuteur, lien non vérifié, enfant majeur absents', async () => {
    const json = JSON.stringify(await exportOf('guardian'));
    for (const other of [
      'otherGuardian',
      'otherLink',
      'otherChild',
      'pendingChild',
      'grownChild',
      'admin',
      'stranger',
    ]) {
      expect(json.includes(id(other)), other).toBe(false);
    }
    expect(json).not.toContain('AUTREDOC1');
    expect(json).not.toContain('contact@academie.example.test');
  });

  it('journal (D5) : acteur tiers rendu par son rôle, sans ses métadonnées ; entrées sans rapport absentes', async () => {
    const log = section(await exportOf('guardian'), 'auditLog');
    expect(log.map((e) => [e.actor, e.action, e.targetId, e.metadata])).toEqual([
      ['self', 'player.visibility.updated', id('child'), { blocks: { physical: false } }],
      ['admin', 'player.profile.viewed', id('child'), null],
      ['system', 'document.file.purged', id('document'), null],
      ['self', 'player.profile.viewed', null, null],
    ]);
  });

  it('compte supprimé, inconnu ou identifiant mal formé : null', async () => {
    expect(await personalDataExport(worker, id('deleted'), KEY)).toBeNull();
    expect(
      await personalDataExport(worker, '00000000-0000-7000-8000-000000000000', KEY),
    ).toBeNull();
    expect(await personalDataExport(worker, "x' OR 1=1 --", KEY)).toBeNull();
  });

  it('réservée au worker : l’API (`oz_app`) ne peut pas l’exécuter', async () => {
    await expect(
      app.as(id('guardian'), (c) =>
        c.query('SELECT oz_personal_data_export($1::uuid, $2)', [id('guardian'), KEY]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      as(id('guardian'), (tx) => personalDataExport(tx, id('guardian'), KEY)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('demandes d’export', () => {
  const requestsOf = (userId: string) =>
    db.query<{ status: string }>(`SELECT status FROM data_export_requests WHERE user_id = $1`, [
      userId,
    ]);

  it('refusée sans contexte, pour un compte suspendu ou supprimé', async () => {
    await expect(app.as(null, (c) => c.query('SELECT oz_data_export_request()'))).rejects.toThrow(
      /compte requis/,
    );
    for (const name of ['suspended', 'deleted']) {
      expect(await as(id(name), (tx) => requestDataExport(tx)), name).toEqual({
        outcome: 'refused',
      });
    }
    expect(await requestsOf(id('suspended'))).toEqual([]);
  });

  it('acceptée et auditée ; refus `active` tant qu’elle est en cours ; `too_soon` pendant 24 heures', async () => {
    const accepted = await as(id('requester'), (tx) => requestDataExport(tx));
    expect(accepted).toMatchObject({ outcome: 'accepted' });
    const audit = await db.query<{ actor_user_id: string; target_id: string }>(
      `SELECT actor_user_id::text, target_id::text FROM audit_log WHERE action = 'data.export.requested'`,
    );
    expect(audit).toEqual([{ actor_user_id: id('requester'), target_id: id('requester') }]);

    expect(await as(id('requester'), (tx) => requestDataExport(tx))).toEqual({ outcome: 'active' });
    await db.query(
      `UPDATE data_export_requests SET status = 'ready', storage_key = 'exports/x', ready_at = now(),
         expires_at = now() + interval '7 days' WHERE user_id = $1`,
      [id('requester')],
    );
    expect(await as(id('requester'), (tx) => requestDataExport(tx))).toEqual({ outcome: 'active' });

    await db.query(`UPDATE data_export_requests SET status = 'expired' WHERE user_id = $1`, [
      id('requester'),
    ]);
    const tooSoon = await as(id('requester'), (tx) => requestDataExport(tx));
    if (tooSoon.outcome !== 'too_soon' || accepted.outcome !== 'accepted') {
      throw new Error(`issue inattendue : ${tooSoon.outcome}`);
    }
    expect(tooSoon.nextRequestAt.getTime() - accepted.requestedAt.getTime()).toBe(24 * 3600 * 1000);

    await db.query(
      `UPDATE data_export_requests SET requested_at = requested_at - interval '25 hours' WHERE user_id = $1`,
      [id('requester')],
    );
    expect(await as(id('requester'), (tx) => requestDataExport(tx))).toMatchObject({
      outcome: 'accepted',
    });
    expect((await requestsOf(id('requester'))).map((r) => r.status).sort()).toEqual([
      'expired',
      'pending',
    ]);
  });

  it('suivi : sa dernière demande seulement ; écriture directe refusée sous contexte utilisateur', async () => {
    const latest = await as(id('requester'), (tx) => latestDataExport(tx));
    expect(latest).toMatchObject({ status: 'pending', readyAt: null, expiresAt: null });
    expect(await as(id('stranger'), (tx) => latestDataExport(tx))).toBeNull();
    expect(
      await app.as(
        id('stranger'),
        async (c) => (await c.query<{ id: string }>('SELECT id FROM data_export_requests')).rows,
      ),
    ).toEqual([]);
    await expect(
      app.as(id('stranger'), (c) =>
        c.query('INSERT INTO data_export_requests (user_id) VALUES ($1)', [id('stranger')]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      app.as(id('requester'), (c) =>
        c.query(`UPDATE data_export_requests SET status = 'ready' RETURNING id`),
      ),
    ).resolves.toMatchObject({ rowCount: 0 });
  });

  it('un export en échec ne retient pas la personne 24 heures', async () => {
    await as(id('admin'), (tx) => requestDataExport(tx));
    await db.query(
      `UPDATE data_export_requests SET status = 'failed', failure_reason = 'archive' WHERE user_id = $1`,
      [id('admin')],
    );
    expect(await as(id('admin'), (tx) => requestDataExport(tx))).toMatchObject({
      outcome: 'accepted',
    });
  });

  it('contraintes : archive prête sans clé, échec sans motif refusés', async () => {
    await expect(
      db.query(
        `INSERT INTO data_export_requests (user_id, status, requested_at) VALUES ($1, 'ready', now() - interval '3 days')`,
        [id('stranger')],
      ),
    ).rejects.toThrow(/data_export_requests_ready_check/);
    await expect(
      db.query(`INSERT INTO data_export_requests (user_id, status) VALUES ($1, 'failed')`, [
        id('stranger'),
      ]),
    ).rejects.toThrow(/data_export_requests_failed_check/);
  });
});
