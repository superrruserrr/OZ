import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  auditChainHead,
  checkAuditChain,
  latestAuditCheck,
  listAuditLog,
  maintainAuditPartitions,
} from '../src/audit-journal.js';
import { createDbClient, type PrismaClient } from '../src/client.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
  workerRoleUrl,
} from './database.js';

// Journal d'audit (lot 1.16a, tâche 1) : partitions entretenues (D-057), tête ancrable et
// vérification contre l'ancre (CP-23, D-060), consultation réservée à l'administrateur vérifié.

let db: TestDatabase;
let worker: PrismaClient;
/** Connexion de l'API (`oz_app`) : aucune fonction du worker, lecture sous la RLS. */
let api: PrismaClient;
let app: AppConnection;
let ids: Record<'admin' | 'player', string>;

const one = async <T extends object>(sql: string, values: unknown[] = []): Promise<T> => {
  const [row] = await db.query<T & Record<string, unknown>>(sql, values);
  if (row === undefined) throw new Error(`aucune ligne : ${sql}`);
  return row;
};

async function record(action: string, targetType = 'player', actor: string | null = null) {
  await db.query(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason)
     VALUES ($1, $2, $3, oz_uuid_v7(), 'motif de test')`,
    [actor, action, targetType],
  );
}

/** Altération directe, comme un administrateur de la base : déclencheurs coupés. */
async function tamper(sql: string, values: unknown[] = []): Promise<void> {
  const client = new pg.Client({ connectionString: db.url });
  await client.connect();
  try {
    await client.query('SET session_replication_role = replica');
    await client.query(sql, values);
  } finally {
    await client.end();
  }
}

const asAdmin = <T>(fn: Parameters<typeof withUserContext<T>>[2]) =>
  withUserContext(api, ids.admin, fn);
const asPlayer = <T>(fn: Parameters<typeof withUserContext<T>>[2]) =>
  withUserContext(api, ids.player, fn);

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  worker = createDbClient(await workerRoleUrl(db));
  app = await connectAsAppRole(db);
  const apiUrl = new URL(db.url);
  apiUrl.username = 'oz_app_test';
  apiUrl.password = 'oz_app_test';
  api = createDbClient(apiUrl.toString());
  const user = async (email: string, role: string): Promise<string> => {
    const { id } = await one<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [
      email,
    ]);
    await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2::role_kind)`, [id, role]);
    return id;
  };
  ids = {
    admin: await user('admin-journal@example.test', 'admin'),
    player: await user('joueur-journal@example.test', 'player'),
  };
  await record('kyc.case.transitioned', 'kyc_case', ids.admin);
  await record('document.read.granted', 'document', ids.player);
  await record('account.role.changed', 'user', ids.admin);
}, 180_000);

afterAll(async () => {
  await worker.$disconnect();
  await api.$disconnect();
  await app.end();
  await db.stop();
});

describe('droits (EX-T11 n° 5)', () => {
  it('fonctions du worker refusées à l’API et sous contexte utilisateur', async () => {
    await expect(maintainAuditPartitions(api)).rejects.toThrow(/permission denied/);
    await expect(auditChainHead(api)).rejects.toThrow(/permission denied/);
    await expect(checkAuditChain(api, null)).rejects.toThrow(/permission denied/);
    await expect(
      withUserContext(worker, ids.admin, (tx) => maintainAuditPartitions(tx)),
    ).rejects.toThrow(/réservé au worker/);
    await expect(withUserContext(worker, ids.admin, (tx) => auditChainHead(tx))).rejects.toThrow(
      /réservée au worker/,
    );
    await expect(
      withUserContext(worker, ids.admin, (tx) => checkAuditChain(tx, null)),
    ).rejects.toThrow(/réservée au worker/);
  });

  it('aucun rôle applicatif ne modifie ni ne supprime le journal ou ses vérifications', async () => {
    await checkAuditChain(worker, null);
    for (const sql of [
      `UPDATE audit_log SET reason = 'réécrit'`,
      'DELETE FROM audit_log',
      'UPDATE audit_chain_checks SET defect_position = 1',
      'DELETE FROM audit_chain_checks',
      'TRUNCATE audit_chain_checks',
    ]) {
      // Rôle applicatif avec les droits d'écriture de la recette : refusé, ou aucune ligne atteinte
      // (aucune politique UPDATE ni DELETE).
      const outcome = await app
        .as(ids.admin, (client) => client.query(sql))
        .then((result) => result.rowCount ?? 0)
        .catch((error: unknown) => String(error));
      if (typeof outcome === 'number') expect(outcome).toBe(0);
      else expect(outcome).toMatch(/immuable|permission denied/);
    }
    for (const sql of [
      `UPDATE audit_log SET reason = 'réécrit'`,
      'DELETE FROM audit_log',
      'UPDATE audit_chain_checks SET defect_position = 1',
      'DELETE FROM audit_chain_checks',
    ]) {
      await expect(db.query(sql)).rejects.toThrow(/immuable/);
    }
    await expect(
      asAdmin((tx) => tx.$executeRaw`INSERT INTO audit_chain_checks (head_position) VALUES (0)`),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('partitions (D-057)', () => {
  it('recrée une partition manquante et compte les entrées tombées dans la partition par défaut', async () => {
    const last = await one<{ name: string }>(
      `SELECT format('audit_log_%s', to_char(date_trunc('month', now() AT TIME ZONE 'UTC')
         + interval '3 months', 'YYYY_MM')) AS name`,
    );
    await db.query(`ALTER TABLE audit_log DETACH PARTITION ${last.name}`);
    await db.query(`DROP TABLE ${last.name}`);
    expect(await maintainAuditPartitions(worker)).toEqual({
      defaultRows: 0,
      failedMonths: 0,
      errorCode: null,
    });
    expect(
      (await one<{ t: string | null }>('SELECT to_regclass($1)::text AS t', [last.name])).t,
    ).toBe(last.name);

    // Entrée d'un mois lointain sans partition : elle tombe dans la partition par défaut.
    await tamper(
      `INSERT INTO audit_log (action, target_type, reason, created_at)
       VALUES ('test.default.used', 'test', 'hors partition', '2100-01-01T00:00:00Z')`,
    );
    expect(await maintainAuditPartitions(worker)).toEqual({
      defaultRows: 1,
      failedMonths: 0,
      errorCode: null,
    });
    await tamper(`DELETE FROM audit_log_default`);
  });

  it('un mois bloqué par la partition par défaut n’empêche pas les suivants ; code d’erreur rendu', async () => {
    const months = await db.query<{ name: string; start: string }>(
      `SELECT format('audit_log_%s', to_char(m, 'YYYY_MM')) AS name, to_char(m, 'YYYY-MM-DD') AS start
       FROM generate_series(date_trunc('month', now() AT TIME ZONE 'UTC') + interval '2 months',
         date_trunc('month', now() AT TIME ZONE 'UTC') + interval '3 months', interval '1 month') m`,
    );
    for (const { name } of months) {
      await db.query(`ALTER TABLE audit_log DETACH PARTITION ${name}`);
      await db.query(`DROP TABLE ${name}`);
    }
    // Entrée du mois +2 tombée dans la partition par défaut : ce mois ne peut plus être créé.
    await tamper(
      `INSERT INTO audit_log (action, target_type, reason, created_at)
       VALUES ('test.default.used', 'test', 'mois bloqué', $1::date + interval '1 day')`,
      [months[0]?.start],
    );
    expect(await maintainAuditPartitions(worker)).toEqual({
      defaultRows: 1,
      failedMonths: 1,
      errorCode: '23514',
    });
    const exists = async (name: string) =>
      (await one<{ t: string | null }>('SELECT to_regclass($1)::text AS t', [name])).t;
    expect(await exists(months[0]?.name ?? '')).toBeNull();
    expect(await exists(months[1]?.name ?? '')).toBe(months[1]?.name);
    // Remise en état : l'entrée retirée, le mois recréé.
    await tamper(`DELETE FROM audit_log_default`);
    expect((await maintainAuditPartitions(worker)).failedMonths).toBe(0);
  });
});

describe('consultation (EX-118 n° 1)', () => {
  it('l’administrateur lit tout le journal, du plus récent au plus ancien, page par page', async () => {
    const first = await asAdmin((tx) => listAuditLog(tx, { limit: 2 }));
    expect(first.entries).toHaveLength(2);
    expect(first.entries[0]?.position).toBeGreaterThan(first.entries[1]?.position ?? 0);
    expect(first.entries[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.nextBefore).toBe(first.entries[1]?.position);
    const rest = await asAdmin((tx) =>
      listAuditLog(tx, { limit: 100, before: first.nextBefore ?? undefined }),
    );
    expect(rest.nextBefore).toBeNull();
    expect(rest.entries.every((e) => e.position < (first.nextBefore ?? 0))).toBe(true);
  });

  it('filtres appliqués en base : action, type et identifiant de cible, acteur, période', async () => {
    const byAction = await asAdmin((tx) =>
      listAuditLog(tx, { limit: 100, action: 'document.read.granted' }),
    );
    expect(byAction.entries.map((e) => e.action)).toEqual(['document.read.granted']);
    const byActor = await asAdmin((tx) => listAuditLog(tx, { limit: 100, actorUserId: ids.admin }));
    expect(byActor.entries.map((e) => e.action).sort()).toEqual([
      'account.role.changed',
      'kyc.case.transitioned',
    ]);
    const target = byActor.entries[0];
    const byTarget = await asAdmin((tx) =>
      listAuditLog(tx, {
        limit: 100,
        targetType: target?.targetType,
        targetId: target?.targetId ?? undefined,
      }),
    );
    expect(byTarget.entries.map((e) => e.id)).toEqual([target?.id]);
    const future = await asAdmin((tx) =>
      listAuditLog(tx, { limit: 100, from: new Date('2099-01-01T00:00:00Z') }),
    );
    expect(future.entries).toEqual([]);
    const past = await asAdmin((tx) =>
      listAuditLog(tx, { limit: 100, to: new Date('2000-01-01T00:00:00Z') }),
    );
    expect(past.entries).toEqual([]);
  });

  it('un autre rôle ne lit rien ; bornes et identifiants refusés avant la base', async () => {
    expect((await asPlayer((tx) => listAuditLog(tx, { limit: 100 }))).entries).toEqual([]);
    expect(await asPlayer((tx) => latestAuditCheck(tx))).toBeNull();
    await expect(listAuditLog(api, { limit: 0 })).rejects.toThrow(/page/);
    await expect(listAuditLog(api, { limit: 101 })).rejects.toThrow(/page/);
    await expect(listAuditLog(api, { limit: 1, before: 0 })).rejects.toThrow(/curseur/);
    await expect(listAuditLog(api, { limit: 1, targetId: 'x' })).rejects.toThrow(/UUID/);
    await expect(listAuditLog(api, { limit: 1, from: new Date('x') })).rejects.toThrow(/date/);
  });
});

describe('tête et vérification (CP-23, D-060)', () => {
  it('tête lisible par le worker, conforme à la dernière entrée', async () => {
    const head = await auditChainHead(worker);
    const last = await one<{ position: string; hash: string }>(
      `SELECT chain_position::text AS position, encode(hash, 'hex') AS hash FROM audit_log
       ORDER BY chain_position DESC LIMIT 1`,
    );
    expect(head).toEqual({ position: Number(last.position), hash: last.hash });
  });

  it('chaîne intègre et conforme à l’ancre : aucun défaut, résultat consigné et lu par l’admin', async () => {
    expect(await checkAuditChain(worker, null)).toMatchObject({
      anchorPosition: null,
      defectPosition: null,
    });
    const head = await auditChainHead(worker);
    const check = await checkAuditChain(worker, head);
    expect(check).toMatchObject({
      headPosition: head.position,
      anchorPosition: head.position,
      defectPosition: null,
    });
    expect(await asAdmin((tx) => latestAuditCheck(tx))).toEqual(check);
  });

  it('ancre en recul (la dernière effacée au stockage) : l’ancre disparue reste en défaut', async () => {
    const head = await auditChainHead(worker);
    expect((await checkAuditChain(worker, null)).defectPosition).toBe(head.position);
    await record('test.chain.advanced', 'test');
    const first = await one<{ hash: string }>(
      `SELECT encode(hash, 'hex') AS hash FROM audit_log WHERE chain_position = 1`,
    );
    expect((await checkAuditChain(worker, { position: 1, hash: first.hash })).defectPosition).toBe(
      head.position,
    );
    // Une ancre au moins aussi avancée, relue, lève le défaut.
    expect((await checkAuditChain(worker, await auditChainHead(worker))).defectPosition).toBeNull();
  });

  it('ancre au-delà de la tête : chaîne tronquée, première position manquante en défaut', async () => {
    const head = await auditChainHead(worker);
    expect(
      (await checkAuditChain(worker, { position: head.position + 5, hash: head.hash }))
        .defectPosition,
    ).toBe(head.position + 1);
  });

  it('ancre contredite (réécriture complète et cohérente) : position ancrée en défaut', async () => {
    const head = await auditChainHead(worker);
    expect(
      (await checkAuditChain(worker, { position: head.position, hash: 'ab'.repeat(32) }))
        .defectPosition,
    ).toBe(head.position);
  });

  it('ancre hors format refusée avant la base', async () => {
    await expect(checkAuditChain(worker, { position: 0, hash: 'ab'.repeat(32) })).rejects.toThrow(
      /ancre/,
    );
    await expect(checkAuditChain(worker, { position: 1, hash: 'zz' })).rejects.toThrow(/ancre/);
  });

  it('entrée altérée : sa position est désignée', async () => {
    const target = await one<{ position: string }>(
      'SELECT min(chain_position)::text AS position FROM audit_log',
    );
    await tamper(`UPDATE audit_log SET reason = 'réécrit' WHERE chain_position = $1`, [
      target.position,
    ]);
    expect((await checkAuditChain(worker, null)).defectPosition).toBe(Number(target.position));
  });
});

describe('propriétaire non superutilisateur, comme oz_migrator en recette', () => {
  const FUNCTIONS = [
    'oz_audit_maintain_partitions()',
    'oz_audit_head()',
    'oz_audit_check(bigint, bytea)',
  ];

  it('les fonctions passent la RLS forcée par leurs seules politiques privilégiées', async () => {
    await db.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'oz_owner_test') THEN
        CREATE ROLE oz_owner_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
      END IF; END $$`);
    await db.query('GRANT USAGE ON SCHEMA public TO oz_owner_test');
    await db.query('GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO oz_owner_test');
    // En recette, le propriétaire (oz_migrator) possède aussi ces fonctions : droit d'exécution.
    await db.query('GRANT EXECUTE ON FUNCTION oz_audit_verify_chain() TO oz_owner_test');
    await db.query('GRANT EXECUTE ON FUNCTION oz_has_verified_role(role_kind[]) TO oz_owner_test');
    for (const fn of FUNCTIONS) await db.query(`ALTER FUNCTION ${fn} OWNER TO oz_owner_test`);
    // Tête de chaîne : RLS active mais non forcée, lue par son propriétaire, comme en recette.
    await db.query('ALTER TABLE audit_chain_state OWNER TO oz_owner_test');
    try {
      // Chaîne remise en état après l'altération précédente : on vérifie les droits, pas le défaut.
      expect(await maintainAuditPartitions(worker)).toEqual({
        defaultRows: 0,
        failedMonths: 0,
        errorCode: null,
      });
      const head = await auditChainHead(worker);
      const check = await checkAuditChain(worker, head);
      expect(check.headPosition).toBe(head.position);
      // L'entrée altérée plus haut reste en défaut : la chaîne entière a bien été lue.
      expect(check.defectPosition).not.toBeNull();
    } finally {
      for (const fn of FUNCTIONS) await db.query(`ALTER FUNCTION ${fn} OWNER TO CURRENT_USER`);
      await db.query('ALTER TABLE audit_chain_state OWNER TO CURRENT_USER');
    }
  });
});
