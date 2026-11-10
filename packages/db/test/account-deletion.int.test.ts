import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import {
  anonymizeAccount,
  cancelAccountDeletion,
  cancelPlayerDeletion,
  dueAccountDeletions,
  pendingAccountDeletion,
  pendingPlayerDeletion,
  requestAccountDeletion,
  requestPlayerDeletion,
} from '../src/account-deletion.js';
import { unclassifiedColumns } from '../src/anonymize/anonymize.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { ERASURE_REGISTRY } from '../src/erasure/registry.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  workerRoleUrl,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Suppression de compte (lot 1.16ca, tâches 2 et 4, EX-118 n° 3) : demande, rétractation,
// annulation, droits, puis preuve qu'aucune donnée d'origine ne subsiste après l'anonymisation.

const KEY = 'k'.repeat(40);
const PASSWORD_HASH = '$argon2id$v=19$m=65536,t=3,p=4$U0FMVE1BUktFUg$SEFTSE1BUktFUg';
/** Valeurs du compte supprimé : aucune ne doit subsister, en clair ou chiffrée. */
const MARKERS = {
  email: 'efface@example.test',
  phone: '+237690001111',
  passwordHash: 'SEFTSE1BUktFUg',
  totp: 'TOTPMARQUEUR',
  firstName: 'Zephirinmarqueur',
  lastName: 'Nommarqueur',
  birthDate: '1990-07-15',
  city: 'Villemarqueur',
  playerDocument: 'JOUEURDOCMARQUEUR',
  userAgent: 'AgentMarqueur',
  ip: '198.51.100.0/24',
  fingerprint: 'EMPREINTEMARQUEUR',
  guardianFirstName: 'Tuteurmarqueur',
  guardianEmail: 'tuteurmarqueur@example.test',
  guardianDocument: 'TUTEURDOCMARQUEUR',
  ocr: 'OCRMARQUEUR',
  documentNumber: 'PIECEMARQUEUR',
  kycCheck: 'KYCMARQUEUR',
  decisionReason: 'Motifmarqueur',
  sendError: 'ERREURMARQUEUR',
  savedSearchName: 'Sauvegardemarqueur',
  savedSearchText: 'Textemarqueur',
} as const;
const OTHER = 'Autremarqueur';

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
const user = async (email: string): Promise<string> =>
  (
    await one<{ id: string }>(
      `INSERT INTO users (email, email_verified_at, status) VALUES ($1, now(), 'active') RETURNING id`,
      [email],
    )
  ).id;
/** Échéance passée : la rétractation est simulée en reculant les dates. */
const makeDue = (requestId: string) =>
  db.query(
    `UPDATE account_deletion_requests SET requested_at = now() - interval '31 days',
       scheduled_for = now() - interval '1 day' WHERE id = $1`,
    [requestId],
  );
const accepted = async (userId: string): Promise<string> => {
  const outcome = await as(userId, (tx) => requestAccountDeletion(tx));
  if (outcome.outcome !== 'accepted') throw new Error(`issue inattendue : ${outcome.outcome}`);
  return outcome.id;
};

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  worker = createDbClient(await workerRoleUrl(db));
  const apiUrl = new URL(db.url);
  apiUrl.username = 'oz_app_test';
  apiUrl.password = 'oz_app_test';
  api = createDbClient(apiUrl.toString());
}, 240_000);

afterAll(async () => {
  await worker.$disconnect();
  await api.$disconnect();
  await app.end();
  await db.stop();
});

describe('registre', () => {
  it('chaque colonne de la base migrée est classée', async () => {
    const registry = Object.fromEntries(
      Object.entries(ERASURE_REGISTRY).map(([table, { columns }]) => [table, columns]),
    );
    expect(await unclassifiedColumns(db.url, registry)).toEqual([]);
  });
});

describe('demande, rétractation, annulation', () => {
  it('acceptée à +30 jours, sessions révoquées, auditée ; seconde demande : `pending`', async () => {
    const owner = await user('demande@example.test');
    await db.query(
      `INSERT INTO sessions (user_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, oz_uuid_v7(), $2, now() + interval '1 day')`,
      [owner, '7a'.repeat(32)],
    );
    const outcome = await as(owner, (tx) => requestAccountDeletion(tx));
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    const days = (outcome.scheduledFor.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(
      await db.query(`SELECT revoked_reason FROM sessions WHERE user_id = $1`, [owner]),
    ).toEqual([{ revoked_reason: 'account_deleted' }]);
    expect(await as(owner, (tx) => requestAccountDeletion(tx))).toEqual({
      outcome: 'pending',
      scheduledFor: outcome.scheduledFor,
    });
    expect(await as(owner, (tx) => pendingAccountDeletion(tx))).toMatchObject({
      id: outcome.id,
      scheduledFor: outcome.scheduledFor,
    });
    expect(
      await db.query(
        `SELECT actor_user_id::text AS actor, metadata->>'request_id' AS request FROM audit_log
         WHERE action = 'account.deletion.requested' AND target_id = $1`,
        [owner],
      ),
    ).toEqual([{ actor: owner, request: outcome.id }]);
  });

  it('annulée : plus d’anonymisation ; nouvelle demande possible ; autrui ne lit rien', async () => {
    const owner = await user('annule@example.test');
    const other = await user('voisin@example.test');
    const requestId = await accepted(owner);
    expect(await as(other, (tx) => pendingAccountDeletion(tx))).toBeNull();
    expect(await as(other, (tx) => cancelAccountDeletion(tx))).toBe(false);
    expect(await as(owner, (tx) => cancelAccountDeletion(tx))).toBe(true);
    expect(await as(owner, (tx) => cancelAccountDeletion(tx))).toBe(false);
    await makeDue(requestId);
    expect(await anonymizeAccount(worker, requestId)).toBe('cancelled');
    expect(await as(owner, (tx) => pendingAccountDeletion(tx))).toBeNull();
    expect(await as(owner, (tx) => requestAccountDeletion(tx))).toMatchObject({
      outcome: 'accepted',
    });
    expect(
      await db.query(
        `SELECT 1 FROM audit_log WHERE action = 'account.deletion.cancelled' AND target_id = $1`,
        [owner],
      ),
    ).toHaveLength(1);
  });

  it('compte suspendu : refusée ; sans contexte : levée', async () => {
    const owner = await user('suspendu@example.test');
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [owner]);
    expect(await as(owner, (tx) => requestAccountDeletion(tx))).toEqual({ outcome: 'refused' });
    await expect(
      app.as(null, (c) => c.query('SELECT oz_account_deletion_request()')),
    ).rejects.toThrow(/compte requis/);
  });

  it('avant l’échéance : `not_due`, absente des échues ; inconnue : `unknown`', async () => {
    const requestId = await accepted(await user('patience@example.test'));
    expect(await anonymizeAccount(worker, requestId)).toBe('not_due');
    expect(await dueAccountDeletions(worker, 500)).not.toContain(requestId);
    expect(await anonymizeAccount(worker, 'pas-un-uuid')).toBe('unknown');
    expect(await anonymizeAccount(worker, '00000000-0000-4000-8000-000000000000')).toBe('unknown');
    await expect(dueAccountDeletions(worker, 0)).rejects.toThrow(/lot/);
  });

  it('anonymisation refusée à oz_app et sous un contexte utilisateur', async () => {
    const owner = await user('droits@example.test');
    const requestId = await accepted(owner);
    for (const sql of [
      `SELECT oz_account_anonymize('${requestId}')`,
      `SELECT * FROM oz_account_deletion_due(1)`,
    ]) {
      await expect(
        app.as(owner, (c) => c.query(sql)),
        sql,
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      worker.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('oz.user_id', ${owner}, true)`;
        return anonymizeAccount(tx, requestId);
      }),
    ).rejects.toThrow(/réservé au worker/);
  });
});

describe('preuve d’anonymisation', () => {
  beforeAll(async () => {
    ids.admin = await user('admin@example.test');
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [id('admin')]);
    ids.subject = await user(MARKERS.email);
    ids.other = await user('autre.compte@example.test');
    await db.query(
      `UPDATE users SET password_hash = $2, phone_encrypted = oz_encrypt($3, $4),
         phone_hmac = oz_blind_index($3, $4), phone_verified_at = now(),
         totp_secret_encrypted = oz_encrypt($5, $4), totp_enabled_at = now(), totp_last_step = 7,
         last_seen_at = now()
       WHERE id = $1`,
      [id('subject'), PASSWORD_HASH, MARKERS.phone, KEY, MARKERS.totp],
    );
    await db.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'player'), ($1, 'guardian')`,
      [id('subject')],
    );
    await db.query(
      `INSERT INTO sessions (user_id, family_id, refresh_token_hash, user_agent, device_fingerprint, ip,
         expires_at)
       VALUES ($1, oz_uuid_v7(), $2, $3, $4, $5, now() + interval '1 day')`,
      [id('subject'), '8b'.repeat(32), MARKERS.userAgent, MARKERS.fingerprint, MARKERS.ip],
    );
    await db.query(
      `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
       VALUES ($1, 'password_reset', $2, now() + interval '1 hour')`,
      [id('subject'), '9c'.repeat(32)],
    );
    await db.query(`INSERT INTO auth_recovery_codes (user_id, code_hash) VALUES ($1, $2)`, [
      id('subject'),
      'ad'.repeat(32),
    ]);

    const player = async (userId: string | null, values: (string | null)[]): Promise<string> =>
      (
        await one<{ id: string }>(
          `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
             region, city, primary_position, verification_status, guardian_id,
             document_number_encrypted, document_number_hmac, phone_encrypted, phone_hmac)
           VALUES ($1, $2, $3, $4::date, 'CM', 'CM', 'Littoral', $5, 'winger', 'verified',
             $6::uuid, oz_encrypt($7, $9), oz_blind_index($7, $9), oz_encrypt($8, $9),
             oz_blind_index($8, $9))
           RETURNING id`,
          [userId, ...values, KEY],
        )
      ).id;
    ids.subjectPlayer = await player(id('subject'), [
      MARKERS.firstName,
      MARKERS.lastName,
      MARKERS.birthDate,
      MARKERS.city,
      null,
      MARKERS.playerDocument,
      MARKERS.phone,
    ]);
    ids.otherPlayer = await player(id('other'), [
      OTHER,
      OTHER,
      '1992-03-04',
      OTHER,
      null,
      'AUTREDOC',
      '+237690002222',
    ]);
    ids.ozId = await app.as(id('admin'), async (c) => {
      const { rows } = await c.query<{ oz_id: string }>('SELECT oz_issue_oz_id($1, $2) AS oz_id', [
        id('subjectPlayer'),
        '000001',
      ]);
      return rows[0]?.oz_id ?? '';
    });

    ids.guardianRow = (
      await one<{ id: string }>(
        `INSERT INTO guardians (user_id, first_name, last_name, relationship, country,
           verification_status, email_encrypted, email_hmac, document_number_encrypted,
           document_number_hmac)
         VALUES ($1, $2, $2, 'mother', 'CM', 'verified', oz_encrypt($3, $5), oz_blind_index($3, $5),
           oz_encrypt($4, $5), oz_blind_index($4, $5))
         RETURNING id`,
        [
          id('subject'),
          MARKERS.guardianFirstName,
          MARKERS.guardianEmail,
          MARKERS.guardianDocument,
          KEY,
        ],
      )
    ).id;
    ids.child = await player(null, [
      'Enfant',
      'Conserve',
      '2013-04-05',
      'Kribi',
      id('guardianRow'),
      'ENFANTDOC',
      '+237690003333',
    ]);
    await db.query(
      `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
       VALUES ('guardian_profile_publication', 'v1', $1, $2)`,
      [id('child'), id('guardianRow')],
    );

    ids.document = (await one<{ id: string }>('SELECT oz_uuid_v7()::text AS id')).id;
    await db.query(
      `INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes,
           sha256, av_status, av_checked_at, ocr_extract_encrypted, document_number_encrypted,
           document_number_hmac, perceptual_hash, width, height, retention_until)
         VALUES ($1::uuid, 'identity_document', $2, $3, 'clean/' || $1, 'image/jpeg', 1024, $4, 'clean',
           now(), oz_encrypt($5, $7), oz_encrypt($6, $7), oz_blind_index($6, $7), 123456789, 800,
           600, now() + interval '1 year')`,
      [
        id('document'),
        id('subjectPlayer'),
        id('subject'),
        'ef'.repeat(32),
        MARKERS.ocr,
        MARKERS.documentNumber,
        KEY,
      ],
    );
    await db.query(
      `INSERT INTO kyc_cases (player_id, level, status, checks, submitted_at, decided_by, decided_at,
         decision_reason)
       VALUES ($1, 2, 'rejected', jsonb_build_array(jsonb_build_object('note', $2::text)), now(), $3,
         now(), $4)`,
      [id('subjectPlayer'), MARKERS.kycCheck, id('admin'), MARKERS.decisionReason],
    );
    await db.query(
      `INSERT INTO notifications (recipient_user_id, channel, template, payload, status, last_error)
       VALUES ($1, 'email', 'auth.password_reset', jsonb_build_object('player_id', $2::text), 'failed', $3)`,
      [id('subject'), id('subjectPlayer'), MARKERS.sendError],
    );
    // Lot 1.14b : un nom de sauvegarde ou un texte libre peut nommer quelqu'un.
    await db.query(
      `INSERT INTO saved_searches (user_id, name, criteria, sort)
       VALUES ($1, $2, jsonb_build_object('q', $3::text), 'relevance')`,
      [id('subject'), MARKERS.savedSearchName, MARKERS.savedSearchText],
    );
    ids.exportReady = (
      await one<{ id: string }>(
        `INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id::text`,
        [id('subject')],
      )
    ).id;
    await db.query(
      `UPDATE data_export_requests SET status = 'ready', storage_key = 'exports/' || id || '.json',
         ready_at = now() - interval '1 hour', expires_at = now() + interval '7 days' WHERE id = $1`,
      [id('exportReady')],
    );
    await db.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
       VALUES ($1, 'player.profile.viewed', 'player', $2, 'Synthétique')`,
      [id('subject'), id('otherPlayer')],
    );

    ids.request = await accepted(id('subject'));
    await makeDue(id('request'));
  }, 120_000);

  /** Toutes les valeurs de toutes les tables, déchiffrées quand une colonne est chiffrée. */
  const everything = async (): Promise<string> => {
    const tables = Object.keys(ERASURE_REGISTRY);
    const parts: string[] = [];
    for (const table of tables) {
      const rows = await db.query<{ row: string }>(
        `SELECT row_to_json(t)::text AS row FROM "${table}" t`,
      );
      parts.push(...rows.map((r) => r.row));
      for (const column of Object.keys(ERASURE_REGISTRY[table]?.columns ?? {})) {
        if (!column.endsWith('_encrypted')) continue;
        const plain = await db.query<{ v: string | null }>(
          `SELECT oz_decrypt("${column}", $1) AS v FROM "${table}" WHERE "${column}" IS NOT NULL`,
          [KEY],
        );
        parts.push(...plain.map((r) => r.v ?? ''));
      }
    }
    return parts.join('\n');
  };

  it('avant : les marqueurs sont bien présents (la preuve n’est pas vacante)', async () => {
    const all = await everything();
    for (const [name, value] of Object.entries(MARKERS)) expect(all, name).toContain(value);
  });

  it('échue : anonymisée une fois, rejouée sans effet, auditée', async () => {
    expect(await dueAccountDeletions(worker, 500)).toContain(id('request'));
    expect(await anonymizeAccount(worker, id('request'))).toBe('done');
    expect(await anonymizeAccount(worker, id('request'))).toBe('done');
    expect(await dueAccountDeletions(worker, 500)).not.toContain(id('request'));
    expect(
      await db.query(
        `SELECT actor_user_id, metadata->>'request_id' AS request FROM audit_log
         WHERE action = 'account.deletion.done' AND target_id = $1`,
        [id('subject')],
      ),
    ).toEqual([{ actor_user_id: null, request: id('request') }]);
  });

  it('aucun marqueur d’origine dans aucune table, en clair ou déchiffré', async () => {
    const all = await everything();
    for (const [name, value] of Object.entries(MARKERS)) expect(all, name).not.toContain(value);
  });

  it('agrégats, OZ ID et preuves conservés ; autres comptes intacts', async () => {
    expect(
      await one(
        `SELECT oz_id, birth_date::text AS birth, country, region, primary_position::text AS position,
           deleted_at IS NOT NULL AS gone
         FROM players WHERE id = $1`,
        [id('subjectPlayer')],
      ),
    ).toEqual({
      oz_id: id('ozId'),
      birth: '1990-01-01',
      country: 'CM',
      region: 'Littoral',
      position: 'winger',
      gone: true,
    });
    expect(
      await db.query(`SELECT player_id::text FROM oz_id_registry WHERE oz_id = $1`, [id('ozId')]),
    ).toEqual([{ player_id: id('subjectPlayer') }]);
    expect(
      await one(`SELECT status, deleted_at IS NOT NULL AS gone FROM users WHERE id = $1`, [
        id('subject'),
      ]),
    ).toEqual({ status: 'closed', gone: true });
    expect(
      await db.query(`SELECT 1 FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL`, [
        id('subject'),
      ]),
    ).toEqual([]);
    expect(
      await one(`SELECT retention_until <= now() AS due FROM documents WHERE id = $1`, [
        id('document'),
      ]),
    ).toEqual({ due: true });
    expect(
      await one(
        `SELECT status, expires_at <= now() AS due FROM data_export_requests WHERE id = $1`,
        [id('exportReady')],
      ),
    ).toEqual({ status: 'ready', due: true });
    expect(
      await db.query(
        `SELECT 1 FROM sessions WHERE user_id = $1 AND revoked_at IS NULL
         UNION ALL SELECT 1 FROM auth_tokens WHERE user_id = $1 AND consumed_at IS NULL
         UNION ALL SELECT 1 FROM auth_recovery_codes WHERE user_id = $1 AND consumed_at IS NULL`,
        [id('subject')],
      ),
    ).toEqual([]);
    expect(
      await db.query(
        `SELECT status, checks, decision_reason, decided_by::text FROM kyc_cases WHERE player_id = $1`,
        [id('subjectPlayer')],
      ),
    ).toEqual([
      { status: 'rejected', checks: [], decision_reason: 'Motif effacé', decided_by: id('admin') },
    ]);
    // Le drapeau seul n'ouvre rien : hors du chemin privilégié, ou sur une fiche encore en place,
    // la décision reste figée, même réduite exactement comme l'anonymisation la réduit.
    await db.query(
      `INSERT INTO kyc_cases (player_id, level, status, checks, submitted_at, decided_by,
         decided_at, decision_reason)
       VALUES ($1, 2, 'rejected', '[{"note": "x"}]', now(), $2, now(), 'Pièce illisible')`,
      [id('otherPlayer'), id('admin')],
    );
    const flagged = new pg.Client({ connectionString: db.url });
    await flagged.connect();
    try {
      await flagged.query('BEGIN');
      await flagged.query(`SELECT set_config('oz.account_erasure', 'on', true)`);
      await expect(
        flagged.query(
          `UPDATE kyc_cases SET checks = '[]', decision_reason = 'Motif effacé' WHERE player_id = $1`,
          [id('otherPlayer')],
        ),
      ).rejects.toThrow(/décision KYC définitive/);
    } finally {
      await flagged.query('ROLLBACK');
      await flagged.end();
    }
    expect(
      await db.query(`SELECT payload FROM notifications WHERE recipient_user_id = $1`, [
        id('subject'),
      ]),
    ).toEqual([{ payload: {} }]);
    expect(await everything()).toContain(OTHER);
    expect(await one(`SELECT oz_audit_verify_chain() AS defect`)).toEqual({ defect: null });
  });

  it('enfant conservé, sans tuteur vérifié : plus publié ; consentement gardé comme preuve', async () => {
    expect(
      await one(
        `SELECT first_name, deleted_at IS NULL AS live,
           oz_player_published(p.id, p.guardian_id, p.verification_status) AS published
         FROM players p WHERE id = $1`,
        [id('child')],
      ),
    ).toEqual({ first_name: 'Enfant', live: true, published: false });
    expect(
      await db.query(`SELECT text_version FROM consents WHERE player_id = $1`, [id('child')]),
    ).toEqual([{ text_version: 'v1' }]);
  });
});

describe('sous un propriétaire soumis à la RLS (recette, production)', () => {
  it('chaque table effacée l’est vraiment : aucune écriture à 0 ligne silencieuse', async () => {
    const owner = await user('proprietaire@example.test');
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'guardian')`, [owner]);
    const guardian = await one<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country,
         verification_status, email_encrypted, email_hmac)
       VALUES ($1, 'Rlsmarqueur', 'Rlsmarqueur', 'father', 'CM', 'verified',
         oz_encrypt('rls@example.test', $2), oz_blind_index('rls@example.test', $2))
       RETURNING id`,
      [owner, KEY],
    );
    const player = await one<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
         verification_status)
       VALUES ($1, 'Rlsmarqueur', 'Rlsmarqueur', '1991-05-06', 'CM', 'CM', 'verified') RETURNING id`,
      [owner],
    );
    await db.query(
      `INSERT INTO kyc_cases (player_id, level, status, checks, submitted_at, decided_by,
         decided_at, decision_reason)
       VALUES ($1, 2, 'rejected', '[{"note": "Rlsmarqueur"}]', now(), $2, now(), 'Rlsmarqueur')`,
      [player.id, id('admin')],
    );
    await db.query(
      `INSERT INTO notifications (recipient_user_id, channel, template, payload, status)
       VALUES ($1, 'email', 'auth.password_reset', jsonb_build_object('player_id', $2::text),
         'queued')`,
      [owner, player.id],
    );
    const requestId = await accepted(owner);
    await makeDue(requestId);

    const workerUser = decodeURIComponent(new URL(await workerRoleUrl(db)).username);
    const client = new pg.Client({ connectionString: db.url });
    await client.connect();
    try {
      // Comme oz_migrator en recette ; tout est annulé à la fin de la transaction.
      await client.query('BEGIN');
      await client.query(`SET LOCAL lock_timeout = '10s'`);
      await client.query('CREATE ROLE oz_erasure_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS');
      await client.query('GRANT oz_erasure_owner_test TO CURRENT_USER');
      await client.query('GRANT ALL ON ALL TABLES IN SCHEMA public TO oz_erasure_owner_test');
      await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO oz_erasure_owner_test');
      await client.query(
        'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO oz_erasure_owner_test',
      );
      await client.query(
        'ALTER FUNCTION oz_account_anonymize(uuid) OWNER TO oz_erasure_owner_test',
      );
      // Appel par le worker : ni superutilisateur ni membre du rôle propriétaire.
      await client.query(`SET LOCAL SESSION AUTHORIZATION "${workerUser}"`);
      const { rows } = await client.query<{ outcome: string }>(
        'SELECT oz_account_anonymize($1::uuid) AS outcome',
        [requestId],
      );
      await client.query('RESET SESSION AUTHORIZATION');
      expect(rows[0]?.outcome).toBe('done');
      const check = async (sql: string): Promise<unknown[]> =>
        (await client.query<Record<string, unknown>>(sql, [owner])).rows;
      expect(
        await check(`SELECT 1 FROM user_roles WHERE user_id = $1 AND deleted_at IS NULL`),
      ).toEqual([]);
      expect(
        await check(
          `SELECT first_name, email_encrypted IS NULL AS erased, deleted_at IS NOT NULL AS gone
           FROM guardians WHERE user_id = $1`,
        ),
      ).toEqual([{ first_name: 'Anonyme', erased: true, gone: true }]);
      expect(
        await check(
          `SELECT k.checks, k.decision_reason FROM kyc_cases k JOIN players p ON p.id = k.player_id
           WHERE p.user_id = $1`,
        ),
      ).toEqual([{ checks: [], decision_reason: 'Motif effacé' }]);
      expect(
        await check(`SELECT payload, status FROM notifications WHERE recipient_user_id = $1`),
      ).toEqual([{ payload: {}, status: 'cancelled' }]);
      expect(
        await check(
          `SELECT first_name, email_verified_at FROM users u JOIN players p ON p.user_id = u.id
           WHERE u.id = $1`,
        ),
      ).toEqual([{ first_name: 'Anonyme', email_verified_at: null }]);
      expect(guardian.id).toBeTruthy();
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  });
});

describe('exécution (lot 1.16cba)', () => {
  it('D2 : échéance passée mais non exécutée, l’annulation l’emporte', async () => {
    const owner = await user('tardif@example.test');
    const requestId = await accepted(owner);
    await makeDue(requestId);
    expect(await as(owner, (tx) => cancelAccountDeletion(tx))).toBe(true);
    expect(await anonymizeAccount(worker, requestId)).toBe('cancelled');
    expect(await dueAccountDeletions(worker, 500)).not.toContain(requestId);
  });

  it('D3 : compte suspendu gelé (rien modifié, une alerte), anonymisé après la levée', async () => {
    const owner = await user('gele@example.test');
    const requestId = await accepted(owner);
    await makeDue(requestId);
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [owner]);
    // Gel pas encore signalé : la demande est désignée une fois.
    expect(await dueAccountDeletions(worker, 500)).toContain(requestId);
    expect(await anonymizeAccount(worker, requestId)).toBe('frozen');
    expect(await anonymizeAccount(worker, requestId)).toBe('frozen');
    expect(await one(`SELECT email, deleted_at FROM users WHERE id = $1`, [owner])).toEqual({
      email: 'gele@example.test',
      deleted_at: null,
    });
    // Gel signalé : écartée du lot jusqu'à la levée (elle ne retient pas les autres demandes).
    expect(await dueAccountDeletions(worker, 500)).not.toContain(requestId);
    expect(
      await db.query(
        `SELECT metadata->>'request_id' AS request FROM audit_log
         WHERE action = 'account.deletion.frozen' AND target_id = $1`,
        [owner],
      ),
    ).toEqual([{ request: requestId }]);
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [owner]);
    expect(await dueAccountDeletions(worker, 500)).toContain(requestId);
    expect(await anonymizeAccount(worker, requestId)).toBe('done');
  });

  it('D4 : dossier KYC ouvert clos `expired`, export en cours en échec audité', async () => {
    const owner = await user('ouvert@example.test');
    const player = await one<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country)
       VALUES ($1, 'Ouvert', 'Ouvert', '1994-02-03', 'CM', 'CM') RETURNING id`,
      [owner],
    );
    await db.query(
      `INSERT INTO kyc_cases (player_id, level, status, checks, submitted_at)
       VALUES ($1, 2, 'submitted', '[{"note": "Ouvertmarqueur"}]', now())`,
      [player.id],
    );
    const exported = await one<{ id: string }>(
      `INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id::text`,
      [owner],
    );
    const requestId = await accepted(owner);
    await makeDue(requestId);
    expect(await anonymizeAccount(worker, requestId)).toBe('done');
    expect(
      await db.query(`SELECT status::text, checks FROM kyc_cases WHERE player_id = $1`, [
        player.id,
      ]),
    ).toEqual([{ status: 'expired', checks: [] }]);
    // Plus jamais décidable : la garde KYC fige un dossier `expired`.
    await expect(
      db.query(
        `UPDATE kyc_cases SET status = 'approved', decided_by = $2, decided_at = now(),
           decision_reason = 'tentative' WHERE player_id = $1`,
        [player.id, owner],
      ),
    ).rejects.toThrow();
    expect(
      await db.query(
        `SELECT metadata->>'reason' AS reason FROM audit_log
         WHERE action = 'data.export.failed' AND metadata->>'request_id' = $1`,
        [exported.id],
      ),
    ).toEqual([{ reason: 'account_gone' }]);
  });
});

describe('demande du tuteur pour son enfant mineur (lot 1.16cbb)', () => {
  let serial = 100;
  /** Tuteur, fiche tuteur et fiche d'un enfant (avec ou sans compte), OZ ID émis. */
  const family = async (
    name: string,
    options: { childAccount?: boolean; verified?: boolean; birthDate?: string } = {},
  ) => {
    const admin = await user(`admin-${name}@example.test`);
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [admin]);
    const guardianUser = await user(`tuteur-${name}@example.test`);
    const childUser =
      options.childAccount === true ? await user(`enfant-${name}@example.test`) : null;
    const guardian = await one<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country,
         verification_status)
       VALUES ($1, 'Tuteur', $2, 'mother', 'CM', $3) RETURNING id`,
      [guardianUser, name, options.verified === false ? 'declared' : 'verified'],
    );
    const child = await one<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country,
         city, guardian_id)
       VALUES ($1, 'Enfant', $2, $3::date, 'CM', 'CM', 'Douala', $4) RETURNING id`,
      [childUser, name, options.birthDate ?? '2014-06-07', guardian.id],
    );
    serial += 1;
    const ozId = await app.as(admin, async (c) => {
      const { rows } = await c.query<{ oz_id: string }>('SELECT oz_issue_oz_id($1, $2) AS oz_id', [
        child.id,
        String(serial).padStart(6, '0'),
      ]);
      return rows[0]?.oz_id ?? '';
    });
    return { guardianUser, childUser, childId: child.id, ozId };
  };
  const requestFor = (guardianUser: string, ozId: string) =>
    as(guardianUser, (tx) => requestPlayerDeletion(tx, ozId));

  it('refus indiscernables : autre compte, tuteur non vérifié, enfant majeur', async () => {
    const fam = await family('refus');
    const stranger = await user('etranger@example.test');
    expect(await requestFor(stranger, fam.ozId)).toEqual({ outcome: 'refused' });
    const unverified = await family('nonverifie', { verified: false });
    expect(await requestFor(unverified.guardianUser, unverified.ozId)).toEqual({
      outcome: 'refused',
    });
    const adult = await family('majeur', { birthDate: '2000-01-01' });
    expect(await requestFor(adult.guardianUser, adult.ozId)).toEqual({ outcome: 'refused' });
    expect(await requestFor(fam.guardianUser, 'OZ-CM-26-000000-0')).toEqual({ outcome: 'refused' });
    expect(
      await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM account_deletion_requests WHERE player_id IS NOT NULL
           AND player_id IN ($1, $2, $3)`,
        [fam.childId, unverified.childId, adult.childId],
      ),
    ).toEqual({ n: 0 });
  });

  it('enfant avec compte : demande à +30 jours, l’enfant n’annule pas, fiche et compte anonymisés', async () => {
    const fam = await family('compte', { childAccount: true });
    const outcome = await requestFor(fam.guardianUser, fam.ozId);
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    expect(outcome.childEmail).toBe('enfant-compte@example.test');
    expect(outcome.scheduledFor.getTime() - outcome.requestedAt.getTime()).toBe(30 * 86_400_000);
    expect(await requestFor(fam.guardianUser, fam.ozId)).toMatchObject({ outcome: 'pending' });
    expect(await as(fam.guardianUser, (tx) => pendingPlayerDeletion(tx, fam.ozId))).toMatchObject({
      id: outcome.id,
    });
    const childUser = fam.childUser ?? '';
    // D5 : pas de seconde demande sur le compte de l'enfant ; D2 : il n'annule pas.
    expect(await as(childUser, (tx) => requestAccountDeletion(tx))).toMatchObject({
      outcome: 'pending',
    });
    expect(await as(childUser, (tx) => cancelAccountDeletion(tx))).toBe(false);

    await makeDue(outcome.id);
    expect(await dueAccountDeletions(worker, 500)).toContain(outcome.id);
    expect(await anonymizeAccount(worker, outcome.id)).toBe('done');
    expect(
      await one(
        `SELECT first_name, city, oz_id, deleted_at IS NOT NULL AS gone FROM players
                 WHERE id = $1`,
        [fam.childId],
      ),
    ).toEqual({ first_name: 'Anonyme', city: null, oz_id: fam.ozId, gone: true });
    expect(await one(`SELECT email, status::text FROM users WHERE id = $1`, [childUser])).toEqual({
      email: `deleted+${childUser}@invalid`,
      status: 'closed',
    });
    expect(
      await one(`SELECT email, status::text FROM users WHERE id = $1`, [fam.guardianUser]),
    ).toEqual({ email: 'tuteur-compte@example.test', status: 'active' });
    expect(
      await db.query(
        `SELECT actor_user_id, target_type FROM audit_log WHERE action IN
           ('account.deletion.requested', 'account.deletion.done') AND target_id = $1
         ORDER BY chain_position`,
        [fam.childId],
      ),
    ).toEqual([
      { actor_user_id: fam.guardianUser, target_type: 'player' },
      { actor_user_id: null, target_type: 'player' },
    ]);
  });

  it('enfant sans compte : fiche et pièces anonymisées, OZ ID gardé', async () => {
    const fam = await family('sanscompte');
    const document = await one<{ id: string }>('SELECT oz_uuid_v7()::text AS id');
    await db.query(
      `INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes,
           sha256, av_status, av_checked_at, perceptual_hash, width, height, retention_until)
         VALUES ($1::uuid, 'identity_document', $2, $3, 'clean/' || $1, 'image/jpeg', 4,
           repeat('ab', 32), 'clean', now(), 1, 800, 600, now() + interval '1 year')`,
      [document.id, fam.childId, fam.guardianUser],
    );
    const outcome = await requestFor(fam.guardianUser, fam.ozId);
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    expect(outcome.childEmail).toBeNull();
    await makeDue(outcome.id);
    expect(await dueAccountDeletions(worker, 500)).toContain(outcome.id);
    expect(await anonymizeAccount(worker, outcome.id)).toBe('done');
    expect(
      await one(`SELECT last_name, birth_date::text, oz_id FROM players WHERE id = $1`, [
        fam.childId,
      ]),
    ).toEqual({ last_name: 'Anonyme', birth_date: '2014-01-01', oz_id: fam.ozId });
    expect(
      await one(`SELECT retention_until <= now() AS due FROM documents WHERE id = $1`, [
        document.id,
      ]),
    ).toEqual({ due: true });
  });

  it('annulation par le tuteur seul, puis nouvelle demande possible', async () => {
    const fam = await family('annule');
    const stranger = await user('autre-annule@example.test');
    const outcome = await requestFor(fam.guardianUser, fam.ozId);
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    expect(await as(stranger, (tx) => cancelPlayerDeletion(tx, fam.ozId))).toEqual({
      cancelled: false,
    });
    expect(await as(stranger, (tx) => pendingPlayerDeletion(tx, fam.ozId))).toBeNull();
    expect(await as(fam.guardianUser, (tx) => cancelPlayerDeletion(tx, fam.ozId))).toEqual({
      cancelled: true,
      childEmail: null,
    });
    expect(await as(fam.guardianUser, (tx) => pendingPlayerDeletion(tx, fam.ozId))).toBeNull();
    expect(await anonymizeAccount(worker, outcome.id)).toBe('cancelled');
    expect(await requestFor(fam.guardianUser, fam.ozId)).toMatchObject({ outcome: 'accepted' });
  });

  it('D4 : enfant devenu majeur avant l’exécution, demande annulée, rien modifié', async () => {
    const fam = await family('majorite', { childAccount: true });
    const outcome = await requestFor(fam.guardianUser, fam.ozId);
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    await makeDue(outcome.id);
    await db.query(`UPDATE players SET birth_date = '2000-01-01' WHERE id = $1`, [fam.childId]);
    expect(await anonymizeAccount(worker, outcome.id)).toBe('majority');
    expect(
      await one(`SELECT status FROM account_deletion_requests WHERE id = $1`, [outcome.id]),
    ).toEqual({ status: 'cancelled' });
    expect(await one(`SELECT last_name FROM players WHERE id = $1`, [fam.childId])).toEqual({
      last_name: 'majorite',
    });
    expect(
      await one(
        `SELECT metadata->>'reason' AS reason FROM audit_log
         WHERE action = 'account.deletion.cancelled' AND target_id = $1`,
        [fam.childId],
      ),
    ).toEqual({ reason: 'majority' });
  });

  it('cas limites : demande propre de l’enfant d’abord, fiche supprimée, compte rattaché en cours, majeur gelé', async () => {
    // D5 dans l'autre sens : l'enfant a déjà sa propre demande, celle du tuteur est `pending`.
    const own = await family('propre', { childAccount: true });
    await as(own.childUser ?? '', (tx) => requestAccountDeletion(tx));
    expect(await requestFor(own.guardianUser, own.ozId)).toMatchObject({ outcome: 'pending' });

    const gone = await family('supprimee');
    await db.query(`UPDATE players SET deleted_at = now() WHERE id = $1`, [gone.childId]);
    expect(await requestFor(gone.guardianUser, gone.ozId)).toEqual({ outcome: 'refused' });

    // Compte rattaché à la fiche pendant le délai : relu à l'exécution, anonymisé aussi.
    const later = await family('rattache');
    const outcome = await requestFor(later.guardianUser, later.ozId);
    if (outcome.outcome !== 'accepted') throw new Error(outcome.outcome);
    const attached = await user('rattache-enfant@example.test');
    await db.query(`UPDATE players SET user_id = $1 WHERE id = $2`, [attached, later.childId]);
    await makeDue(outcome.id);
    expect(await anonymizeAccount(worker, outcome.id)).toBe('done');
    expect(await one(`SELECT status::text FROM users WHERE id = $1`, [attached])).toEqual({
      status: 'closed',
    });

    // Compte de l'enfant suspendu puis gelé, enfant devenu majeur : la demande revient et est
    // annulée (D4), elle ne reste pas en attente sans fin.
    const frozen = await family('gele', { childAccount: true });
    const pending = await requestFor(frozen.guardianUser, frozen.ozId);
    if (pending.outcome !== 'accepted') throw new Error(pending.outcome);
    await makeDue(pending.id);
    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [frozen.childUser]);
    expect(await anonymizeAccount(worker, pending.id)).toBe('frozen');
    expect(await dueAccountDeletions(worker, 500)).not.toContain(pending.id);
    await db.query(`UPDATE players SET birth_date = '2000-01-01' WHERE id = $1`, [frozen.childId]);
    expect(await dueAccountDeletions(worker, 500)).toContain(pending.id);
    expect(await anonymizeAccount(worker, pending.id)).toBe('majority');
  });
});
