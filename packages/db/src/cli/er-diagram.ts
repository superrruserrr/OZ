import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { renderErDiagram } from '../er-diagram.js';
import { commandEnvironment, fail } from './environment.js';

const ER_FILE = fileURLToPath(new URL('../../../../docs/data/er.md', import.meta.url));

// pnpm --filter @oz/db db:er — sur une base migrée à jour (pnpm db:migrate).
const client = new pg.Client({ connectionString: commandEnvironment().databaseUrl });
try {
  await client.connect();
  const diagram = await renderErDiagram(
    async (sql) => (await client.query<Record<string, unknown>>(sql)).rows,
  );
  mkdirSync(dirname(ER_FILE), { recursive: true });
  writeFileSync(ER_FILE, diagram);
  process.stdout.write(`✓ Diagramme entités-relations écrit dans docs/data/er.md.\n`);
} catch (error) {
  fail(error);
} finally {
  await client.end();
}
