import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Chiffrement colonne pgcrypto (plan §5.1, §6.9 ; décision D2 du lot 1.1).
const KEY = 'k'.repeat(40);
const OTHER_KEY = 'o'.repeat(40);

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});
afterAll(async () => {
  await db.stop();
});

const one = async <T extends Record<string, unknown>>(
  sql: string,
  values: unknown[],
): Promise<T | undefined> => (await db.query<T>(sql, values))[0];

describe('oz_encrypt / oz_decrypt', () => {
  it('chiffre en AES-256 et retrouve la valeur avec la même clé', async () => {
    const row = await one<{ clear: string; cipher: Buffer }>(
      `SELECT oz_encrypt('+237 6 99 00 00 00', $1) AS cipher,
              oz_decrypt(oz_encrypt('+237 6 99 00 00 00', $1), $1) AS clear`,
      [KEY],
    );
    expect(row?.clear).toBe('+237 6 99 00 00 00');
    expect(row?.cipher.toString('latin1')).not.toContain('99 00');
  });

  it('deux chiffrements de la même valeur diffèrent (aléa)', async () => {
    const row = await one<{ same: boolean }>(
      `SELECT oz_encrypt('valeur', $1) = oz_encrypt('valeur', $1) AS same`,
      [KEY],
    );
    expect(row?.same).toBe(false);
  });

  it('une mauvaise clé lève une erreur, jamais un texte faux', async () => {
    await expect(
      db.query(`SELECT oz_decrypt(oz_encrypt('valeur', $1), $2)`, [KEY, OTHER_KEY]),
    ).rejects.toThrow(/Wrong key or corrupt data/);
  });

  it.each([
    ['vide', ''],
    ['trop courte', 'courte'],
  ])('refuse une clé %s', async (_label, key) => {
    await expect(db.query(`SELECT oz_encrypt('valeur', $1)`, [key])).rejects.toThrow(
      /clé de chiffrement/,
    );
    await expect(db.query(`SELECT oz_blind_index('valeur', $1)`, [key])).rejects.toThrow(
      /clé de chiffrement/,
    );
  });

  it('NULL reste NULL (colonnes facultatives)', async () => {
    const row = await one<{ c: Buffer | null; d: string | null; h: Buffer | null }>(
      `SELECT oz_encrypt(NULL, $1) AS c, oz_decrypt(NULL, $1) AS d, oz_blind_index(NULL, $1) AS h`,
      [KEY],
    );
    expect(row).toEqual({ c: null, d: null, h: null });
  });
});

describe('oz_blind_index', () => {
  it('déterministe pour une clé, différent pour une autre (HMAC-SHA-256)', async () => {
    const row = await one<{ a: Buffer; b: Buffer; c: Buffer }>(
      `SELECT oz_blind_index('SYN-1', $1) AS a, oz_blind_index('SYN-1', $1) AS b,
              oz_blind_index('SYN-1', $2) AS c`,
      [KEY, OTHER_KEY],
    );
    expect(row?.a.equals(row.b)).toBe(true);
    expect(row?.a.equals(row.c)).toBe(false);
    expect(row?.a.length).toBe(32);
  });
});

describe('aucune clé dans le schéma', () => {
  it('les fonctions reçoivent la clé en paramètre : aucune constante de clé dans leur corps', async () => {
    const rows = await db.query<{ proname: string; prosrc: string; pronargs: number }>(
      `SELECT proname, prosrc, pronargs FROM pg_proc
       WHERE proname IN ('oz_encrypt', 'oz_decrypt', 'oz_blind_index')`,
    );
    expect(rows.map((r) => r.proname).sort()).toEqual([
      'oz_blind_index',
      'oz_decrypt',
      'oz_encrypt',
    ]);
    for (const row of rows) {
      expect(row.pronargs).toBe(2);
      expect(row.prosrc).not.toMatch(/current_setting|'[^']{32,}'/);
    }
  });
});
