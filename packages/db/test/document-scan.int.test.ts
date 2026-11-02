import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { claimDocumentScan, finishDocumentScan, type ScanVerdict } from '../src/document-scan.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
  workerRoleUrl,
} from './database.js';

// Analyse des documents (lot 1.9b, tâche 1) : réclamation, verdict unique et cohérent, garde, doublon, audit.

let db: TestDatabase;
let app: AppConnection;
let worker: PrismaClient;
/** Connexion de l'API (`oz_app`) : ne doit ni réclamer ni juger. */
let api: PrismaClient;
let ids: Record<string, string> = {};

const SHA = 'cd'.repeat(32);
const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

/** Document `pending` tel que la réception (lot 1.9a) le crée : clé `quarantine/<id>`. */
const pending = async (
  options: { player?: string; sha256?: string; mime?: string } = {},
): Promise<string> =>
  (
    await one<{ id: string }>(
      `WITH n AS (SELECT oz_uuid_v7() AS id)
       INSERT INTO documents (id, type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256, retention_until)
       SELECT n.id, 'identity_document', $1, $2, 'quarantine/' || n.id, $3, 4096, $4, now() + interval '90 days'
       FROM n RETURNING id::text`,
      [options.player ?? ids.adult, ids.owner, options.mime ?? 'image/png', options.sha256 ?? SHA],
    )
  ).id;

const image: ScanVerdict = {
  verdict: 'clean',
  sizeBytes: 2048,
  image: { width: 800, height: 600, perceptualHash: -1234567890123456789n },
  pageCount: null,
};

const row = (id: string) =>
  one<Record<string, unknown>>(
    `SELECT av_status::text, storage_key, size_bytes::int, width, height, page_count,
       perceptual_hash::text, rejection_reason, av_checked_at IS NOT NULL AS checked
     FROM documents WHERE id = $1`,
    [id],
  );
const audit = (id: string) =>
  db.query<{ action: string; actor_user_id: string | null; metadata: Record<string, unknown> }>(
    `SELECT action, actor_user_id, metadata FROM audit_log WHERE target_id = $1 ORDER BY chain_position`,
    [id],
  );

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
    (await one<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])).id;
  const owner = await user('titulaire-scan@example.test');
  const stranger = await user('autre-scan@example.test');
  const player = async (userId: string, first: string): Promise<string> =>
    (
      await one<{ id: string }>(
        `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
         VALUES ($1, $2, 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared') RETURNING id`,
        [userId, first],
      )
    ).id;
  ids = {
    owner,
    stranger,
    adult: await player(owner, 'Joueur'),
    other: await player(stranger, 'Autre'),
  };
}, 180_000);

afterAll(async () => {
  await worker.$disconnect();
  await api.$disconnect();
  await app.end();
  await db.stop();
});

describe('réclamation', () => {
  it('rend le document `pending` hors contexte utilisateur, avec sa clé de quarantaine', async () => {
    const id = await pending();
    expect(await claimDocumentScan(worker, id)).toEqual({
      id,
      type: 'identity_document',
      storageKey: `quarantine/${id}`,
      mimeType: 'image/png',
      sizeBytes: 4096,
      sha256: SHA,
    });
  });

  it('rien pour un document inconnu, mal formé, déjà jugé ou supprimé', async () => {
    expect(await claimDocumentScan(worker, '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192')).toBeNull();
    expect(await claimDocumentScan(worker, 'pas-un-uuid')).toBeNull();
    const judged = await pending();
    await finishDocumentScan(worker, judged, { verdict: 'error' });
    expect(await claimDocumentScan(worker, judged)).toBeNull();
    const removed = await pending();
    await db.query('UPDATE documents SET deleted_at = now() WHERE id = $1', [removed]);
    expect(await claimDocumentScan(worker, removed)).toBeNull();
  });

  it('refusée sous un contexte utilisateur (réservée au worker)', async () => {
    const id = await pending();
    await expect(
      withUserContext(worker, ids.owner ?? '', (tx) => claimDocumentScan(tx, id)),
    ).rejects.toThrow(/réservée au worker/);
    await expect(
      withUserContext(worker, ids.owner ?? '', (tx) =>
        finishDocumentScan(tx, id, { verdict: 'error' }),
      ),
    ).rejects.toThrow(/réservée au worker/);
  });

  it('l’API (`oz_app`) ne peut ni réclamer ni juger : permission refusée', async () => {
    const id = await pending();
    await expect(claimDocumentScan(api, id)).rejects.toThrow(/permission denied/);
    await expect(finishDocumentScan(api, id, { verdict: 'error' })).rejects.toThrow(
      /permission denied/,
    );
    expect(await row(id)).toMatchObject({ av_status: 'pending' });
  });

  it('PUBLIC et `oz_app` n’exécutent pas les fonctions ; `oz_worker` seul', async () => {
    const grants = await db.query<{ proname: string; acl: string }>(
      `SELECT proname, proacl::text AS acl FROM pg_proc WHERE proname LIKE 'oz_document_scan_%' ORDER BY proname`,
    );
    expect(grants.map((g) => g.proname)).toEqual([
      'oz_document_scan_claim',
      'oz_document_scan_finish',
    ]);
    for (const grant of grants) {
      expect(grant.acl).not.toMatch(/(^|[{,])=X/);
      expect(grant.acl).toContain('oz_worker=X');
      expect(grant.acl).not.toContain('oz_app=X');
    }
  });
});

describe('verdict', () => {
  it('`clean` image : clé `clean/<id>`, taille, dimensions, empreinte perceptuelle, audit sans acteur', async () => {
    const id = await pending();
    expect(await finishDocumentScan(worker, id, image)).toBe('done');
    expect(await row(id)).toEqual({
      av_status: 'clean',
      storage_key: `clean/${id}`,
      size_bytes: 2048,
      width: 800,
      height: 600,
      page_count: null,
      perceptual_hash: '-1234567890123456789',
      rejection_reason: null,
      checked: true,
    });
    expect(await audit(id)).toEqual([
      {
        action: 'document.scan.clean',
        actor_user_id: null,
        metadata: { document_type: 'identity_document', width: 800, height: 600 },
      },
    ]);
  });

  it('`clean` PDF : nombre de pages, ni dimensions ni empreinte perceptuelle', async () => {
    const id = await pending({ mime: 'application/pdf' });
    await finishDocumentScan(worker, id, {
      verdict: 'clean',
      sizeBytes: 4096,
      image: null,
      pageCount: 3,
    });
    expect(await row(id)).toMatchObject({ av_status: 'clean', page_count: 3, width: null });
  });

  it('`infected` : signature au journal, clé de quarantaine conservée pour mémoire', async () => {
    const id = await pending();
    await finishDocumentScan(worker, id, { verdict: 'infected', signature: 'Eicar-Signature' });
    expect(await row(id)).toMatchObject({ av_status: 'infected', storage_key: `quarantine/${id}` });
    expect((await audit(id))[0]).toMatchObject({
      action: 'document.scan.infected',
      metadata: { document_type: 'identity_document', signature: 'Eicar-Signature' },
    });
  });

  it.each(['dimensions', 'pages', 'unreadable', 'hash_mismatch'] as const)(
    '`rejected` (%s) : motif enregistré et journalisé',
    async (reason) => {
      const id = await pending();
      await finishDocumentScan(worker, id, { verdict: 'rejected', reason });
      expect(await row(id)).toMatchObject({ av_status: 'rejected', rejection_reason: reason });
      expect((await audit(id))[0]).toMatchObject({
        action: 'document.scan.rejected',
        metadata: { reason },
      });
    },
  );

  it('une seule fois : le second verdict est ignoré (`skipped`), sans journal', async () => {
    const id = await pending();
    await finishDocumentScan(worker, id, { verdict: 'error' });
    expect(await finishDocumentScan(worker, id, image)).toBe('skipped');
    expect(await row(id)).toMatchObject({ av_status: 'error', storage_key: `quarantine/${id}` });
    expect(await audit(id)).toHaveLength(1);
    await expect(finishDocumentScan(worker, 'pas-un-uuid', image)).rejects.toThrow(/invalide/);
  });

  it.each([
    ['verdict inconnu', `'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL`],
    ['`clean` sans taille', `'clean', NULL, NULL, 800, 600, NULL, 1, NULL`],
    ['`clean` taille > 50 Mo', `'clean', NULL, 52428801, NULL, NULL, 2, NULL, NULL`],
    ['`clean` sans dimensions ni pages', `'clean', NULL, 10, NULL, NULL, NULL, NULL, NULL`],
    ['`clean` image et pages', `'clean', NULL, 10, 800, 600, 2, 1, NULL`],
    ['`clean` image sans empreinte', `'clean', NULL, 10, 800, 600, NULL, NULL, NULL`],
    ['`clean` avec motif', `'clean', 'pages', 10, NULL, NULL, 2, NULL, NULL`],
    ['`infected` sans signature', `'infected', NULL, NULL, NULL, NULL, NULL, NULL, NULL`],
    [
      '`infected` signature hostile',
      `'infected', NULL, NULL, NULL, NULL, NULL, NULL, 'a b<script>'`,
    ],
    ['`rejected` sans motif', `'rejected', NULL, NULL, NULL, NULL, NULL, NULL, NULL`],
    ['`rejected` motif inconnu', `'rejected', 'autre', NULL, NULL, NULL, NULL, NULL, NULL`],
    ['`error` avec taille', `'error', NULL, 10, NULL, NULL, NULL, NULL, NULL`],
  ])('la base refuse un verdict incohérent : %s', async (_label, args) => {
    const id = await pending();
    await expect(
      worker.$queryRawUnsafe(`SELECT oz_document_scan_finish('${id}'::uuid, ${args})`),
    ).rejects.toThrow();
    expect(await row(id)).toMatchObject({ av_status: 'pending' });
  });
});

describe('cohérence avec le type vérifié à la réception', () => {
  it('dimensions sur un PDF ou pages sur une image : refusées', async () => {
    const pdf = await pending({ mime: 'application/pdf' });
    await expect(finishDocumentScan(worker, pdf, image)).rejects.toThrow(/type du document/);
    const png = await pending();
    await expect(
      finishDocumentScan(worker, png, {
        verdict: 'clean',
        sizeBytes: 10,
        image: null,
        pageCount: 2,
      }),
    ).rejects.toThrow(/type du document/);
    expect(await row(pdf)).toMatchObject({ av_status: 'pending' });
    expect(await row(png)).toMatchObject({ av_status: 'pending' });
  });
});

const duplicateOf = async (id: string): Promise<string | null> =>
  (
    await db.query<{ duplicate_of_id: string }>(
      'SELECT duplicate_of_id::text FROM document_duplicates WHERE document_id = $1',
      [id],
    )
  )[0]?.duplicate_of_id ?? null;

describe('doublons (D6)', () => {
  it('même SHA-256 chez un autre sujet : signal et journal, document quand même `clean`', async () => {
    const sha = 'ef'.repeat(32);
    const first = await pending({ player: ids.other ?? '', sha256: sha });
    const id = await pending({ sha256: sha });
    await finishDocumentScan(worker, id, image);
    expect(await row(id)).toMatchObject({ av_status: 'clean' });
    expect(await duplicateOf(id)).toBe(first);
    expect((await audit(id)).map((a) => a.action)).toEqual([
      'document.scan.clean',
      'document.scan.duplicate',
    ]);
    expect((await audit(id))[1]?.metadata).toEqual({ duplicate_of_id: first });
  });

  it('même SHA-256 chez le même sujet, document supprimé ou jugé dangereux : aucun signal', async () => {
    const sha = '01'.repeat(32);
    await pending({ sha256: sha });
    const removed = await pending({ player: ids.other ?? '', sha256: sha });
    await db.query('UPDATE documents SET deleted_at = now() WHERE id = $1', [removed]);
    const infected = await pending({ player: ids.other ?? '', sha256: sha });
    await finishDocumentScan(worker, infected, {
      verdict: 'infected',
      signature: 'Eicar-Signature',
    });
    const id = await pending({ sha256: sha });
    await finishDocumentScan(worker, id, image);
    expect(await duplicateOf(id)).toBeNull();
  });

  it('le signal n’est lisible par aucun utilisateur, pas même le titulaire', async () => {
    const sha = '02'.repeat(32);
    await pending({ player: ids.other ?? '', sha256: sha });
    const id = await pending({ sha256: sha });
    await finishDocumentScan(worker, id, image);
    expect(await duplicateOf(id)).not.toBeNull();
    for (const user of [ids.owner, ids.stranger]) {
      const seen = await app.as(user ?? '', (c) =>
        c.query('SELECT 1 FROM document_duplicates WHERE document_id = $1', [id]),
      );
      expect(seen.rows).toEqual([]);
    }
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'documents' AND column_name LIKE '%duplicate%'`,
    );
    expect(columns).toEqual([]);
  });
});

describe('garde et RLS', () => {
  it('un utilisateur ne lit pas le verdict d’un autre et ne modifie jamais un document', async () => {
    const id = await pending();
    const seen = await app.as(ids.stranger ?? '', (c) =>
      c.query('SELECT 1 FROM documents WHERE id = $1', [id]),
    );
    expect(seen.rows).toEqual([]);
    const own = await app.as(ids.owner ?? '', (c) =>
      c.query(`UPDATE documents SET width = 1, height = 1 WHERE id = $1`, [id]),
    );
    expect(own.rowCount).toBe(0);
  });

  it('verdict définitif et clé figée, même pour le propriétaire de la base', async () => {
    const id = await pending();
    await finishDocumentScan(worker, id, image);
    await expect(
      db.query(`UPDATE documents SET av_status = 'pending' WHERE id = $1`, [id]),
    ).rejects.toThrow(/définitif/);
    await expect(db.query(`UPDATE documents SET width = 10 WHERE id = $1`, [id])).rejects.toThrow(
      /définitif/,
    );
    await expect(
      db.query(`UPDATE documents SET storage_key = 'clean/autre' WHERE id = $1`, [id]),
    ).rejects.toThrow(/figés/);
  });

  it('hors verdict `clean`, la clé et la taille restent figées', async () => {
    const id = await pending();
    await expect(
      db.query(
        `UPDATE documents SET av_status = 'error', storage_key = 'clean/' || id WHERE id = $1`,
        [id],
      ),
    ).rejects.toThrow(/figés/);
    await expect(
      db.query(`UPDATE documents SET size_bytes = 1 WHERE id = $1`, [id]),
    ).rejects.toThrow(/figés/);
  });

  it('mesures d’analyse sans verdict : refusées', async () => {
    const id = await pending();
    await expect(
      db.query(`UPDATE documents SET page_count = 2 WHERE id = $1`, [id]),
    ).rejects.toThrow(/définitif/);
  });

  it('contraintes de table : motif ssi `rejected`, pages 1 à 20, dimensions par paire', async () => {
    for (const sql of [
      `UPDATE documents SET av_status = 'rejected' WHERE id = $1`,
      `UPDATE documents SET av_status = 'clean', storage_key = 'clean/' || id, page_count = 21 WHERE id = $1`,
      `UPDATE documents SET av_status = 'clean', storage_key = 'clean/' || id, width = 10 WHERE id = $1`,
      `UPDATE documents SET av_status = 'clean' WHERE id = $1`,
    ]) {
      const id = await pending();
      await expect(db.query(sql, [id])).rejects.toThrow(/violates check constraint/);
    }
  });
});

describe('déploiement', () => {
  it('rôle `oz_app` présent sans `oz_worker` (Terraform non appliqué) : migration refusée', async () => {
    const fresh = await startDatabase();
    try {
      await fresh.query('CREATE ROLE oz_app NOLOGIN NOSUPERUSER NOBYPASSRLS');
      await expect(fresh.exec('pnpm', ['exec', 'prisma', 'migrate', 'deploy'])).rejects.toThrow(
        /oz_worker/,
      );
    } finally {
      await fresh.stop();
    }
  }, 180_000);
});
