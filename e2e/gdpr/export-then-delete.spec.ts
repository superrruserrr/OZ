import { createRequire } from 'node:module';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { login, registerAndConfirm, syntheticEmail, syntheticPassword } from '../auth/flows.js';

// Parcours n° 9 (design.md §7.5, EX-118 n° 2 et n° 3) : un titulaire exporte ses données, télécharge
// l'archive, demande la suppression de son compte ; l'échéance est avancée en base (rétractation
// simulée), le passage du worker est déclenché par un job dans sa file. Variante : le tuteur
// demande la suppression de la fiche de son enfant mineur (lot 1.16cbb).

// `pg` n'est dépendance que de l'API, BullMQ et ioredis que du worker : résolus depuis eux.
const fromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const fromWorker = createRequire(new URL('../../apps/worker/package.json', import.meta.url));
interface SqlClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
const pg = fromApi('pg') as {
  Client: new (config: { connectionString: string | undefined }) => SqlClient;
};
interface RedisConnection {
  quit(): Promise<unknown>;
}
const Redis = fromWorker('ioredis') as {
  Redis: new (url: string, options: { maxRetriesPerRequest: null }) => RedisConnection;
};
const bullmq = fromWorker('bullmq') as {
  Queue: new (
    name: string,
    options: { connection: RedisConnection },
  ) => {
    add(name: string, data: object): Promise<unknown>;
    close(): Promise<void>;
  };
};

const env = (name: string): string => {
  const value = process.env[name];
  if (value === undefined) throw new Error(`${name} absent (global setup)`);
  return value;
};

/** Attend `check` jusqu'à 60 s. */
async function until<T>(check: () => Promise<T | undefined>, what: string): Promise<T> {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`délai dépassé : ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

let db: SqlClient;
test.beforeAll(async () => {
  db = new pg.Client({ connectionString: env('E2E_DATABASE_URL') });
  await db.connect();
});
test.afterAll(async () => {
  await db.end();
});

/** Compte inscrit et connecté ; jeton d'accès. */
async function signedIn(api: APIRequestContext, email: string, password: string) {
  await registerAndConfirm(api, email, password);
  const session = await login(api, email, password);
  expect(session.status()).toBe(200);
  const { accessToken } = (await session.json()) as { accessToken: string };
  const [user] = (await db.query('SELECT id FROM users WHERE email = $1', [email])).rows as {
    id: string;
  }[];
  if (user === undefined) throw new Error('compte introuvable');
  return { userId: user.id, auth: { Authorization: `Bearer ${accessToken}` } };
}

/** Fiche joueur posée en base et OZ ID émis par un administrateur (back-office non livré). */
async function playerWithOzId(fields: {
  userId: string | null;
  birthDate: string;
  guardianId?: string | undefined;
}): Promise<{ id: string; ozId: string }> {
  const [issuer] = (
    await db.query(`INSERT INTO users (email, email_verified_at) VALUES ($1, now()) RETURNING id`, [
      syntheticEmail(),
    ])
  ).rows as { id: string }[];
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin')`, [issuer?.id]);
  const [player] = (
    await db.query(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, city,
         guardian_id)
       VALUES ($1, 'Joueur', 'Synthétique', $2::date, 'CM', 'CM', 'Douala', $3) RETURNING id`,
      [fields.userId, fields.birthDate, fields.guardianId ?? null],
    )
  ).rows as { id: string }[];
  await db.query('BEGIN');
  await db.query(`SELECT set_config('oz.user_id', $1, true)`, [issuer?.id]);
  const [issued] = (
    await db.query('SELECT oz_issue_oz_id($1, $2) AS oz_id', [
      player?.id,
      String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0'),
    ])
  ).rows as { oz_id: string }[];
  await db.query('COMMIT');
  if (player === undefined || issued === undefined) throw new Error('fiche non créée');
  return { id: player.id, ozId: issued.oz_id };
}

/** Échéance avancée (rétractation simulée), puis passage du worker ; attend l'issue `done`. */
async function runDeletion(requestColumn: 'user_id' | 'player_id', id: string): Promise<string> {
  const [request] = (
    await db.query(
      `UPDATE account_deletion_requests SET requested_at = now() - interval '31 days',
         scheduled_for = now() - interval '1 minute'
       WHERE ${requestColumn} = $1 AND status = 'pending' RETURNING id`,
      [id],
    )
  ).rows as { id: string }[];
  if (request === undefined) throw new Error('aucune demande en attente');
  const connection = new Redis.Redis(env('E2E_REDIS_URL'), { maxRetriesPerRequest: null });
  const queue = new bullmq.Queue('account-deletion', { connection });
  try {
    await queue.add('anonymize-due', {});
  } finally {
    await queue.close();
    await connection.quit();
  }
  await until(async () => {
    const [row] = (
      await db.query('SELECT status FROM account_deletion_requests WHERE id = $1', [request.id])
    ).rows as { status: string }[];
    return row?.status === 'done' ? row.status : undefined;
  }, 'anonymisation');
  return request.id;
}

/** Tables de la base dont une ligne contient `needle` (balayage de chaque ligne en texte). */
async function tablesContaining(needle: string): Promise<string[]> {
  const tables = (
    await db.query(
      `SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
    )
  ).rows as { name: string }[];
  const found: string[] = [];
  for (const { name } of tables) {
    const [hit] = (
      await db.query(
        `SELECT EXISTS (SELECT 1 FROM ${name} t WHERE strpos(t::text, $1) > 0) AS hit`,
        [needle],
      )
    ).rows as { hit: boolean }[];
    if (hit?.hit === true) found.push(name);
  }
  return found;
}

test('export → téléchargement → suppression → anonymisation vérifiée', async ({ request }) => {
  const email = syntheticEmail();
  const password = syntheticPassword();
  const { userId, auth } = await signedIn(request, email, password);
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'player')`, [userId]);
  const fiche = await playerWithOzId({ userId, birthDate: '1995-03-04' });

  // 1. Export : demande ré-authentifiée, archive produite par le worker, puis téléchargée.
  expect(
    (await request.post('/account/data-export', { headers: auth, data: { password } })).status(),
  ).toBe(202);
  await until(async () => {
    const status = await request.get('/account/data-export', { headers: auth });
    const { latest } = (await status.json()) as { latest: { status: string } | null };
    return latest?.status === 'ready' ? latest : undefined;
  }, 'archive prête');
  const download = await request.get('/account/data-export/download', { headers: auth });
  expect(download.status()).toBe(200);
  const { url } = (await download.json()) as { url: string };
  const archive = await request.get(url);
  expect(archive.status()).toBe(200);
  expect(await archive.text()).toContain(email);

  // 2. Suppression : 202 à +30 jours, puis échéance avancée et passage du worker.
  const asked = await request.post('/account/deletion', { headers: auth, data: { password } });
  expect(asked.status()).toBe(202);
  const requestId = await runDeletion('user_id', userId);

  // 3. Connexion refusée, email absent de toute table, OZ ID gardé, audit de l'exécution.
  expect((await login(request, email, password)).status()).toBe(401);
  expect(await tablesContaining(email)).toEqual([]);
  const [kept] = (await db.query('SELECT oz_id, first_name FROM players WHERE id = $1', [fiche.id]))
    .rows as { oz_id: string | null; first_name: string }[];
  expect(kept).toEqual({ oz_id: fiche.ozId, first_name: 'Anonyme' });
  const audit = (
    (
      await db.query(
        `SELECT action FROM audit_log WHERE target_id = $1 AND metadata ->> 'request_id' = $2`,
        [userId, requestId],
      )
    ).rows as { action: string }[]
  ).map((row) => row.action);
  expect(audit).toEqual(
    expect.arrayContaining(['account.deletion.requested', 'account.deletion.done']),
  );
});

test('tuteur : fiche de l’enfant anonymisée, compte du tuteur intact', async ({ request }) => {
  const email = syntheticEmail();
  const password = syntheticPassword();
  const { userId, auth } = await signedIn(request, email, password);
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'guardian')`, [userId]);
  const [guardian] = (
    await db.query(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country,
         verification_status)
       VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
      [userId],
    )
  ).rows as { id: string }[];
  const child = await playerWithOzId({
    userId: null,
    birthDate: '2014-06-07',
    guardianId: guardian?.id,
  });

  const asked = await request.post(`/players/${child.ozId}/deletion`, {
    headers: auth,
    data: { password },
  });
  expect(asked.status()).toBe(202);
  await runDeletion('player_id', child.id);

  const [anonymized] = (
    await db.query(
      'SELECT oz_id, first_name, deleted_at IS NOT NULL AS deleted FROM players WHERE id = $1',
      [child.id],
    )
  ).rows as { oz_id: string | null; first_name: string; deleted: boolean }[];
  expect(anonymized).toEqual({ oz_id: child.ozId, first_name: 'Anonyme', deleted: true });
  expect((await login(request, email, password)).status()).toBe(200);
});
