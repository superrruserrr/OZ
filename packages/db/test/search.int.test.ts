import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../src/seed.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Recherche plein texte et floue sur les joueurs (EX-101 n° 6), sur les 500 profils seedés.
let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  await seedDatabase({ databaseUrl: db.url, appEnv: 'local' });
  await db.query(
    `INSERT INTO players (first_name, last_name, birth_date, nationality, country, city, primary_position)
     VALUES ('Samuel', 'Ngassa', '2004-02-11', 'CM', 'CM', 'Yaoundé', 'striker'),
            ('Éloïse', 'Etoundi', '2003-07-01', 'CM', 'CM', 'Douala', 'winger')`,
  );
  await db.query('ANALYZE players');
});
afterAll(async () => {
  await db.stop();
});

const FULL_TEXT = `SELECT last_name FROM players
  WHERE search_vector @@ plainto_tsquery('simple', lower(oz_unaccent($1)))`;
const FUZZY = `SELECT last_name FROM players
  WHERE lower(oz_unaccent(last_name)) % lower(oz_unaccent($1))`;

describe('recherche plein texte (search_vector)', () => {
  it.each(['Ngassa', 'ngassa', 'NGASSA'])('« %s » trouve le joueur', async (term) => {
    const rows = await db.query<{ last_name: string }>(FULL_TEXT, [term]);
    expect(rows.map((r) => r.last_name)).toContain('Ngassa');
  });

  it('ignore les accents, dans la requête comme dans la fiche', async () => {
    expect((await db.query(FULL_TEXT, ['eloise'])).length).toBe(1);
    expect((await db.query(FULL_TEXT, ['Yaounde'])).length).toBeGreaterThanOrEqual(1);
  });

  it('couvre la ville et le poste, et suit les modifications', async () => {
    expect((await db.query(FULL_TEXT, ['ngassa striker'])).length).toBe(1);
    await db.query(`UPDATE players SET city = 'Bafoussam' WHERE last_name = 'Ngassa'`);
    expect((await db.query(FULL_TEXT, ['ngassa bafoussam'])).length).toBe(1);
  });
});

describe('recherche floue (trigrammes)', () => {
  it('« Ngasa » (faute de frappe) trouve « Ngassa »', async () => {
    const rows = await db.query<{ last_name: string }>(FUZZY, ['Ngasa']);
    expect(rows.map((r) => r.last_name)).toContain('Ngassa');
  });
});

describe('les index servent la recherche', () => {
  const plan = async (sql: string, term: string): Promise<string> => {
    const client = new pg.Client({ connectionString: db.url });
    await client.connect();
    try {
      await client.query('BEGIN');
      // Sur 500 lignes le parcours séquentiel peut gagner : on vérifie que l'index est utilisable.
      await client.query('SET LOCAL enable_seqscan = off');
      const { rows } = await client.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN ${sql.replace('$1', `'${term}'`)}`,
      );
      return rows.map((r) => r['QUERY PLAN']).join('\n');
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  };

  it.each(['Ngassa', 'ngassa'])('plein texte « %s » : index GIN search_vector', async (term) => {
    expect(await plan(FULL_TEXT, term)).toContain('players_search_vector_idx');
  });

  it('floue « Ngasa » : index trigrammes sur le nom', async () => {
    expect(await plan(FUZZY, 'Ngasa')).toContain('players_last_name_trgm_idx');
  });

  it('oz_unaccent est IMMUTABLE (utilisable dans un index)', async () => {
    const [row] = await db.query<{ volatility: string }>(
      `SELECT provolatile AS volatility FROM pg_proc WHERE proname = 'oz_unaccent'`,
    );
    expect(row?.volatility).toBe('i');
  });
});
