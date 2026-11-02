import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  completeDocumentUpload,
  createDocumentUpload,
  documentTargetFor,
  documentUploadFor,
  rejectDocumentUpload,
  type NewDocumentUpload,
} from '../src/document-uploads.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Intentions de dépôt (lot 1.9a, tâche 2) : cloisonnement, usage unique, expiration, document `pending`.

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let ids: Record<string, string> = {};

const SHA = 'ab'.repeat(32);
const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};
const as = <T>(userId: string, fn: Parameters<typeof withUserContext<T>>[2]) =>
  withUserContext(client, userId, fn);
const newUpload = (overrides: Partial<NewDocumentUpload> = {}): NewDocumentUpload => ({
  documentType: 'identity_document',
  target: { playerId: ids.adult ?? '' },
  contentType: 'image/png',
  sizeBytes: 1234,
  sha256: SHA,
  ...overrides,
});

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());

  const user = async (email: string): Promise<string> =>
    (await one<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])).id;
  const owner = await user('titulaire@example.test');
  const stranger = await user('inconnu@example.test');
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'player', NULL), ($2, 'player', NULL)`,
    [owner, stranger],
  );
  const { id: adult } = await one<{ id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
     VALUES ($1, 'Joueur', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared') RETURNING id`,
    [owner],
  );
  const { id: other } = await one<{ id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
     VALUES ($1, 'Autre', 'Synthétique', '1996-03-04', 'CM', 'CM', 'declared') RETURNING id`,
    [stranger],
  );
  ids = { owner, stranger, adult, other };
}, 180_000);

afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

describe('création d’une intention', () => {
  it('le titulaire crée une intention `issued` expirant dans 5 minutes (horloge de la base)', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    expect(upload).not.toBeNull();
    const row = await one<{ status: string; ttl: number; requested_by: string }>(
      `SELECT status, requested_by, extract(epoch FROM expires_at - created_at)::int AS ttl
       FROM document_uploads WHERE id = $1`,
      [upload?.id],
    );
    expect(row).toEqual({ status: 'issued', requested_by: ids.owner, ttl: 300 });
    const audit = await db.query(
      `SELECT action, actor_user_id, metadata FROM audit_log WHERE target_id = $1`,
      [upload?.id],
    );
    // Le journal se suffit : acteur, type et cible, sans jointure sur `document_uploads`.
    expect(audit).toEqual([
      {
        action: 'document.upload.issued',
        actor_user_id: ids.owner,
        metadata: {
          document_type: 'identity_document',
          content_type: 'image/png',
          size_bytes: 1234,
          player_id: ids.adult,
          guardian_id: null,
          organization_id: null,
        },
      },
    ]);
  });

  it('une cible invisible au demandeur (RLS) est refusée : null, aucune ligne', async () => {
    const before = await one<{ n: number }>('SELECT count(*)::int AS n FROM document_uploads');
    const upload = await as(ids.stranger ?? '', (tx) =>
      createDocumentUpload(tx, newUpload({ target: { playerId: ids.adult ?? '' } })),
    );
    expect(upload).toBeNull();
    const after = await one<{ n: number }>('SELECT count(*)::int AS n FROM document_uploads');
    expect(after.n).toBe(before.n);
  });

  it.each([
    ['taille nulle', { sizeBytes: 0 }],
    ['taille > 50 Mo', { sizeBytes: 52_428_801 }],
    ['empreinte mal formée', { sha256: 'xyz' }],
    ['type de contenu mal formé', { contentType: 'image png' }],
  ])('la base refuse une intention hors bornes : %s', async (_label, overrides) => {
    await expect(
      as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload(overrides))),
    ).rejects.toThrow();
  });

  it('la base refuse deux cibles à la fois', async () => {
    await expect(
      app.as(ids.owner ?? '', (c) =>
        c.query(
          `INSERT INTO document_uploads (requested_by, document_type, player_id, organization_id,
             content_type, size_bytes, sha256, expires_at)
           VALUES ($1, 'photo', $2, $2, 'image/png', 10, $3, now() + interval '5 minutes')`,
          [ids.owner, ids.adult, SHA],
        ),
      ),
    ).rejects.toThrow(/document_uploads_one_target_check|violates/);
  });

  it('un utilisateur ne peut ni insérer au nom d’un autre, ni forger un statut', async () => {
    const insert = (requestedBy: string, status: string, ttl: string) =>
      app.as(ids.owner ?? '', (c) =>
        c.query(
          `INSERT INTO document_uploads (requested_by, document_type, player_id, content_type,
             size_bytes, sha256, status, expires_at)
           VALUES ($1, 'photo', $2, 'image/png', 10, $3, $4::upload_status, now() + $5::interval)`,
          [requestedBy, ids.adult, SHA, status, ttl],
        ),
      );
    await expect(insert(ids.stranger ?? '', 'issued', '5 minutes')).rejects.toThrow(/row-level/);
    await expect(insert(ids.owner ?? '', 'completed', '5 minutes')).rejects.toThrow(/row-level/);
    await expect(insert(ids.owner ?? '', 'issued', '1 hour')).rejects.toThrow(/row-level/);
  });

  it('aucune mise à jour ni suppression directe', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    const updated = await app.as(ids.owner ?? '', (c) =>
      c.query(`UPDATE document_uploads SET status = 'completed' WHERE id = $1`, [upload?.id]),
    );
    expect(updated.rowCount).toBe(0);
    const deleted = await app.as(ids.owner ?? '', (c) =>
      c.query('DELETE FROM document_uploads WHERE id = $1', [upload?.id]),
    );
    expect(deleted.rowCount).toBe(0);
  });
});

describe('lecture', () => {
  it('le demandeur lit son intention ; un autre ne la voit pas', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    const mine = await as(ids.owner ?? '', (tx) => documentUploadFor(tx, upload?.id ?? ''));
    expect(mine).toMatchObject({
      id: upload?.id,
      status: 'issued',
      documentType: 'identity_document',
      contentType: 'image/png',
      sizeBytes: 1234,
      sha256: SHA,
      expired: false,
    });
    expect(
      await as(ids.stranger ?? '', (tx) => documentUploadFor(tx, upload?.id ?? '')),
    ).toBeNull();
    expect(await as(ids.owner ?? '', (tx) => documentUploadFor(tx, 'pas-un-uuid'))).toBeNull();
  });
});

describe('réception (usage unique)', () => {
  it('complète une fois : document `pending` en quarantaine, conservation posée, audit', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    const out = await as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 90));
    expect(out.outcome).toBe('completed');
    const doc = await one<Record<string, unknown>>(
      `SELECT type, player_id, uploaded_by, created_by, storage_key, mime_type, size_bytes::int AS size,
         sha256, av_status, extract(day FROM retention_until - created_at)::int AS days
       FROM documents WHERE id = $1`,
      [out.documentId],
    );
    expect(doc).toEqual({
      type: 'identity_document',
      player_id: ids.adult,
      uploaded_by: ids.owner,
      created_by: ids.owner,
      storage_key: `quarantine/${out.documentId ?? ''}`,
      mime_type: 'image/png',
      size: 1234,
      sha256: SHA,
      av_status: 'pending',
      days: 90,
    });
    const row = await one<{ status: string; document_id: string }>(
      'SELECT status, document_id FROM document_uploads WHERE id = $1',
      [upload?.id],
    );
    expect(row).toEqual({ status: 'completed', document_id: out.documentId });
    const second = await as(ids.owner ?? '', (tx) =>
      completeDocumentUpload(tx, upload?.id ?? '', 90),
    );
    expect(second).toEqual({ outcome: 'already_used', documentId: null });
    const audit = await db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE target_id = $1 ORDER BY chain_position`,
      [upload?.id],
    );
    expect(audit.map((a) => a.action)).toEqual([
      'document.upload.issued',
      'document.upload.completed',
    ]);
  });

  it('deux réceptions concurrentes : une seule réussit', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 90)),
      ),
    );
    expect(results.filter((r) => r.outcome === 'completed')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'already_used')).toHaveLength(2);
  });

  it('intention d’un autre ou inconnue : not_found ; aucun document créé', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    const before = await one<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    expect(
      await as(ids.stranger ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 90)),
    ).toEqual({ outcome: 'not_found', documentId: null });
    expect(
      await as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, crypto.randomUUID(), 90)),
    ).toEqual({ outcome: 'not_found', documentId: null });
    const after = await one<{ n: number }>('SELECT count(*)::int AS n FROM documents');
    expect(after.n).toBe(before.n);
  });

  it('intention expirée : expired, statut passé à `expired`, aucun document', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    await db.query(
      `UPDATE document_uploads SET created_at = now() - interval '10 minutes',
         expires_at = now() - interval '5 minutes' WHERE id = $1`,
      [upload?.id],
    );
    const out = await as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 90));
    expect(out).toEqual({ outcome: 'expired', documentId: null });
    const row = await one<{ status: string }>('SELECT status FROM document_uploads WHERE id = $1', [
      upload?.id,
    ]);
    expect(row.status).toBe('expired');
    const read = await as(ids.owner ?? '', (tx) => documentUploadFor(tx, upload?.id ?? ''));
    expect(read?.status).toBe('expired');
    const audit = await db.query(`SELECT action FROM audit_log WHERE target_id = $1 ORDER BY 1`, [
      upload?.id,
    ]);
    expect(audit).toEqual([
      { action: 'document.upload.expired' },
      { action: 'document.upload.issued' },
    ]);
  });

  it('durée de conservation hors bornes : refus', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    await expect(
      as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 0)),
    ).rejects.toThrow();
    await expect(
      as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 3651)),
    ).rejects.toThrow();
  });

  it('sans contexte utilisateur : refus', async () => {
    await expect(
      app.as(null, (c) =>
        c.query('SELECT * FROM oz_complete_document_upload($1, 90)', [crypto.randomUUID()]),
      ),
    ).rejects.toThrow();
  });
});

describe('rejet', () => {
  it('rejette une intention émise avec son motif, une seule fois, audit compris', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    expect(
      await as(ids.owner ?? '', (tx) =>
        rejectDocumentUpload(tx, upload?.id ?? '', 'type_mismatch'),
      ),
    ).toBe(true);
    expect(
      await as(ids.owner ?? '', (tx) =>
        rejectDocumentUpload(tx, upload?.id ?? '', 'size_mismatch'),
      ),
    ).toBe(false);
    const row = await one<{ status: string; reject_reason: string }>(
      'SELECT status, reject_reason FROM document_uploads WHERE id = $1',
      [upload?.id],
    );
    expect(row).toEqual({ status: 'rejected', reject_reason: 'type_mismatch' });
    const audit = await db.query<{ action: string; reason: string }>(
      `SELECT action, reason FROM audit_log WHERE target_id = $1 ORDER BY chain_position`,
      [upload?.id],
    );
    expect(audit.at(-1)).toEqual({ action: 'document.upload.rejected', reason: 'type_mismatch' });
    expect(
      await as(ids.owner ?? '', (tx) => completeDocumentUpload(tx, upload?.id ?? '', 90)),
    ).toEqual({ outcome: 'already_used', documentId: null });
  });

  it('un autre utilisateur ne peut pas rejeter ; motif inconnu refusé', async () => {
    const upload = await as(ids.owner ?? '', (tx) => createDocumentUpload(tx, newUpload()));
    expect(
      await as(ids.stranger ?? '', (tx) =>
        rejectDocumentUpload(tx, upload?.id ?? '', 'type_mismatch'),
      ),
    ).toBe(false);
    await expect(
      app.as(ids.owner ?? '', (c) =>
        c.query("SELECT oz_reject_document_upload($1, 'autre')", [upload?.id]),
      ),
    ).rejects.toThrow();
  });
});

describe('droits d’exécution (D-066)', () => {
  it('PUBLIC n’exécute pas les fonctions ; oz_app oui', async () => {
    const rows = await db.query<{ name: string; public: boolean; app: boolean }>(
      `SELECT p.proname AS name,
         has_function_privilege('public', p.oid, 'EXECUTE') AS public,
         has_function_privilege('oz_app', p.oid, 'EXECUTE') AS app
       FROM pg_proc p WHERE p.proname IN ('oz_complete_document_upload', 'oz_reject_document_upload')
       ORDER BY 1`,
    );
    expect(rows).toEqual([
      { name: 'oz_complete_document_upload', public: false, app: true },
      { name: 'oz_reject_document_upload', public: false, app: true },
    ]);
  });
});

describe('cible d’un dépôt', () => {
  it('le titulaire lit son joueur, à l’instant de la base', async () => {
    const target = await as(ids.owner ?? '', (tx) =>
      documentTargetFor(tx, { playerId: ids.adult ?? '' }),
    );
    expect(target).toMatchObject({
      kind: 'player',
      ownerUserId: ids.owner,
      guardianUserId: null,
      organizationId: null,
      birthDate: new Date('1995-03-04'),
    });
    expect(target?.checkedAt).toBeInstanceOf(Date);
  });

  it('cible cachée par la RLS, inconnue ou mal formée : null', async () => {
    const unknown = '00000000-0000-4000-8000-000000000009';
    for (const target of [
      { playerId: ids.other ?? '' },
      { playerId: 'x' },
      { guardianId: unknown },
      { guardianId: 'x' },
      { organizationId: unknown },
      { organizationId: 'x' },
    ]) {
      expect(await as(ids.owner ?? '', (tx) => documentTargetFor(tx, target))).toBeNull();
    }
  });

  it('tuteur et organisation visibles : leur forme propre', async () => {
    const { id: guardian } = await one<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Tuteur', 'Synthétique', 'father', 'CM') RETURNING id`,
      [ids.owner],
    );
    expect(
      await as(ids.owner ?? '', (tx) => documentTargetFor(tx, { guardianId: guardian })),
    ).toMatchObject({ kind: 'guardian', ownerUserId: ids.owner, organizationId: null });
    const { id: organization } = await one<{ id: string }>(
      `INSERT INTO organizations (type, name, country, verification_status)
       VALUES ('club', 'Club synthétique', 'CM', 'verified') RETURNING id`,
    );
    const read = () =>
      as(ids.owner ?? '', (tx) => documentTargetFor(tx, { organizationId: organization }));
    expect(await read()).toBeNull();
    await db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'club', $2)`,
      [ids.owner, organization],
    );
    expect(await read()).toMatchObject({ kind: 'organization', organizationId: organization });
  });
});
