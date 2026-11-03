import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  claimDataExport,
  dataExportDownloadKey,
  expireDataExport,
  failDataExport,
  finishDataExport,
  listDueDataExports,
} from '../src/data-export-lifecycle.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  workerRoleUrl,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// Cycle de vie d'une demande d'export (lot 1.16bb, tâche 1) : prise, fin, échec, maintenance par le
// worker seul, téléchargement audité sous le contexte du titulaire.

let db: TestDatabase;
let app: AppConnection;
let worker: PrismaClient;
let api: PrismaClient;

const user = async (email: string, status = 'active'): Promise<string> => {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO users (email, status) VALUES ($1, $2) RETURNING id::text`,
    [email, status],
  );
  return row?.id ?? '';
};
const request = async (userId: string): Promise<string> => {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id::text`,
    [userId],
  );
  return row?.id ?? '';
};
const stateOf = async (requestId: string) => {
  const [row] = await db.query<{
    status: string;
    storage_key: string | null;
    failure_reason: string | null;
    days: number | null;
  }>(
    `SELECT status, storage_key, failure_reason,
       round(extract(epoch FROM expires_at - ready_at) / 86400)::int AS days
     FROM data_export_requests WHERE id = $1`,
    [requestId],
  );
  return row;
};
const auditOf = (requestId: string) =>
  db.query<{ action: string; actor: string | null; reason: string | null }>(
    `SELECT action, actor_user_id::text AS actor, metadata->>'reason' AS reason FROM audit_log
     WHERE metadata->>'request_id' = $1 ORDER BY created_at, chain_position`,
    [requestId],
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
}, 240_000);

afterAll(async () => {
  await worker.$disconnect();
  await api.$disconnect();
  await app.end();
  await db.stop();
});

describe('cycle de vie (worker)', () => {
  it('pending → processing → ready, 7 jours, clé exports/<id>.json, audité ; rejeu sans effet', async () => {
    const owner = await user('cycle@example.test');
    const req = await request(owner);
    expect(await finishDataExport(worker, req)).toBe('pending');
    expect(await claimDataExport(worker, req)).toBe(owner);
    expect(await claimDataExport(worker, req)).toBe(owner);
    expect(await finishDataExport(worker, req)).toBe('done');
    expect(await stateOf(req)).toEqual({
      status: 'ready',
      storage_key: `exports/${req}.json`,
      failure_reason: null,
      days: 7,
    });
    expect(await finishDataExport(worker, req)).toBe('ready');
    expect(await claimDataExport(worker, req)).toBeNull();
    expect(await failDataExport(worker, req, 'build_failed')).toBe('ready');
    expect(await auditOf(req)).toEqual([
      { action: 'data.export.ready', actor: null, reason: null },
    ]);
  });

  it('échec avec motif interne, audité ; identifiant invalide ignoré', async () => {
    const req = await request(await user('echec@example.test'));
    expect(await failDataExport(worker, req, 'account_gone')).toBe('done');
    expect(await stateOf(req)).toMatchObject({ status: 'failed', failure_reason: 'account_gone' });
    expect(await claimDataExport(worker, req)).toBeNull();
    expect(await auditOf(req)).toEqual([
      { action: 'data.export.failed', actor: null, reason: 'account_gone' },
    ]);
    expect(await claimDataExport(worker, 'pas-un-uuid')).toBeNull();
    await expect(failDataExport(worker, req, 'Motif Libre' as 'abandoned')).rejects.toThrow(
      /motif/,
    );
  });

  it('compte suspendu à la prise, supprimé avant la fin : `failed` account_gone, audité', async () => {
    const suspended = await user('suspendu@example.test', 'suspended');
    const early = await request(suspended);
    expect(await claimDataExport(worker, early)).toBeNull();
    expect(await stateOf(early)).toMatchObject({
      status: 'failed',
      failure_reason: 'account_gone',
    });

    const owner = await user('parti@example.test');
    const late = await request(owner);
    expect(await claimDataExport(worker, late)).toBe(owner);
    await db.query('UPDATE users SET deleted_at = now() WHERE id = $1', [owner]);
    expect(await finishDataExport(worker, late)).toBe('account_gone');
    expect(await stateOf(late)).toMatchObject({ status: 'failed', storage_key: null });
    expect((await auditOf(late)).map((a) => a.action)).toEqual(['data.export.failed']);
  });

  it('maintenance : expire, remet en file, abandonne ; expiration auditée', async () => {
    const ready = await request(await user('echue@example.test'));
    await claimDataExport(worker, ready);
    await finishDataExport(worker, ready);
    const stale = await request(await user('oubliee@example.test'));
    const abandoned = await request(await user('abandonnee@example.test'));
    const fresh = await request(await user('recente@example.test'));
    expect(await expireDataExport(worker, ready)).toBe(false);
    await db.query(
      `UPDATE data_export_requests SET ready_at = now() - interval '8 days', expires_at = now() - interval '1 minute' WHERE id = $1`,
      [ready],
    );
    await db.query(
      `UPDATE data_export_requests SET updated_at = now() - interval '31 minutes' WHERE id = $1`,
      [stale],
    );
    await db.query(
      `UPDATE data_export_requests SET requested_at = now() - interval '25 hours',
         updated_at = now() - interval '25 hours' WHERE id = $1`,
      [abandoned],
    );

    const due = await listDueDataExports(worker, 500);
    expect(due).toEqual(
      expect.arrayContaining([
        { id: ready, action: 'expire' },
        { id: stale, action: 'requeue' },
        { id: abandoned, action: 'fail' },
      ]),
    );
    expect(due.map((d) => d.id)).not.toContain(fresh);
    // Remise en file : `updated_at` repoussé, pas rendue au balayage suivant.
    expect((await listDueDataExports(worker, 500)).map((d) => d.id)).not.toContain(stale);

    expect(await expireDataExport(worker, ready)).toBe(true);
    expect(await stateOf(ready)).toMatchObject({ status: 'expired', storage_key: null });
    expect((await auditOf(ready)).map((a) => a.action)).toEqual([
      'data.export.ready',
      'data.export.expired',
    ]);
    await expect(listDueDataExports(worker, 0)).rejects.toThrow(/lot/);
  });

  it('refusé à oz_app et sous un contexte utilisateur', async () => {
    const owner = await user('droits@example.test');
    const req = await request(owner);
    for (const sql of [
      `SELECT oz_data_export_claim('${req}')`,
      `SELECT oz_data_export_finish('${req}')`,
      `SELECT oz_data_export_fail('${req}', 'abandoned')`,
      `SELECT * FROM oz_data_export_due(1)`,
      `SELECT oz_data_export_expire('${req}')`,
      `SELECT * FROM oz_personal_data_export('${owner}', '${'k'.repeat(40)}')`,
    ]) {
      await expect(
        app.as(owner, (c) => c.query(sql)),
        sql,
      ).rejects.toThrow(/permission denied/);
    }
    await expect(
      worker.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('oz.user_id', ${owner}, true)`;
        return claimDataExport(tx, req);
      }),
    ).rejects.toThrow(/réservé au worker/);
    await expect(worker.$queryRaw`SELECT oz_data_export_download()`).rejects.toThrow(
      /permission denied/,
    );
  });

  it('contraintes : clé hors exports/<id>.json et motif libre refusés', async () => {
    const req = await request(await user('contraintes@example.test'));
    await expect(
      db.query(
        `UPDATE data_export_requests SET status = 'ready', storage_key = 'clean/x', ready_at = now(),
           expires_at = now() + interval '7 days' WHERE id = $1`,
        [req],
      ),
    ).rejects.toThrow(/data_export_requests_storage_key_check/);
    await expect(
      db.query(
        `UPDATE data_export_requests SET status = 'failed', failure_reason = 'Erreur : x' WHERE id = $1`,
        [req],
      ),
    ).rejects.toThrow(/data_export_requests_failure_reason_check/);
  });
});

describe('téléchargement (API)', () => {
  it('clé de sa seule archive prête et non échue, auditée ; null sinon', async () => {
    const owner = await user('telecharge@example.test');
    const other = await user('autre@example.test');
    const download = (userId: string) =>
      withUserContext(api, userId, (tx) => dataExportDownloadKey(tx));
    const req = await request(owner);
    expect(await download(owner)).toBeNull();
    await claimDataExport(worker, req);
    await finishDataExport(worker, req);

    expect(await download(owner)).toBe(`exports/${req}.json`);
    expect(await download(other)).toBeNull();
    const downloads = await db.query<{ actor: string; target: string }>(
      `SELECT actor_user_id::text AS actor, target_id::text AS target FROM audit_log
       WHERE action = 'data.export.downloaded'`,
    );
    expect(downloads).toEqual([{ actor: owner, target: owner }]);

    await db.query(`UPDATE users SET status = 'suspended' WHERE id = $1`, [owner]);
    expect(await download(owner)).toBeNull();
    await db.query(`UPDATE users SET status = 'active' WHERE id = $1`, [owner]);
    await db.query(
      `UPDATE data_export_requests SET ready_at = now() - interval '8 days', expires_at = now() - interval '1 second' WHERE id = $1`,
      [req],
    );
    expect(await download(owner)).toBeNull();
    await expect(app.as(null, (c) => c.query('SELECT oz_data_export_download()'))).rejects.toThrow(
      /compte requis/,
    );
  });
});
