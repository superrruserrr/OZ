import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations, MIGRATIONS_DIR } from '../src/migrations.js';
import { rollbackLast } from '../src/rollback.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
});
afterAll(async () => {
  await db.stop();
});

const applied = async (): Promise<string[]> =>
  (
    await db.query<{ migration_name: string }>(
      'SELECT migration_name FROM _prisma_migrations ORDER BY started_at',
    )
  ).map((row) => row.migration_name);

const tableExists = async (name: string): Promise<boolean> =>
  (await db.query<{ t: string | null }>('SELECT to_regclass($1)::text AS t', [name]))[0]?.t !==
  null;

const columnExists = async (table: string, column: string): Promise<boolean> =>
  (
    await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      [table, column],
    )
  )[0]?.n === 1;

const functionExists = async (name: string): Promise<boolean> =>
  (
    await db.query<{ n: number }>('SELECT count(*)::int AS n FROM pg_proc WHERE proname = $1', [
      name,
    ])
  )[0]?.n !== 0;

const policyExists = async (table: string, name: string): Promise<boolean> =>
  (
    await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM pg_policies WHERE tablename = $1 AND policyname = $2',
      [table, name],
    )
  )[0]?.n === 1;

describe('rollbackLast (db:rollback)', () => {
  it('annule la dernière migration et retire sa trace dans _prisma_migrations', async () => {
    await migrateDeploy(db);
    const last = listMigrations(MIGRATIONS_DIR).at(-1)?.name;
    expect(await applied()).toContain(last);
    // Un document rejeté (lot 1.9b) ne bloque pas le retour arrière : il redevient `error`.
    const [rejected] = await db.query<{ id: string }>(
      `WITH u AS (INSERT INTO users (email) VALUES ('retour@example.test') RETURNING id),
        p AS (INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
          SELECT id, 'Retour', 'Synthétique', '1995-03-04', 'CM', 'CM', 'declared' FROM u RETURNING id, user_id)
       INSERT INTO documents (type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256,
         retention_until, av_status, rejection_reason)
       SELECT 'photo', p.id, p.user_id, 'quarantine/retour', 'image/png', 10, repeat('a', 64),
         now() + interval '1 day', 'rejected', 'dimensions' FROM p RETURNING id::text`,
    );

    // Une pièce purgée (lot 1.9ca) ne bloque pas le retour arrière : la colonne disparaît.
    await db.query('UPDATE documents SET purged_at = now() WHERE id = $1', [rejected?.id]);
    // Lot 1.9cb : un rejet `too_large` et l'empreinte seule d'un numéro purgé non plus.
    const [tooLarge] = await db.query<{ id: string }>(
      `INSERT INTO documents (type, player_id, uploaded_by, storage_key, mime_type, size_bytes, sha256,
         retention_until, av_status, rejection_reason, document_number_encrypted, document_number_hmac)
       SELECT type, player_id, uploaded_by, 'quarantine/trop-grand', mime_type, size_bytes, sha256,
         retention_until, 'rejected', 'too_large', '\\x01'::bytea, '\\x02'::bytea
       FROM documents WHERE id = $1 RETURNING id::text`,
      [rejected?.id],
    );
    await db.query(
      'UPDATE documents SET purged_at = now(), document_number_encrypted = NULL WHERE id = $1',
      [tooLarge?.id],
    );

    // Dernière migration (lot 1.16bb) : une archive prête ne bloque pas le retour arrière.
    await db.query(
      `INSERT INTO data_export_requests (id, user_id, status, storage_key, ready_at, expires_at)
       SELECT r, id, 'ready', 'exports/' || r || '.json', now(), now() + interval '7 days'
       FROM users, gen_random_uuid() AS r WHERE email = 'retour@example.test'`,
    );
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBe(last);
    expect(await applied()).not.toContain(last);
    for (const fn of [
      'claim',
      'finish',
      'fail',
      'due',
      'expire',
      'download',
      'worker_only',
      'account_live',
    ]) {
      expect(await functionExists(`oz_data_export_${fn}`), fn).toBe(false);
    }
    expect(
      await db.query(
        `SELECT 1 FROM pg_constraint WHERE conname LIKE 'data_export_requests_%_reason_check'
           OR conname = 'data_export_requests_storage_key_check'`,
      ),
    ).toEqual([]);

    // Lot 1.16ba : une demande d'export ne bloque pas le retour arrière.
    const before16ba = listMigrations(MIGRATIONS_DIR).at(-2)?.name;
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBe(
      before16ba,
    );
    expect(await applied()).not.toContain(before16ba);
    expect(await tableExists('data_export_requests')).toBe(false);
    expect(await functionExists('oz_personal_data_export')).toBe(false);
    expect(await functionExists('oz_data_export_request')).toBe(false);
    expect(await policyExists('kyc_cases', 'kyc_cases_privileged_read')).toBe(false);
    expect(await policyExists('notifications', 'notifications_privileged_read')).toBe(false);

    // Lot 1.13a : une visibilité réglée ne bloque pas le retour arrière.
    await db.query(
      `UPDATE players SET visibility = '{"sport": false}'
       WHERE user_id = (SELECT id FROM users WHERE email = 'retour@example.test')`,
    );
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBe(
      listMigrations(MIGRATIONS_DIR).at(-3)?.name,
    );
    expect(await functionExists('oz_player_set_visibility')).toBe(false);
    expect(await functionExists('oz_player_kyc_level')).toBe(false);
    expect(await functionExists('oz_players_visibility_guard')).toBe(false);
    expect(
      await db.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'players_visibility_blocks_check'`,
      ),
    ).toEqual([]);

    // Lot 1.16a : fonctions du worker, vérifications et lecture admin retirées.
    const result = await rollbackLast({ databaseUrl: db.url, appEnv: 'local' });
    expect(result.rolledBack).toBe(listMigrations(MIGRATIONS_DIR).at(-4)?.name);
    expect(await tableExists('audit_chain_checks')).toBe(false);
    expect(await functionExists('oz_audit_check')).toBe(false);
    expect(await functionExists('oz_audit_head')).toBe(false);
    expect(await functionExists('oz_audit_maintain_partitions')).toBe(false);
    expect(await policyExists('audit_log', 'audit_log_admin_read')).toBe(false);
    expect(await policyExists('audit_log', 'audit_log_privileged_read')).toBe(false);
    expect(await functionExists('oz_audit_verify_chain')).toBe(true);

    // Lot 1.9cb : fonctions de purge retirées, anciennes contraintes rétablies.
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBe(
      listMigrations(MIGRATIONS_DIR).at(-5)?.name,
    );
    expect(await functionExists('oz_document_purge_due')).toBe(false);
    expect(await functionExists('oz_document_storage_orphans')).toBe(false);
    expect(await policyExists('audit_log', 'audit_log_privileged_read_document_reads')).toBe(false);
    expect(
      await db.query('SELECT rejection_reason, document_number_hmac FROM documents WHERE id = $1', [
        tooLarge?.id,
      ]),
    ).toEqual([{ rejection_reason: 'dimensions', document_number_hmac: null }]);

    // Lot 1.9ca, les précédentes intactes.
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBe(
      listMigrations(MIGRATIONS_DIR).at(-6)?.name,
    );
    expect(await columnExists('documents', 'purged_at')).toBe(false);
    expect(await policyExists('documents', 'documents_admin_read')).toBe(false);
    expect(await functionExists('oz_document_subject_live')).toBe(false);
    const [readGuard] = await db.query<{ src: string }>(
      `SELECT prosrc AS src FROM pg_proc WHERE proname = 'oz_documents_guard'`,
    );
    expect(readGuard?.src).toContain('définitif');
    expect(readGuard?.src).not.toContain('purged_at');
    expect(await functionExists('oz_document_scan_claim')).toBe(true);

    // Lot 1.9b : un document rejeté redevient `error`.
    const previous = listMigrations(MIGRATIONS_DIR).at(-7)?.name;
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBe(
      previous,
    );
    expect(await functionExists('oz_document_scan_claim')).toBe(false);
    expect(await functionExists('oz_document_scan_finish')).toBe(false);
    expect(await columnExists('documents', 'perceptual_hash')).toBe(false);
    expect(await tableExists('document_duplicates')).toBe(false);
    const [guard] = await db.query<{ src: string }>(
      `SELECT prosrc AS src FROM pg_proc WHERE proname = 'oz_documents_guard'`,
    );
    expect(guard?.src).toContain('NEW.storage_key, NEW.mime_type, NEW.size_bytes');
    expect(guard?.src).not.toContain('définitif');
    expect(await policyExists('documents', 'documents_privileged_update')).toBe(false);
    const labels = await db.query<{ label: string }>(
      `SELECT enumlabel AS label FROM pg_enum WHERE enumtypid = 'av_status'::regtype ORDER BY enumsortorder`,
    );
    expect(labels.map((l) => l.label)).toEqual(['pending', 'clean', 'infected', 'error']);
    const [after] = await db.query<{ av_status: string }>(
      'SELECT av_status::text FROM documents WHERE id = $1',
      [rejected?.id],
    );
    expect(after?.av_status).toBe('error');
    expect(await tableExists('document_uploads')).toBe(true);
    expect(await policyExists('documents', 'documents_privileged_insert')).toBe(true);
    expect(await functionExists('oz_has_verified_role')).toBe(true);
    expect(await policyExists('players', 'players_third_party_read')).toBe(true);
    expect(await policyExists('players', 'players_owner')).toBe(true);
    expect(await columnExists('users', 'phone_encrypted')).toBe(true);
    expect(await columnExists('users', 'totp_last_step')).toBe(true);
    expect(await tableExists('auth_recovery_codes')).toBe(true);
    expect(await tableExists('auth_tokens')).toBe(true);
    expect(await tableExists('oz_id_registry')).toBe(true);
    expect(await tableExists('users')).toBe(true);
    expect(await tableExists('system_settings')).toBe(true);
  });

  it('ne fait rien et le dit quand aucune migration n’est appliquée', async () => {
    while ((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack !== null) {
      // Annule les migrations restantes, une par une.
    }
    expect(await tableExists('system_settings')).toBe(false);
    expect((await rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rolledBack).toBeNull();
  });

  it('est atomique : un down.sql en erreur laisse la base et l’historique inchangés', async () => {
    await migrateDeploy(db);
    const before = await applied();
    const dir = mkdtempSync(join(tmpdir(), 'oz-broken-down-'));
    try {
      cpSync(MIGRATIONS_DIR, dir, { recursive: true });
      const last = listMigrations(dir).at(-1);
      // Première instruction valide, seconde en erreur : rien ne doit subsister de la première.
      writeFileSync(last?.downPath ?? '', 'DROP TABLE "system_settings";\nSELECT 1/0;\n');
      await expect(
        rollbackLast({ databaseUrl: db.url, appEnv: 'local', migrationsDir: dir }),
      ).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(await applied()).toEqual(before);
    expect(await tableExists('system_settings')).toBe(true);
  });

  it('refuse la production sans confirmation explicite, avant toute connexion', async () => {
    await expect(
      rollbackLast({ databaseUrl: 'postgresql://x:y@127.0.0.1:1/none', appEnv: 'production' }),
    ).rejects.toThrow(/production/);
  });

  it('refuse une migration appliquée absente du dépôt (pas de down.sql connu)', async () => {
    await db.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
       VALUES ('x', 'x', '29991231000000_inconnue', now(), now(), 1)`,
    );
    await expect(rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rejects.toThrow(
      /29991231000000_inconnue/,
    );
    await db.query(
      `DELETE FROM _prisma_migrations WHERE migration_name = '29991231000000_inconnue'`,
    );
  });

  it('refuse d’annuler par-dessus une migration en échec (à résoudre d’abord)', async () => {
    await migrateDeploy(db);
    await db.query(
      `INSERT INTO _prisma_migrations (id, checksum, migration_name, started_at, applied_steps_count)
       VALUES ('f', 'f', '29991231000001_echec', now(), 0)`,
    );
    try {
      await expect(rollbackLast({ databaseUrl: db.url, appEnv: 'local' })).rejects.toThrow(
        /échec.*29991231000001_echec/,
      );
    } finally {
      await db.query(
        `DELETE FROM _prisma_migrations WHERE migration_name = '29991231000001_echec'`,
      );
    }
  });

  it('refuse une URL visant un autre schéma que public', async () => {
    await expect(
      rollbackLast({ databaseUrl: `${db.url}?schema=kyc`, appEnv: 'local' }),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});
