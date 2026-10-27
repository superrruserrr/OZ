import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderErDiagram } from '../src/er-diagram.js';
import { migrateDeploy, startDatabase, type TestDatabase } from './database.js';

// Diagramme entités-relations généré depuis le catalogue PostgreSQL (EX-101 n° 7).
const ER_FILE = new URL('../../../docs/data/er.md', import.meta.url);

let db: TestDatabase;
beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
});
afterAll(async () => {
  await db.stop();
});

describe('docs/data/er.md', () => {
  it('est à jour : régénéré sur une base migrée, il est identique (sinon : pnpm --filter @oz/db db:er)', async () => {
    const generated = await renderErDiagram((sql) => db.query(sql));
    expect(readFileSync(ER_FILE, 'utf8')).toBe(generated);
  });

  it('décrit chaque table métier et ses relations', async () => {
    const generated = await renderErDiagram((sql) => db.query(sql));
    expect(generated).toContain('```mermaid');
    for (const table of ['players', 'kyc_cases', 'documents', 'audit_log', 'subscriptions']) {
      expect(generated).toMatch(new RegExp(`^ {2}${table} \\{$`, 'm'));
    }
    expect(generated).toMatch(/players \}o--o\| guardians : "guardian_id"/);
    // Les partitions du journal ne sont pas des entités.
    expect(generated).not.toMatch(/audit_log_\d{4}_\d{2} \{/);
  });
});
