import { createPersonFactory } from '@oz/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonymizeDatabase, unclassifiedColumns } from '../src/anonymize/anonymize.js';
import { ANONYMIZATION_REGISTRY, type Registry } from '../src/anonymize/registry.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

let db: TestDatabase;
// Clés de la copie (recette), distinctes de celles de la production.
const COPY_KEYS = {
  encryptionKey: 'e'.repeat(40),
  blindIndexKey: 'i'.repeat(40),
};
const target = (): { targetHost: string; targetPort: number; targetDb: string } => {
  const url = new URL(db.url);
  return {
    targetHost: url.hostname,
    targetPort: Number(url.port),
    targetDb: url.pathname.slice(1),
  };
};

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});
afterAll(async () => {
  await db.stop();
});

interface PersonRow {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  email: string;
  phone: string;
  document_number: string;
  notes: string | null;
  country: string;
}

// Table de personnes « réelles » : réservée au test, elle mime les futures tables du lot 1.1.
const FIXTURE_REGISTRY: Registry = {
  ...ANONYMIZATION_REGISTRY,
  people_fixture: {
    id: 'technical',
    first_name: 'first_name',
    last_name: 'last_name',
    birth_date: 'birth_date',
    email: 'email',
    phone: 'phone',
    document_number: 'document_number',
    notes: 'free_text',
    country: 'technical',
  },
};

async function loadRealLookingPeople(): Promise<PersonRow[]> {
  await db.query(`CREATE TABLE people_fixture (
    id uuid PRIMARY KEY DEFAULT oz_uuid_v7(), first_name text NOT NULL, last_name text NOT NULL,
    birth_date date NOT NULL, email text NOT NULL, phone text NOT NULL, document_number text NOT NULL,
    notes text, country text NOT NULL)`);
  // Données sans marqueur synthétique : ce que contiendrait une copie de la production.
  for (const [index, person] of createPersonFactory(99).persons(120).entries()) {
    await db.query(
      `INSERT INTO people_fixture (first_name, last_name, birth_date, email, phone, document_number, notes, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        person.firstName,
        person.lastName,
        person.birthDate,
        person.email.replace('@example.test', '@gmail.com'),
        person.phone.replace('+999', '+237'),
        person.documentNumber.replace('SYN-', 'CM'),
        index % 3 === 0 ? null : `Joueur suivi par ${person.firstName} ${person.lastName}`,
        person.country,
      ],
    );
  }
  return db.query<PersonRow>(
    `SELECT id, first_name, last_name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, email, phone,
            document_number, notes, country FROM people_fixture ORDER BY id`,
  );
}

describe('registre d’anonymisation', () => {
  it('classe toutes les colonnes de la base migrée', async () => {
    expect(await unclassifiedColumns(db.url, ANONYMIZATION_REGISTRY)).toEqual([]);
  });

  it('signale une colonne ajoutée sans classement, et l’anonymisation refuse de s’exécuter', async () => {
    await db.query('CREATE TABLE unclassified_fixture (id uuid PRIMARY KEY, secret text)');
    try {
      expect(await unclassifiedColumns(db.url, ANONYMIZATION_REGISTRY)).toEqual([
        'unclassified_fixture.id',
        'unclassified_fixture.secret',
      ]);
      await expect(
        anonymizeDatabase({ databaseUrl: db.url, appEnv: 'staging', ...target(), ...COPY_KEYS }),
      ).rejects.toThrow(/unclassified_fixture\.secret/);
    } finally {
      await db.query('DROP TABLE unclassified_fixture');
    }
  });
});

describe('registre : objets que information_schema ne montre pas (revue lot 0.6)', () => {
  it('voit une table d’un autre schéma, qualifiée par son schéma', async () => {
    await db.query('CREATE SCHEMA kyc; CREATE TABLE kyc.docs (id uuid PRIMARY KEY, secret text)');
    try {
      expect(await unclassifiedColumns(db.url, ANONYMIZATION_REGISTRY)).toEqual([
        'kyc.docs.id',
        'kyc.docs.secret',
      ]);
    } finally {
      await db.query('DROP SCHEMA kyc CASCADE');
    }
  });

  it('refuse une vue matérialisée : elle conserverait les données d’origine', async () => {
    await db.query("CREATE MATERIALIZED VIEW names_mv AS SELECT 'Awa'::text AS name");
    try {
      expect((await unclassifiedColumns(db.url, ANONYMIZATION_REGISTRY)).join('\n')).toMatch(
        /names_mv : vue matérialisée/,
      );
    } finally {
      await db.query('DROP MATERIALIZED VIEW names_mv');
    }
  });

  it('classe une table partitionnée par son parent, sans exiger chaque partition', async () => {
    await db.query(`CREATE TABLE events (id uuid NOT NULL, at date NOT NULL) PARTITION BY RANGE (at);
      CREATE TABLE events_2026 PARTITION OF events FOR VALUES FROM ('2026-01-01') TO ('2027-01-01')`);
    try {
      expect(await unclassifiedColumns(db.url, ANONYMIZATION_REGISTRY)).toEqual([
        'events.at',
        'events.id',
      ]);
    } finally {
      await db.query('DROP TABLE events');
    }
  });

  it('voit tout même avec un rôle sans droit sur les tables', async () => {
    await db.query(`CREATE ROLE limited LOGIN PASSWORD 'limited';
      CREATE TABLE hidden_people (id uuid PRIMARY KEY, name text);
      REVOKE ALL ON hidden_people FROM PUBLIC`);
    const url = new URL(db.url);
    url.username = 'limited';
    url.password = 'limited';
    try {
      expect(await unclassifiedColumns(url.toString(), ANONYMIZATION_REGISTRY)).toEqual([
        'hidden_people.id',
        'hidden_people.name',
      ]);
    } finally {
      await db.query('DROP TABLE hidden_people; DROP ROLE limited');
    }
  });
});

describe('anonymizeDatabase (EX-T10.2-3)', () => {
  it('ne laisse subsister aucun nom, date de naissance exacte, email, téléphone ni document', async () => {
    const original = await loadRealLookingPeople();
    await anonymizeDatabase({
      databaseUrl: db.url,
      appEnv: 'staging',
      ...target(),
      ...COPY_KEYS,
      registry: FIXTURE_REGISTRY,
    });
    const after = await db.query<PersonRow & { whole: string }>(
      `SELECT id, first_name, last_name, to_char(birth_date, 'YYYY-MM-DD') AS birth_date, email, phone,
              document_number, notes, country, row_to_json(people_fixture)::text AS whole
       FROM people_fixture ORDER BY id`,
    );
    expect(after.map((row) => row.id)).toEqual(original.map((row) => row.id));
    const everything = after.map((row) => row.whole).join('\n');

    for (const [index, before] of original.entries()) {
      const row = after[index];
      expect(row?.country).toBe(before.country);
      expect(row?.birth_date.slice(0, 4)).toBe(before.birth_date.slice(0, 4));
      expect(row?.birth_date).not.toBe(before.birth_date);
      expect(row?.notes === null).toBe(before.notes === null);
      for (const value of [before.email, before.phone, before.document_number]) {
        expect(everything).not.toContain(value);
      }
      for (const name of [before.first_name, before.last_name]) {
        expect(row?.first_name).not.toBe(name);
        expect(row?.last_name).not.toBe(name);
        expect(row?.notes ?? '').not.toContain(name);
      }
    }
    await db.query('DROP TABLE people_fixture');
  });

  it('refuse la production, avant toute connexion', async () => {
    await expect(
      anonymizeDatabase({
        databaseUrl: 'postgresql://x:y@127.0.0.1:1/oz',
        appEnv: 'production',
        targetHost: '127.0.0.1',
        targetPort: 1,
        targetDb: 'oz',
      }),
    ).rejects.toThrow(/production/);
  });

  it('refuse une base différente de la cible déclarée', async () => {
    await expect(
      anonymizeDatabase({ databaseUrl: db.url, appEnv: 'staging', ...target(), targetDb: 'oz' }),
    ).rejects.toThrow(/cible/);
  });

  it('refuse un port différent : un tunnel vers la production sur le même hôte', async () => {
    await expect(
      anonymizeDatabase({ databaseUrl: db.url, appEnv: 'staging', ...target(), targetPort: 15432 }),
    ).rejects.toThrow(/cible/);
  });

  it('refuse un serveur différent de la cible, même si la base porte le même nom', async () => {
    await expect(
      anonymizeDatabase({
        databaseUrl: db.url,
        appEnv: 'staging',
        ...target(),
        targetHost: 'prod-host',
      }),
    ).rejects.toThrow(/cible/);
  });
});

describe('anonymisation du socle (lot 1.1a, D-023)', () => {
  const PROD_KEY = 'p'.repeat(40);
  const ENCRYPTION_KEY = 'e'.repeat(40);
  const BLIND_INDEX_KEY = 'i'.repeat(40);

  it('remplace noms, contacts et pièces chiffrés, rechiffrés avec les clés de la recette', async () => {
    const [user] = await db.query<{ id: string }>(
      `INSERT INTO users (email) VALUES ('fatou.ndiaye@gmail.com') RETURNING id`,
    );
    const [guardian] = await db.query<{ id: string }>(
      `INSERT INTO guardians (first_name, last_name, relationship, country, phone_encrypted, phone_hmac,
         email_encrypted, email_hmac, document_number_encrypted, document_number_hmac)
       VALUES ('Fatou', 'Ndiaye', 'mother', 'SN',
         oz_encrypt('+221770000000', $1), oz_blind_index('+221770000000', $1),
         oz_encrypt('fatou.ndiaye@gmail.com', $1), oz_blind_index('fatou.ndiaye@gmail.com', $1),
         oz_encrypt('SN1234567', $1), oz_blind_index('SN1234567', $1)) RETURNING id`,
      [PROD_KEY],
    );
    await db.query(
      `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, guardian_id,
         phone_encrypted, phone_hmac)
       VALUES ($1, 'Moussa', 'Ndiaye', '2012-03-14', 'SN', 'SN', $2,
         oz_encrypt('+221771111111', $3), oz_blind_index('+221771111111', $3))`,
      [user?.id, guardian?.id, PROD_KEY],
    );
    await db.query(
      `INSERT INTO audit_log (actor_user_id, action, target_type, reason, metadata)
       VALUES ($1, 'player.profile.updated', 'player', 'Correction demandée par Fatou Ndiaye', '{"phone": "+221771111111"}')`,
      [user?.id],
    );

    await anonymizeDatabase({
      databaseUrl: db.url,
      appEnv: 'staging',
      ...target(),
      encryptionKey: ENCRYPTION_KEY,
      blindIndexKey: BLIND_INDEX_KEY,
    });

    const [g] = await db.query<{
      first_name: string;
      phone: string;
      email: string;
      doc: string;
      ok: boolean;
    }>(
      `SELECT first_name, oz_decrypt(phone_encrypted, $1) AS phone, oz_decrypt(email_encrypted, $1) AS email,
              oz_decrypt(document_number_encrypted, $1) AS doc,
              phone_hmac = oz_blind_index(oz_decrypt(phone_encrypted, $1), $2) AS ok
       FROM guardians WHERE id = $3`,
      [ENCRYPTION_KEY, BLIND_INDEX_KEY, guardian?.id],
    );
    expect(g?.first_name).not.toBe('Fatou');
    expect([g?.phone, g?.email, g?.doc]).not.toContain('+221770000000');
    expect(g?.email).toMatch(/@example\.test$/);
    expect(g?.doc).toMatch(/^SYN-/);
    expect(g?.ok).toBe(true);
    // L'ancienne clé ne déchiffre plus rien : les valeurs d'origine ont disparu.
    await expect(
      db.query('SELECT oz_decrypt(phone_encrypted, $1) FROM guardians WHERE id = $2', [
        PROD_KEY,
        guardian?.id,
      ]),
    ).rejects.toThrow(/Wrong key/);

    const [p] = await db.query<{ last_name: string; email: string }>(
      `SELECT p.last_name, u.email FROM players p JOIN users u ON u.id = p.user_id WHERE u.id = $1`,
      [user?.id],
    );
    expect(p?.last_name).not.toBe('Ndiaye');
    expect(p?.email).toMatch(/@example\.test$/);

    const audit = await db.query<{ reason: string; metadata: unknown }>(
      `SELECT reason, metadata FROM audit_log WHERE action = 'player.profile.updated'`,
    );
    expect(audit).toEqual([{ reason: '[anonymisé]', metadata: {} }]);
  });

  it('exige les clés de la recette dès qu’une colonne chiffrée est à réécrire', async () => {
    await expect(
      anonymizeDatabase({ databaseUrl: db.url, appEnv: 'staging', ...target() }),
    ).rejects.toThrow(/DATABASE_ENCRYPTION_KEY/);
  });
});
