import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// RLS des dossiers (lot 1.1b, D3) : chacun voit les pièces, dossiers, imports et abonnements de ses
// propres sujets ; statuts, contrôles et décisions restent hors de portée de l'utilisateur.
const SHA = 'b'.repeat(64);

let db: TestDatabase;
let app: AppConnection;
let alice: string;
let bob: string;
let alicePlayer: string;
let bobPlayer: string;
let club: string;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const users = await db.query<{ id: string; email: string }>(
    `INSERT INTO users (email) VALUES ('alice@example.test'), ('bob@example.test') RETURNING id, email`,
  );
  alice = users.find((u) => u.email.startsWith('alice'))?.id ?? '';
  bob = users.find((u) => u.email.startsWith('bob'))?.id ?? '';
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country) VALUES ('club', 'Club synthétique', 'CM') RETURNING id`,
  );
  club = org?.id ?? '';
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'club', $2)`,
    [alice, club],
  );
  const players = await db.query<{ id: string; user_id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country)
     VALUES ($1, 'Alice', 'Synthétique', '2000-01-01', 'CM', 'CM'),
            ($2, 'Bob', 'Synthétique', '2001-01-01', 'CM', 'CM') RETURNING id, user_id`,
    [alice, bob],
  );
  alicePlayer = players.find((p) => p.user_id === alice)?.id ?? '';
  bobPlayer = players.find((p) => p.user_id === bob)?.id ?? '';
  app = await connectAsAppRole(db);
});
afterAll(async () => {
  await app.end();
  await db.stop();
});

let sequence = 0;
const documentSql = (owner: string, player: string, extra = ''): string => {
  sequence += 1;
  return `INSERT INTO documents (type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256, retention_until${extra ? ', av_status' : ''})
    VALUES ('identity_document', '${player}', '${owner}', 'documents/rls/${String(sequence)}.pdf', 'application/pdf', 10, '${SHA}', '2030-01-01'${extra ? `, '${extra}'` : ''})
    RETURNING id`;
};

describe('documents', () => {
  it('dépose une pièce pour son propre profil, statut antivirus imposé', async () => {
    const { rows } = await app.as(bob, (c) => c.query<{ id: string }>(documentSql(bob, bobPlayer)));
    expect(rows).toHaveLength(1);
    await expect(app.as(bob, (c) => c.query(documentSql(bob, bobPlayer, 'clean')))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('ne dépose rien pour le profil d’un autre, ni au nom d’un autre', async () => {
    await expect(app.as(bob, (c) => c.query(documentSql(bob, alicePlayer)))).rejects.toThrow(
      /row-level security/,
    );
    await expect(app.as(bob, (c) => c.query(documentSql(alice, bobPlayer)))).rejects.toThrow(
      /row-level security/,
    );
  });

  it('ne voit pas les pièces des autres et ne modifie pas les siennes', async () => {
    const [doc] = await db.query<{ id: string }>(documentSql(alice, alicePlayer));
    const seen = await app.as(bob, (c) =>
      c.query('SELECT 1 FROM documents WHERE id = $1', [doc?.id]),
    );
    expect(seen.rows).toEqual([]);
    const own = await app.as(alice, (c) =>
      c.query(`UPDATE documents SET av_status = 'clean' WHERE id = $1`, [doc?.id]),
    );
    expect(own.rowCount).toBe(0);
  });
});

describe('dossiers KYC', () => {
  it('ouvre un brouillon pour son profil, sans statut ni décision', async () => {
    await expect(
      app.as(bob, (c) =>
        c.query(`INSERT INTO kyc_cases (player_id, level) VALUES ($1, 1)`, [bobPlayer]),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    for (const sql of [
      `INSERT INTO kyc_cases (player_id, level, status) VALUES ('${bobPlayer}', 1, 'submitted')`,
      `INSERT INTO kyc_cases (player_id, level) VALUES ('${alicePlayer}', 1)`,
      `INSERT INTO kyc_cases (player_id, level, checks) VALUES ('${bobPlayer}', 1, '[{"ok":true}]')`,
    ]) {
      await expect(app.as(bob, (c) => c.query(sql))).rejects.toThrow(/row-level security/);
    }
  });

  it('ne fait pas avancer son dossier lui-même', async () => {
    const update = await app.as(bob, (c) =>
      c.query(`UPDATE kyc_cases SET status = 'approved' WHERE player_id = $1`, [bobPlayer]),
    );
    expect(update.rowCount).toBe(0);
  });

  it('joint à son brouillon ses propres pièces seulement', async () => {
    const [kycCase] = await db.query<{ id: string }>(
      `INSERT INTO kyc_cases (player_id, level) VALUES ($1, 1) RETURNING id`,
      [bobPlayer],
    );
    const [mine] = await db.query<{ id: string }>(documentSql(bob, bobPlayer));
    const [theirs] = await db.query<{ id: string }>(documentSql(alice, alicePlayer));
    await expect(
      app.as(bob, (c) =>
        c.query('INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)', [
          kycCase?.id,
          mine?.id,
        ]),
      ),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      app.as(bob, (c) =>
        c.query('INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)', [
          kycCase?.id,
          theirs?.id,
        ]),
      ),
      // Le déclencheur (pièce invisible, donc étrangère au dossier) refuse avant la RLS.
    ).rejects.toThrow(/row-level security|ne concerne pas/);
  });
});

describe('imports, abonnements, notifications', () => {
  it('un membre lance un import pour son organisation, jamais pour une autre', async () => {
    const sql = `INSERT INTO imports (organization_id, source, file_name, file_sha256, created_by)
      VALUES ($1, 'csv', 'effectif.csv', '${SHA}', $2)`;
    await expect(app.as(alice, (c) => c.query(sql, [club, alice]))).resolves.toMatchObject({
      rowCount: 1,
    });
    await expect(app.as(bob, (c) => c.query(sql, [club, bob]))).rejects.toThrow(
      /row-level security/,
    );
    await expect(
      app.as(alice, (c) =>
        c.query(
          `INSERT INTO imports (organization_id, source, file_name, file_sha256, created_by, status)
           VALUES ($1, 'csv', 'effectif.csv', '${SHA}', $2, 'completed')`,
          [club, alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    const seen = await app.as(bob, (c) => c.query('SELECT 1 FROM imports'));
    expect(seen.rows).toEqual([]);
  });

  it('un membre lit l’abonnement de son organisation sans pouvoir l’écrire', async () => {
    await db.query(
      `INSERT INTO subscriptions (organization_id, status, provider, period_start, period_end)
       VALUES ($1, 'active', 'manual', now(), now() + interval '1 year')`,
      [club],
    );
    const asAlice = await app.as(alice, (c) => c.query('SELECT tier FROM subscriptions'));
    expect(asAlice.rows).toHaveLength(1);
    const asBob = await app.as(bob, (c) => c.query('SELECT 1 FROM subscriptions'));
    expect(asBob.rows).toEqual([]);
    const update = await app.as(alice, (c) => c.query(`UPDATE subscriptions SET tier = 'elite'`));
    expect(update.rowCount).toBe(0);
  });

  it('chacun ne lit que ses notifications', async () => {
    await db.query(
      `INSERT INTO notifications (recipient_user_id, channel, template) VALUES ($1, 'in_app', 'kyc.case.submitted')`,
      [alice],
    );
    expect((await app.as(alice, (c) => c.query('SELECT 1 FROM notifications'))).rows).toHaveLength(
      1,
    );
    expect((await app.as(bob, (c) => c.query('SELECT 1 FROM notifications'))).rows).toEqual([]);
  });
});

describe('revue adversariale du lot 1.1b', () => {
  it('W5 : le déposant qui perd son lien au sujet ne lit plus la pièce', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('ancien-tuteur@example.test') RETURNING id`,
    );
    const me = user?.id ?? '';
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country)
       VALUES ($1, 'Ancien', 'Tuteur', 'father', 'CM') RETURNING id`,
      [me],
    );
    const [child] = await db.query<{ id: string }>(
      `INSERT INTO players (first_name, last_name, birth_date, nationality, country, guardian_id)
       VALUES ('Enfant', 'W5', '2014-01-01', 'CM', 'CM', $1) RETURNING id`,
      [guardian?.id],
    );
    await db.query(documentSql(me, child?.id ?? ''));
    expect((await app.as(me, (c) => c.query('SELECT 1 FROM documents'))).rows).toHaveLength(1);
    await db.query('UPDATE guardians SET deleted_at = now() WHERE id = $1', [guardian?.id]);
    expect((await app.as(me, (c) => c.query('SELECT 1 FROM documents'))).rows).toEqual([]);
  });

  it('W6 : l’auteur enregistré est l’utilisateur courant', async () => {
    await expect(
      app.as(bob, (c) =>
        c.query(`INSERT INTO kyc_cases (player_id, level, created_by) VALUES ($1, 1, $2)`, [
          bobPlayer,
          alice,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    sequence += 1;
    await expect(
      app.as(bob, (c) =>
        c.query(
          `INSERT INTO documents (type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256, retention_until, created_by)
           VALUES ('photo', $1, $2, 'documents/rls/w6-${String(sequence)}.jpg', 'image/jpeg', 10, '${SHA}', '2030-01-01', $3)`,
          [bobPlayer, bob, alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
