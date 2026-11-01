import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startDatabase, testPool, type TestDatabase } from './database.js';

// Journal d'audit immuable et chaîné (EX-T11, CP-23 ; décision D4 du lot 1.1).
let db: TestDatabase;
let actor: string;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const [user] = await db.query<{ id: string }>(
    `INSERT INTO users (email) VALUES ('auditeur@example.test') RETURNING id`,
  );
  actor = user?.id ?? '';
});
afterAll(async () => {
  await db.stop();
});

async function record(action = 'kyc.case.transitioned', reason = 'motif'): Promise<string> {
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO audit_log (actor_user_id, action, target_type, target_id, reason, request_id)
     VALUES ($1, $2, 'player', oz_uuid_v7(), $3, 'req-test') RETURNING id`,
    [actor, action, reason],
  );
  return row?.id ?? '';
}

const brokenAt = async (): Promise<string | null> =>
  (await db.query<{ broken: string | null }>('SELECT oz_audit_verify_chain()::text AS broken'))[0]
    ?.broken ?? null;

/** Altération directe, comme le ferait un administrateur de la base : déclencheurs coupés. */
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

describe('contenu de chaque entrée (EX-T11 n° 2)', () => {
  it('acteur, action, cible, motif, horodatage serveur, requestId, hash précédent', async () => {
    const id = await record();
    const [row] = await db.query<Record<string, unknown>>('SELECT * FROM audit_log WHERE id = $1', [
      id,
    ]);
    expect(row).toMatchObject({
      actor_user_id: actor,
      action: 'kyc.case.transitioned',
      target_type: 'player',
      reason: 'motif',
      request_id: 'req-test',
    });
    expect(row?.created_at).toBeInstanceOf(Date);
    expect((row?.hash as Buffer).length).toBe(32);
    expect((row?.prev_hash as Buffer).length).toBe(32);
  });

  it('ignore la position et les hachages fournis par le client', async () => {
    const [row] = await db.query<{ hash: Buffer; chain_position: string }>(
      `INSERT INTO audit_log (actor_user_id, action, target_type, reason, hash, prev_hash, chain_position)
       VALUES ($1, 'user.role.changed', 'user', 'motif', '\\x00', '\\x00', 1)
       RETURNING hash, chain_position`,
      [actor],
    );
    expect(row?.hash.length).toBe(32);
    expect(Number(row?.chain_position)).toBeGreaterThan(1);
    expect(await brokenAt()).toBeNull();
  });

  it('refuse un horodatage fourni par le client', async () => {
    await expect(
      db.query(
        `INSERT INTO audit_log (actor_user_id, action, target_type, reason, created_at)
         VALUES ($1, 'user.role.changed', 'user', 'motif', '2000-01-01')`,
        [actor],
      ),
    ).rejects.toThrow(/horodatage/);
  });

  it('refuse une action hors convention et un motif vide', async () => {
    await expect(record('Pas Une Action')).rejects.toThrow(/check constraint/);
    await expect(record('kyc.case.transitioned', '  ')).rejects.toThrow(/check constraint/);
  });
});

describe('chaîne de hachage (EX-T11 n° 3, CP-23)', () => {
  it('une chaîne intacte se vérifie', async () => {
    for (let i = 0; i < 5; i++) await record();
    expect(await brokenAt()).toBeNull();
  });

  it('50 insertions concurrentes produisent une chaîne valide', async () => {
    const pool = testPool({ connectionString: db.url, max: 10 });
    try {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          pool.query(
            `INSERT INTO audit_log (actor_user_id, action, target_type, reason)
             VALUES ($1, 'kyc.case.transitioned', 'player', $2)`,
            [actor, `concurrence ${String(i)}`],
          ),
        ),
      );
    } finally {
      await pool.end();
    }
    expect(await brokenAt()).toBeNull();
  });

  it('détecte une entrée modifiée', async () => {
    const id = await record();
    await record();
    await tamper(`UPDATE audit_log SET reason = 'réécrit' WHERE id = $1`, [id]);
    expect(await brokenAt()).not.toBeNull();
    await tamper(`UPDATE audit_log SET reason = 'motif' WHERE id = $1`, [id]);
    expect(await brokenAt()).toBeNull();
  });

  it('détecte une entrée supprimée au milieu et une entrée finale supprimée', async () => {
    const middle = await record();
    await record();
    // Copie en SQL : un aller-retour par JavaScript tronquerait l'horodatage à la milliseconde.
    await tamper('CREATE TABLE audit_backup AS SELECT * FROM audit_log WHERE id = $1', [middle]);
    await tamper('DELETE FROM audit_log WHERE id = $1', [middle]);
    expect(await brokenAt()).not.toBeNull();
    // Remise en place pour la suite.
    await tamper('INSERT INTO audit_log SELECT * FROM audit_backup');
    await tamper('DROP TABLE audit_backup');
    expect(await brokenAt()).toBeNull();

    const last = await record();
    await tamper('DELETE FROM audit_log WHERE id = $1', [last]);
    expect(await brokenAt()).not.toBeNull();
  });
});

describe('immuabilité (EX-T11 n° 5)', () => {
  it.each([
    ['UPDATE', `UPDATE audit_log SET reason = 'x'`],
    ['DELETE', 'DELETE FROM audit_log'],
    ['TRUNCATE du parent', 'TRUNCATE audit_log'],
  ])('%s refusé, même au superutilisateur', async (_label, sql) => {
    await expect(db.query(sql)).rejects.toThrow(/journal d'audit immuable/);
  });

  it('TRUNCATE d’une partition refusé', async () => {
    const [partition] = await db.query<{ name: string }>(
      `SELECT inhrelid::regclass::text AS name FROM pg_inherits
       WHERE inhparent = 'audit_log'::regclass LIMIT 1`,
    );
    await expect(db.query(`TRUNCATE ${partition?.name ?? ''}`)).rejects.toThrow(
      /journal d'audit immuable/,
    );
  });
});

describe('partitionnement mensuel (EX-T11 n° 4)', () => {
  it('partitions du mois courant et des 3 suivants, plus une partition par défaut', async () => {
    const rows = await db.query<{ name: string }>(
      `SELECT inhrelid::regclass::text AS name FROM pg_inherits
       WHERE inhparent = 'audit_log'::regclass ORDER BY 1`,
    );
    const now = new Date();
    const expected = [0, 1, 2, 3].map((offset) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
      return `audit_log_${String(d.getUTCFullYear())}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    });
    expect(rows.map((r) => r.name)).toEqual(
      expect.arrayContaining([...expected, 'audit_log_default']),
    );
  });

  it('une entrée tombe dans la partition du mois, et la fonction est idempotente', async () => {
    const id = await record();
    const [row] = await db.query<{ partition: string }>(
      `SELECT tableoid::regclass::text AS partition FROM audit_log WHERE id = $1`,
      [id],
    );
    expect(row?.partition).toMatch(/^audit_log_\d{4}_\d{2}$/);
    await expect(db.query('SELECT oz_audit_ensure_partitions(3)')).resolves.toBeDefined();
  });

  it('une nouvelle partition hérite de la protection contre TRUNCATE', async () => {
    await db.query('SELECT oz_audit_ensure_partitions(6)');
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 6, 1));
    const name = `audit_log_${String(d.getUTCFullYear())}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    await expect(db.query(`TRUNCATE ${name}`)).rejects.toThrow(/journal d'audit immuable/);
  });
});

describe('écriture par Prisma (B5)', () => {
  it('prisma.auditLog.create enregistre une entrée chaînée sans valeur fournie pour la chaîne', async () => {
    const { createDbClient } = await import('../src/client.js');
    const client = createDbClient(db.url);
    try {
      const entry = await client.auditLog.create({
        data: {
          actorUserId: actor,
          action: 'user.role.changed',
          targetType: 'user',
          reason: 'Prisma',
        },
      });
      expect(entry.hash.length).toBe(32);
      expect(entry.chainPosition).toBeGreaterThan(0n);
      // Hachage recalculé par la base : l'entrée est bien chaînée (la chaîne entière a été cassée
      // volontairement par les tests d'altération ci-dessus).
      const [check] = await db.query<{ ok: boolean }>(
        `SELECT hash = oz_audit_hash(prev_hash, id, chain_position, actor_user_id, action, target_type,
                target_id, reason, request_id, metadata, created_at) AS ok
         FROM audit_log WHERE id = $1`,
        [entry.id],
      );
      expect(check?.ok).toBe(true);
    } finally {
      await client.$disconnect();
    }
  });
});
