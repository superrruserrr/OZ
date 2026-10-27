import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Lot 1.1b — dossiers et opérations (EX-101, plan §5.2). Le socle d'identité : socle-schema.int.test.ts.
const DOSSIER_TABLES = [
  'documents',
  'kyc_cases',
  'kyc_case_documents',
  'imports',
  'notifications',
  'subscriptions',
] as const;
/** Pièces justificatives et décisions : suppression logique seulement (D6, EX-101 n° 5). */
const NO_PHYSICAL_DELETE = ['documents', 'kyc_cases', 'kyc_case_documents'];
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const SHA = 'a'.repeat(64);

let db: TestDatabase;
let player: string;
let minor: string;
let club: string;
let recruiter: string;
let uploader: string;
let admin1: string;
let admin2: string;
let notAdmin: string;

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  const users = await db.query<{ id: string; email: string }>(
    `INSERT INTO users (email) VALUES ('depose@example.test'), ('admin1@example.test'),
       ('admin2@example.test'), ('simple@example.test') RETURNING id, email`,
  );
  const byEmail = (prefix: string): string =>
    users.find((u) => u.email.startsWith(prefix))?.id ?? '';
  uploader = byEmail('depose');
  admin1 = byEmail('admin1');
  admin2 = byEmail('admin2');
  notAdmin = byEmail('simple');
  await db.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin'), ($2, 'admin')`, [
    admin1,
    admin2,
  ]);
  const orgs = await db.query<{ id: string; type: string }>(
    `INSERT INTO organizations (type, name, country)
     VALUES ('club', 'Club synthétique', 'CM'), ('recruiter', 'Recruteur synthétique', 'CM') RETURNING id, type`,
  );
  club = orgs.find((o) => o.type === 'club')?.id ?? '';
  recruiter = orgs.find((o) => o.type === 'recruiter')?.id ?? '';
  const players = await db.query<{ id: string; first_name: string }>(
    `INSERT INTO players (first_name, last_name, birth_date, nationality, country)
     VALUES ('Majeur', 'Synthétique', '1998-03-02', 'CM', 'CM'),
            ('Mineur', 'Synthétique', (CURRENT_DATE - INTERVAL '12 years')::date, 'CM', 'CM')
     RETURNING id, first_name`,
  );
  player = players.find((p) => p.first_name === 'Majeur')?.id ?? '';
  minor = players.find((p) => p.first_name === 'Mineur')?.id ?? '';
});
afterAll(async () => {
  await db.stop();
});

let keySequence = 0;
async function insertDocument(values: Record<string, unknown> = {}): Promise<string> {
  keySequence += 1;
  const data: Record<string, unknown> = {
    type: 'identity_document',
    player_id: player,
    uploaded_by: uploader,
    storage_key: `documents/test/${String(keySequence)}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 1024,
    sha256: SHA,
    retention_until: '2030-01-01T00:00:00Z',
    ...values,
  };
  const keys = Object.keys(data);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO documents (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
    Object.values(data),
  );
  return row?.id ?? '';
}

async function insertCase(values: Record<string, unknown> = {}): Promise<string> {
  const data: Record<string, unknown> = { player_id: player, level: 1, ...values };
  const keys = Object.keys(data);
  const [row] = await db.query<{ id: string }>(
    `INSERT INTO kyc_cases (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
    Object.values(data),
  );
  return row?.id ?? '';
}

const decide = (
  id: string,
  status: string,
  first: string,
  second: string | null,
): Promise<unknown> =>
  db.query(
    `UPDATE kyc_cases SET status = $2, decided_by = $3, second_decided_by = $4,
       decided_at = now(), decision_reason = 'motif synthétique' WHERE id = $1`,
    [id, status, first, second],
  );

describe('règles transverses des dossiers', () => {
  it.each(DOSSIER_TABLES.filter((t) => t !== 'kyc_case_documents'))(
    '%s : id UUIDv7 et horodatages timestamptz',
    async (table) => {
      const rows = await db.query<{
        column_name: string;
        data_type: string;
        column_default: string;
      }>(
        `SELECT column_name, data_type, column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      );
      const cols = new Map(rows.map((r) => [r.column_name, r]));
      expect(cols.get('id')?.column_default).toBe('oz_uuid_v7()');
      for (const name of ['created_at', 'updated_at', 'deleted_at']) {
        expect(cols.get(name)?.data_type, `${table}.${name}`).toBe('timestamp with time zone');
      }
    },
  );

  it.each(NO_PHYSICAL_DELETE)('%s : DELETE et TRUNCATE refusés', async (table) => {
    await expect(db.query(`DELETE FROM ${table}`)).rejects.toThrow(/suppression physique/);
    await expect(db.query(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(/suppression physique/);
  });
});

describe('documents (plan §5.2, §6.6)', () => {
  it('accepte un document valide, statut antivirus en attente par défaut', async () => {
    const id = await insertDocument();
    const [row] = await db.query<{ av_status: string }>(
      'SELECT av_status FROM documents WHERE id = $1',
      [id],
    );
    expect(row?.av_status).toBe('pending');
  });

  it.each([
    ['taille nulle', { size_bytes: 0 }],
    ['taille au-delà de 50 Mo', { size_bytes: MAX_DOCUMENT_BYTES + 1 }],
    ['empreinte qui n’est pas du SHA-256 hexadécimal', { sha256: 'ABC' }],
    ['URL stockée à la place d’une clé', { storage_key: 'https://s3.example.test/doc.pdf' }],
    ['type MIME mal formé', { mime_type: 'pdf' }],
    ['aucun sujet', { player_id: null }],
    ['numéro chiffré sans son empreinte', { document_number_encrypted: Buffer.from('x') }],
  ])('refuse : %s', async (_label, values) => {
    await expect(insertDocument(values)).rejects.toThrow(/check constraint|violates/);
  });

  it('refuse deux sujets', async () => {
    // Valeur lue à l'exécution : les arguments de it.each sont évalués avant beforeAll.
    await expect(insertDocument({ organization_id: club })).rejects.toThrow(/check constraint/);
  });

  it('accepte exactement 50 Mo', async () => {
    await expect(insertDocument({ size_bytes: MAX_DOCUMENT_BYTES })).resolves.toBeTruthy();
  });

  it('clé de stockage unique', async () => {
    await insertDocument({ storage_key: 'documents/test/unique.pdf' });
    await expect(insertDocument({ storage_key: 'documents/test/unique.pdf' })).rejects.toThrow(
      /unique/i,
    );
  });

  it('aucune colonne d’URL ni de numéro en clair', async () => {
    const rows = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'documents'`,
    );
    const names = rows.map((r) => r.column_name);
    expect(names.filter((n) => /url/.test(n))).toEqual([]);
    expect(names).not.toContain('document_number');
    expect(names).toContain('document_number_encrypted');
    expect(names).toContain('ocr_extract_encrypted');
  });
});

describe('dossiers KYC (plan §5.4, CP-16)', () => {
  it.each([
    ['aucun sujet', { player_id: null }],
    ['niveau 4', { level: 4 }],
    ['niveau négatif', { level: -1 }],
    ['contrôles qui ne sont pas une liste', { checks: '{}' }],
  ])('refuse : %s', async (_label, values) => {
    await expect(insertCase(values)).rejects.toThrow(/check constraint|violates/);
  });

  it('refuse deux sujets', async () => {
    await expect(insertCase({ organization_id: club })).rejects.toThrow(/check constraint/);
  });

  it('une décision exige décideur, motif et horodatage', async () => {
    const id = await insertCase();
    await expect(
      db.query(`UPDATE kyc_cases SET status = 'rejected' WHERE id = $1`, [id]),
    ).rejects.toThrow(/check constraint/);
    await expect(decide(id, 'rejected', admin1, null)).resolves.toBeDefined();
  });

  it('un même administrateur ne valide pas deux fois', async () => {
    const id = await insertCase({ player_id: minor });
    await expect(decide(id, 'approved', admin1, admin1)).rejects.toThrow(/check constraint/);
  });

  it('un majeur sans risque particulier : une validation suffit', async () => {
    const id = await insertCase();
    await expect(decide(id, 'approved', admin1, null)).resolves.toBeDefined();
  });

  it('un mineur exige deux administrateurs distincts (CP-16)', async () => {
    const id = await insertCase({ player_id: minor });
    await expect(decide(id, 'approved', admin1, null)).rejects.toThrow(/deux administrateurs/);
    await expect(decide(id, 'approved', admin1, admin2)).resolves.toBeDefined();
  });

  it('un recruteur exige deux administrateurs distincts (CP-16)', async () => {
    const id = await insertCase({ player_id: null, organization_id: recruiter });
    await expect(decide(id, 'approved', admin1, null)).rejects.toThrow(/deux administrateurs/);
    await expect(decide(id, 'approved', admin1, admin2)).resolves.toBeDefined();
  });

  it('seul un administrateur actif décide', async () => {
    const id = await insertCase();
    await expect(decide(id, 'approved', notAdmin, null)).rejects.toThrow(/administrateur/);
    const minorCase = await insertCase({ player_id: minor });
    await expect(decide(minorCase, 'approved', admin1, notAdmin)).rejects.toThrow(/administrateur/);
  });

  it('un document joint concerne le sujet du dossier', async () => {
    const id = await insertCase();
    const own = await insertDocument();
    const other = await insertDocument({ player_id: minor });
    await db.query('INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)', [
      id,
      own,
    ]);
    await expect(
      db.query('INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)', [
        id,
        other,
      ]),
    ).rejects.toThrow(/sujet/);
  });
});

describe('imports (plan §5.2, CP-26)', () => {
  const insertImport = (values: Record<string, unknown> = {}): Promise<unknown> => {
    const data: Record<string, unknown> = {
      organization_id: club,
      source: 'csv',
      file_name: 'effectif.csv',
      file_sha256: SHA,
      ...values,
    };
    const keys = Object.keys(data);
    return db.query(
      `INSERT INTO imports (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')})`,
      Object.values(data),
    );
  };

  it('compteurs : jamais plus de lignes traitées que de lignes lues', async () => {
    await expect(
      insertImport({ rows_total: 10, rows_ok: 6, rows_rejected: 3, rows_duplicate: 2 }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      insertImport({ status: 'processing', rows_total: 10, rows_ok: 6, rows_rejected: 3 }),
    ).resolves.toBeDefined();
  });

  it('un import terminé a traité toutes ses lignes (CP-26)', async () => {
    await expect(
      insertImport({ status: 'completed', rows_total: 10, rows_ok: 6, rows_rejected: 3 }),
    ).rejects.toThrow(/check constraint/);
    await expect(
      insertImport({
        status: 'completed',
        rows_total: 10,
        rows_ok: 6,
        rows_rejected: 3,
        rows_duplicate: 1,
      }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['compteur négatif', { rows_ok: -1 }],
    ['correspondance qui n’est pas un objet', { mapping: '[]' }],
    ['empreinte invalide', { file_sha256: 'xyz' }],
  ])('refuse : %s', async (_label, values) => {
    await expect(insertImport(values)).rejects.toThrow(/check constraint/);
  });
});

describe('abonnements et notifications', () => {
  const insertSubscription = (values: Record<string, unknown> = {}): Promise<{ id: string }[]> => {
    const data: Record<string, unknown> = {
      organization_id: club,
      status: 'active',
      provider: 'manual',
      period_start: '2026-01-01T00:00:00Z',
      period_end: '2027-01-01T00:00:00Z',
      ...values,
    };
    const keys = Object.keys(data);
    return db.query<{ id: string }>(
      `INSERT INTO subscriptions (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')}) RETURNING id`,
      Object.values(data),
    );
  };

  it('palier gratuit par défaut, période ordonnée, fournisseur connu', async () => {
    const [row] = await insertSubscription({ organization_id: recruiter });
    const [sub] = await db.query<{ tier: string }>('SELECT tier FROM subscriptions WHERE id = $1', [
      row?.id,
    ]);
    expect(sub?.tier).toBe('free');
    await expect(
      insertSubscription({ status: 'expired', period_end: '2025-01-01T00:00:00Z' }),
    ).rejects.toThrow(/check constraint/);
    await expect(insertSubscription({ status: 'expired', provider: 'paypal' })).rejects.toThrow(
      /invalid input value/,
    );
  });

  it('une seule souscription en cours par organisation', async () => {
    const [first] = await insertSubscription();
    await expect(insertSubscription({ status: 'trialing' })).rejects.toThrow(/unique/i);
    await expect(insertSubscription({ status: 'cancelled' })).resolves.toBeDefined();
    // L'organisation pointe sur sa souscription, jamais sur celle d'une autre.
    await db.query('UPDATE organizations SET subscription_id = $1 WHERE id = $2', [
      first?.id,
      club,
    ]);
    await expect(
      db.query('UPDATE organizations SET subscription_id = $1 WHERE id = $2', [
        first?.id,
        recruiter,
      ]),
    ).rejects.toThrow(/foreign key/);
  });

  it('notification : gabarit nommé, tentatives bornées, aucun contact en clair dans la charge', async () => {
    const insert = (values: Record<string, unknown>): Promise<unknown> => {
      const data: Record<string, unknown> = {
        recipient_user_id: uploader,
        channel: 'email',
        template: 'kyc.case.approved',
        ...values,
      };
      const keys = Object.keys(data);
      return db.query(
        `INSERT INTO notifications (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${String(i + 1)}`).join(', ')})`,
        Object.values(data),
      );
    };
    await expect(insert({ payload: { kyc_case_id: player } })).resolves.toBeDefined();
    for (const payload of [{ email: 'x@example.test' }, { phone: '+999' }, { first_name: 'A' }]) {
      await expect(insert({ payload })).rejects.toThrow(/check constraint/);
    }
    await expect(insert({ template: 'Bonjour {{nom}}' })).rejects.toThrow(/check constraint/);
    await expect(insert({ attempts: 99 })).rejects.toThrow(/check constraint/);
    await expect(insert({ status: 'sent' })).rejects.toThrow(/check constraint/);
  });
});

describe('revue adversariale du lot 1.1b', () => {
  it('B1 : le sujet d’un dossier est figé hors brouillon (pas de contournement de CP-16)', async () => {
    const id = await insertCase();
    await decide(id, 'approved', admin1, null);
    await expect(
      db.query('UPDATE kyc_cases SET player_id = $1 WHERE id = $2', [minor, id]),
    ).rejects.toThrow(/sujet/);
  });

  it('W7 : une décision est définitive, sauf expiration', async () => {
    const id = await insertCase();
    await decide(id, 'approved', admin1, null);
    await expect(
      db.query(`UPDATE kyc_cases SET status = 'submitted' WHERE id = $1`, [id]),
    ).rejects.toThrow(/définitive/);
    await expect(
      db.query(`UPDATE kyc_cases SET decision_reason = 'autre' WHERE id = $1`, [id]),
    ).rejects.toThrow(/définitive/);
    await expect(
      db.query(`UPDATE kyc_cases SET status = 'expired' WHERE id = $1`, [id]),
    ).resolves.toBeDefined();
  });

  it('B2 : la recherche ne dépend pas du search_path (restauration pg_dump)', async () => {
    // Requête à plusieurs instructions : elle lève si une fonction est introuvable.
    await db.query(`BEGIN; SET LOCAL search_path = pg_catalog;
      UPDATE public.players SET city = 'Garoua' WHERE id = '${player}'; COMMIT;`);
  });

  it('W3 : pièce jointe seulement à un brouillon, sujet d’une pièce figé', async () => {
    const id = await insertCase();
    const doc = await insertDocument();
    await decide(id, 'rejected', admin1, null);
    await expect(
      db.query('INSERT INTO kyc_case_documents (kyc_case_id, document_id) VALUES ($1, $2)', [
        id,
        doc,
      ]),
    ).rejects.toThrow(/brouillon/);
    await expect(
      db.query('UPDATE documents SET player_id = $1 WHERE id = $2', [minor, doc]),
    ).rejects.toThrow(/sujet/);
  });

  it('W6 : rétention postérieure au dépôt ; aucune URL dans les clés d’import', async () => {
    await expect(insertDocument({ retention_until: '1990-01-01' })).rejects.toThrow(
      /check constraint/,
    );
    await expect(
      db.query(
        `INSERT INTO imports (organization_id, source, file_name, file_sha256, report_key)
         VALUES ($1, 'csv', 'a.csv', '${SHA}', 'https://evil.example.test/r.pdf')`,
        [club],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('notifications : identifiants seulement (W4)', () => {
  const insert = (payload: unknown): Promise<unknown> =>
    db.query(
      `INSERT INTO notifications (recipient_user_id, channel, template, payload)
       VALUES ($1, 'email', 'kyc.case.approved', $2)`,
      [uploader, payload],
    );

  it.each([
    [{ user: { email: 'x@example.test' } }],
    [{ full_name: 'Jean Dupont' }],
    [{ Email: 'x@example.test' }],
    [{ kyc_case_id: 42 }],
  ])('refuse %j', async (payload) => {
    await expect(insert(payload)).rejects.toThrow(/check constraint/);
  });

  it('accepte des identifiants textuels', async () => {
    await expect(insert({ kyc_case_id: player, organization_id: club })).resolves.toBeDefined();
  });
});

describe('restauration pg_dump : aucune fonction ne dépend du search_path (B2)', () => {
  const key = 'k'.repeat(40);
  it.each([
    [
      'déclencheurs des joueurs',
      `INSERT INTO public.players (first_name, last_name, birth_date, nationality, country, guardian_id) SELECT 'a', 'b', '2014-01-01', 'CM', 'CM', id FROM public.guardians LIMIT 1`,
    ],
    [
      'chiffrement',
      `SELECT public.oz_decrypt(public.oz_encrypt('x', '${key}'), '${key}'), public.oz_blind_index('x', '${key}')`,
    ],
    ['garde d’autorité', `UPDATE public.users SET last_seen_at = now()`],
    ['vérification du journal', `SELECT public.oz_audit_verify_chain()`],
    ['partitions du journal', `SELECT public.oz_audit_ensure_partitions(4)`],
    ['dossiers KYC', `UPDATE public.kyc_cases SET level = level`],
  ])('%s', async (_label, sql) => {
    await db.query(
      `INSERT INTO guardians (first_name, last_name, relationship, country)
       SELECT 'Tuteur', 'Restauration', 'mother', 'CM' WHERE NOT EXISTS (SELECT 1 FROM guardians)`,
    );
    await db.query(`BEGIN; SET LOCAL search_path = ''; ${sql}; ROLLBACK;`);
  });
});

describe('seconde revue du lot 1.1b', () => {
  it('le sujet d’un dossier est figé dès sa création, et un dossier ne revient jamais en brouillon', async () => {
    const id = await insertCase();
    await expect(
      db.query('UPDATE kyc_cases SET player_id = $1 WHERE id = $2', [minor, id]),
    ).rejects.toThrow(/sujet/);
    await db.query(`UPDATE kyc_cases SET status = 'in_review' WHERE id = $1`, [id]);
    await expect(
      db.query(`UPDATE kyc_cases SET status = 'draft' WHERE id = $1`, [id]),
    ).rejects.toThrow(/brouillon/);
  });

  it('les valeurs d’une charge de notification sont des UUID', async () => {
    await expect(
      db.query(
        `INSERT INTO notifications (recipient_user_id, channel, template, payload)
         VALUES ($1, 'email', 'kyc.case.approved', $2)`,
        [uploader, { user_id: 'jean.dupont@gmail.com' }],
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
