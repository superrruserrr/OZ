import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  findStorageOrphans,
  finishDocumentPurge,
  listDuePurges,
  listStalePending,
} from '../src/document-purge.js';
import { finishDocumentScan } from '../src/document-scan.js';
import { withUserContext } from '../src/session-context.js';
import { migrateDeploy, startDatabase, type TestDatabase, workerRoleUrl } from './database.js';

// Purge du coffre (lot 1.9cb, tâches 1 et 2) : pièces échues, délai de 5 minutes après la dernière
// URL délivrée (D-101), anonymisation, objets orphelins, analyses abandonnées, droits.

let db: TestDatabase;
let worker: PrismaClient;
/** Connexion de l'API (`oz_app`) : aucune fonction de purge. */
let api: PrismaClient;
let ids: Record<string, string> = {};

const SHA = 'ef'.repeat(32);
const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

interface DocOptions {
  status?: 'pending' | 'clean' | 'infected' | 'rejected' | 'error';
  /** Échéance passée (défaut) ou dans 90 jours. */
  due?: boolean;
  deleted?: boolean;
  /** Âge du document (pour le balayage des analyses). */
  age?: string;
}

/** Pièce insérée par le chemin privilégié, dans l'état voulu, avec des données extraites chiffrées. */
const doc = async (options: DocOptions = {}): Promise<string> => {
  const status = options.status ?? 'clean';
  const id = randomUUID();
  await db.query(
    `INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes,
       sha256, av_status, rejection_reason, ocr_extract_encrypted, document_number_encrypted,
       document_number_hmac, created_at, retention_until, deleted_at)
     VALUES ($1, 'identity_document', $2, $3, $4, 'image/png', 4096, $5, $6::av_status,
       CASE WHEN $6 = 'rejected' THEN 'dimensions' END, '\\x01'::bytea, '\\x02'::bytea,
       '\\x03'::bytea, now() - $7::interval,
       CASE WHEN $8 THEN now() - interval '1 hour' ELSE now() + interval '90 days' END,
       CASE WHEN $9 THEN now() END)`,
    [
      id,
      ids.adult,
      ids.owner,
      status === 'clean' ? `clean/${id}` : `quarantine/${id}`,
      SHA,
      status,
      options.age ?? '100 days',
      options.due ?? true,
      options.deleted ?? false,
    ],
  );
  return id;
};

/** URL de lecture délivrée il y a `ago` (le journal refuse une heure client : déclencheurs suspendus). */
const granted = async (id: string, ago = '0 seconds'): Promise<void> => {
  if (ago === '0 seconds') {
    await db.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
       VALUES ($1, 'document.read.granted', 'document', $2, 'Lecture')`,
      [ids.owner, id],
    );
    return;
  }
  // Identifiants générés ici (UUID), intervalle littéral du test : aucune donnée extérieure.
  await db.query(`BEGIN;
    SET LOCAL session_replication_role = replica;
    INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, created_at)
      VALUES ('${ids.owner ?? ''}', 'document.read.granted', 'document', '${id}', 'Lecture',
        now() - interval '${ago}');
    COMMIT;`);
};

const row = (id: string) =>
  one<Record<string, unknown>>(
    `SELECT purged_at IS NOT NULL AS purged, ocr_extract_encrypted IS NULL AS ocr_erased,
       document_number_encrypted IS NULL AS number_erased, encode(document_number_hmac, 'hex') AS hmac,
       sha256, av_status::text, type::text, size_bytes::int
     FROM documents WHERE id = $1`,
    [id],
  );

const due = async (): Promise<string[]> => (await listDuePurges(worker, 500)).map((d) => d.id);

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  worker = createDbClient(await workerRoleUrl(db));
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_app_test') THEN
      CREATE ROLE oz_app_test LOGIN PASSWORD 'oz_app_test' NOSUPERUSER NOBYPASSRLS;
    END IF; END $$`);
  await db.query('GRANT oz_app TO oz_app_test');
  const apiUrl = new URL(db.url);
  apiUrl.username = 'oz_app_test';
  apiUrl.password = 'oz_app_test';
  api = createDbClient(apiUrl.toString());

  const owner = (
    await one<{ id: string }>(
      `INSERT INTO users (email) VALUES ('titulaire-purge@example.test') RETURNING id`,
    )
  ).id;
  const adult = (
    await one<{ id: string }>(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
       VALUES ($1, 'Joueur', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared') RETURNING id`,
      [owner],
    )
  ).id;
  ids = { owner, adult };
}, 180_000);

afterAll(async () => {
  await worker.$disconnect();
  await api.$disconnect();
  await db.stop();
});

describe('pièces échues', () => {
  it('rend les pièces jugées échues ; ni non échues, ni purgées, ni en analyse', async () => {
    const clean = await doc();
    const infected = await doc({ status: 'infected' });
    const rejected = await doc({ status: 'rejected' });
    const error = await doc({ status: 'error' });
    const deletedPending = await doc({ status: 'pending', deleted: true });
    const notDue = await doc({ due: false });
    const pending = await doc({ status: 'pending' });
    const listed = await due();
    expect(listed).toEqual(
      expect.arrayContaining([clean, infected, rejected, error, deletedPending]),
    );
    expect(listed).not.toContain(notDue);
    expect(listed).not.toContain(pending);
    expect(await listDuePurges(worker, 1)).toHaveLength(1);
  });

  it('attend 5 minutes après la dernière URL délivrée (D-101)', async () => {
    const recent = await doc();
    await granted(recent);
    const fourMinutes = await doc();
    await granted(fourMinutes, '4 minutes');
    const old = await doc();
    await granted(old, '6 minutes');
    const listed = await due();
    expect(listed).not.toContain(recent);
    expect(listed).not.toContain(fourMinutes);
    expect(listed).toContain(old);
    expect(await finishDocumentPurge(worker, recent)).toBe('skipped');
    expect(await row(recent)).toMatchObject({ purged: false });
  });

  it('marque la pièce purgée : données extraites effacées, empreinte et métadonnées conservées, audit', async () => {
    const id = await doc();
    expect(await finishDocumentPurge(worker, id)).toBe('done');
    expect(await row(id)).toEqual({
      purged: true,
      ocr_erased: true,
      number_erased: true,
      hmac: '03',
      sha256: SHA,
      av_status: 'clean',
      type: 'identity_document',
      size_bytes: 4096,
    });
    expect(
      await db.query(
        `SELECT action, actor_user_id, metadata FROM audit_log WHERE target_id = $1 ORDER BY chain_position`,
        [id],
      ),
    ).toEqual([
      {
        action: 'document.purge.done',
        actor_user_id: null,
        metadata: { document_type: 'identity_document', av_status: 'clean' },
      },
    ]);
    expect(await finishDocumentPurge(worker, id)).toBe('skipped');
    expect(await due()).not.toContain(id);
  });

  it('`skipped` pour une pièce non échue, en analyse ou inconnue ; identifiant invalide refusé', async () => {
    expect(await finishDocumentPurge(worker, await doc({ due: false }))).toBe('skipped');
    expect(await finishDocumentPurge(worker, await doc({ status: 'pending' }))).toBe('skipped');
    expect(await finishDocumentPurge(worker, randomUUID())).toBe('skipped');
    await expect(finishDocumentPurge(worker, 'pas-un-uuid')).rejects.toThrow(TypeError);
    await expect(listDuePurges(worker, 0)).rejects.toThrow(TypeError);
    await expect(listDuePurges(worker, 501)).rejects.toThrow(TypeError);
  });

  it('garde : purge sans effacement refusée ; données extraites jamais réécrites après purge', async () => {
    const id = await doc();
    await expect(
      db.query('UPDATE documents SET purged_at = now() WHERE id = $1', [id]),
    ).rejects.toThrow(/données extraites effacées/);
    await finishDocumentPurge(worker, id);
    await expect(
      db.query(`UPDATE documents SET ocr_extract_encrypted = '\\x09'::bytea WHERE id = $1`, [id]),
    ).rejects.toThrow(/données extraites effacées/);
  });
});

describe('objets orphelins', () => {
  const upload = async (status: string, expiresIn: string): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO document_uploads (requested_by, document_type, player_id, content_type,
           size_bytes, sha256, status, reject_reason, created_at, expires_at)
         VALUES ($1, 'photo', $2, 'image/png', 10, $3, $4::upload_status,
           CASE WHEN $4 = 'rejected' THEN 'size_mismatch' END,
           now() + $5::interval - interval '5 minutes', now() + $5::interval)
         RETURNING id::text`,
        [ids.owner, ids.adult, SHA, status, expiresIn],
      )
    ).id;

  it('désigne seulement les clés que rien ne justifie', async () => {
    const live = await upload('issued', '4 minutes');
    const graceful = await upload('issued', '-10 minutes');
    const expired = await upload('issued', '-20 minutes');
    const rejected = await upload('rejected', '4 minutes');
    const pending = await doc({ status: 'pending', due: false });
    const judged = await doc({ status: 'infected', due: false });
    const clean = await doc({ due: false });
    const rejectedDoc = await doc({ status: 'rejected', due: false });
    const purged = await doc();
    await finishDocumentPurge(worker, purged);
    const unknown = randomUUID();

    const keys = [
      `incoming/${live}`,
      `incoming/${graceful}`,
      `incoming/${expired}`,
      `incoming/${rejected}`,
      `incoming/${unknown}`,
      `quarantine/${pending}`,
      `clean/${pending}`,
      `quarantine/${judged}`,
      `quarantine/${unknown}`,
      `clean/${clean}`,
      `clean/${rejectedDoc}`,
      `clean/${purged}`,
      `clean/${unknown}`,
    ];
    expect((await findStorageOrphans(worker, keys)).sort()).toEqual(
      [
        `incoming/${expired}`,
        `incoming/${rejected}`,
        `incoming/${unknown}`,
        `quarantine/${judged}`,
        `quarantine/${unknown}`,
        `clean/${rejectedDoc}`,
        `clean/${purged}`,
        `clean/${unknown}`,
      ].sort(),
    );
  });

  it('refuse une clé hors format et plus de 500 clés ; rien à soumettre : aucune requête', async () => {
    await expect(findStorageOrphans(worker, ['autre/x'])).rejects.toThrow(TypeError);
    await expect(
      findStorageOrphans(
        worker,
        Array.from({ length: 501 }, () => `clean/${randomUUID()}`),
      ),
    ).rejects.toThrow(TypeError);
    expect(await findStorageOrphans(worker, [])).toEqual([]);
  });
});

describe('analyses abandonnées (D-099)', () => {
  it('relance après 30 minutes, clôt après 24 heures ; ni récentes, ni supprimées, ni jugées', async () => {
    const recent = await doc({ status: 'pending', due: false, age: '10 minutes' });
    const stalled = await doc({ status: 'pending', due: false, age: '31 minutes' });
    const dead = await doc({ status: 'pending', due: false, age: '25 hours' });
    const deleted = await doc({ status: 'pending', due: false, age: '2 hours', deleted: true });
    const judged = await doc({ status: 'error', due: false, age: '2 hours' });
    const stale = await listStalePending(worker, 500);
    expect(stale).toEqual(
      expect.arrayContaining([
        { id: stalled, action: 'requeue' },
        { id: dead, action: 'fail' },
      ]),
    );
    const listed = stale.map((s) => s.id);
    for (const id of [recent, deleted, judged]) expect(listed).not.toContain(id);
  });

  it('`too_large` est un motif de rejet accepté', async () => {
    const id = await doc({ status: 'pending', due: false });
    expect(await finishDocumentScan(worker, id, { verdict: 'rejected', reason: 'too_large' })).toBe(
      'done',
    );
  });
});

describe('droits', () => {
  it('refusées sous un contexte utilisateur', async () => {
    const id = await doc();
    await expect(
      withUserContext(worker, ids.owner ?? '', (tx) => listDuePurges(tx, 10)),
    ).rejects.toThrow(/réservée au worker/);
    await expect(
      withUserContext(worker, ids.owner ?? '', (tx) => finishDocumentPurge(tx, id)),
    ).rejects.toThrow(/réservée au worker/);
    await expect(
      withUserContext(worker, ids.owner ?? '', (tx) => findStorageOrphans(tx, [`clean/${id}`])),
    ).rejects.toThrow(/réservée au worker/);
    await expect(
      withUserContext(worker, ids.owner ?? '', (tx) => listStalePending(tx, 10)),
    ).rejects.toThrow(/réservée au worker/);
  });

  it('l’API (`oz_app`) n’exécute aucune fonction de purge', async () => {
    const id = await doc();
    await expect(listDuePurges(api, 10)).rejects.toThrow(/permission denied/);
    await expect(finishDocumentPurge(api, id)).rejects.toThrow(/permission denied/);
    await expect(findStorageOrphans(api, [`clean/${id}`])).rejects.toThrow(/permission denied/);
    await expect(listStalePending(api, 10)).rejects.toThrow(/permission denied/);
    expect(await row(id)).toMatchObject({ purged: false });
  });

  it('`oz_worker` seul exécute ; les fonctions internes ne sont exécutables par personne', async () => {
    const grants = await db.query<{ proname: string; acl: string }>(
      `SELECT proname, proacl::text AS acl FROM pg_proc
       WHERE proname IN ('oz_document_purge_due', 'oz_document_purge_finish',
         'oz_document_storage_orphans', 'oz_document_stale_pending',
         'oz_document_read_recently', 'oz_document_purgeable')
       ORDER BY proname`,
    );
    expect(grants).toHaveLength(6);
    for (const grant of grants) {
      expect(grant.acl).not.toMatch(/(^|[{,])=X/);
      expect(grant.acl).not.toContain('oz_app=X');
      if (['oz_document_read_recently', 'oz_document_purgeable'].includes(grant.proname)) {
        expect(grant.acl).not.toContain('oz_worker=X');
      } else {
        expect(grant.acl).toContain('oz_worker=X');
      }
    }
  });

  it('lecture directe du journal ou des intentions par `oz_worker` : rien (politiques privilégiées)', async () => {
    const id = await doc();
    await granted(id);
    expect(
      await worker.$queryRaw<unknown[]>`SELECT 1 FROM audit_log WHERE target_id = ${id}::uuid`,
    ).toEqual([]);
    expect(await worker.$queryRaw<unknown[]>`SELECT 1 FROM document_uploads`).toEqual([]);
  });
});
