/** Exécute une requête de lecture sur une base migrée. */
export type CatalogQuery = (sql: string) => Promise<unknown[]>;

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_pk: boolean;
  is_fk: boolean;
}

interface RelationRow {
  child: string;
  parent: string;
  columns: string;
  mandatory: boolean;
}

/** Tables d'outillage, hors modèle métier. */
const EXCLUDED_TABLES = ['_prisma_migrations'];

const HEADER = `# Diagramme entités-relations

Généré depuis le catalogue PostgreSQL d'une base migrée (EX-101 n° 7) : ne pas modifier à la main.
Régénérer avec \`pnpm --filter @oz/db db:er\` ; un test échoue si ce fichier n'est plus à jour.
Les partitions mensuelles de \`audit_log\` ne sont pas représentées.
`;

/** Type lisible par Mermaid : un seul mot, sans précision ni espace. */
function mermaidType(type: string): string {
  const base = type.replace(/\(.*?\)/g, '').trim();
  const aliases: Record<string, string> = {
    'timestamp with time zone': 'timestamptz',
    'timestamp without time zone': 'timestamp',
    'character varying': 'varchar',
  };
  return (aliases[base] ?? base).replace(/\s+/g, '_').replace(/\[\]$/, '_array');
}

/**
 * Diagramme Mermaid de toutes les tables du schéma public (hors partitions), de leurs colonnes et de
 * leurs clés étrangères, dans un ordre stable : deux bases au même schéma donnent le même texte.
 */
export async function renderErDiagram(query: CatalogQuery): Promise<string> {
  const excluded = EXCLUDED_TABLES.map((t) => `'${t}'`).join(', ');
  const columns = (await query(`
    SELECT c.relname AS table_name, a.attname AS column_name,
           format_type(a.atttypid, a.atttypmod) AS data_type,
           EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p'
                   AND a.attnum = ANY (k.conkey)) AS is_pk,
           EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f'
                   AND a.attnum = ANY (k.conkey)) AS is_fk
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND c.relname NOT IN (${excluded})
    ORDER BY c.relname, a.attnum`)) as ColumnRow[];
  const relations = (await query(`
    SELECT c.relname AS child, p.relname AS parent,
           (SELECT string_agg(a.attname, ',' ORDER BY k.ord) FROM unnest(f.conkey) WITH ORDINALITY AS k(num, ord)
              JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.num) AS columns,
           (SELECT bool_and(a.attnotnull) FROM unnest(f.conkey) AS k(num)
              JOIN pg_attribute a ON a.attrelid = f.conrelid AND a.attnum = k.num) AS mandatory
    FROM pg_constraint f
    JOIN pg_class c ON c.oid = f.conrelid
    JOIN pg_class p ON p.oid = f.confrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE f.contype = 'f' AND n.nspname = 'public' AND NOT c.relispartition AND f.conparentid = 0`)) as RelationRow[];
  // Tri par point de code : indépendant de la collation de la base.
  const key = (r: RelationRow): string => `${r.child}\u0000${r.parent}\u0000${r.columns}`;
  relations.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

  const lines = ['```mermaid', 'erDiagram'];
  let current = '';
  for (const column of columns) {
    if (column.table_name !== current) {
      if (current) lines.push('  }');
      current = column.table_name;
      lines.push(`  ${current} {`);
    }
    const keys = [column.is_pk ? 'PK' : '', column.is_fk ? 'FK' : ''].filter(Boolean).join(',');
    lines.push(
      `    ${mermaidType(column.data_type)} ${column.column_name}${keys ? ` ${keys}` : ''}`,
    );
  }
  if (current) lines.push('  }');
  for (const relation of relations) {
    const cardinality = relation.mandatory ? '||' : 'o|';
    lines.push(`  ${relation.child} }o--${cardinality} ${relation.parent} : "${relation.columns}"`);
  }
  lines.push('```');
  return `${HEADER}\n${lines.join('\n')}\n`;
}
