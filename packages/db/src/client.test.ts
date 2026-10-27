import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDbClient } from './client.js';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('createDbClient', () => {
  it.each(['', '   ', 'mysql://u:p@h/db', 'oz'])('refuse une URL de base invalide (%j)', (url) => {
    expect(() => createDbClient(url)).toThrow(/DATABASE_URL/);
  });

  it('accepte le certificat de l’instance (TLS épinglé, D-006), sans se connecter', async () => {
    const ca = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
    const client = createDbClient('postgresql://u:p@127.0.0.1:1/oz?sslmode=require', ca);
    expect(typeof client.$disconnect).toBe('function');
    await client.$disconnect();
  });

  it('crée un client Prisma pour une URL postgresql://, sans se connecter', async () => {
    const client = createDbClient('postgresql://u:p@127.0.0.1:1/oz');
    expect(typeof client.$disconnect).toBe('function');
    await client.$disconnect();
  });
});

describe('configuration Prisma', () => {
  it('ne contient aucune URL de base en dur (R8)', () => {
    for (const file of ['../prisma.config.ts', '../prisma/schema.prisma']) {
      expect(read(file), file).not.toMatch(/postgres(ql)?:\/\//);
    }
    expect(read('../prisma.config.ts')).toContain('process.env.DATABASE_URL');
  });

  it('migre avec DATABASE_MIGRATION_URL (rôle oz_migrator) quand elle est fournie', () => {
    expect(read('../prisma.config.ts')).toMatch(
      /process\.env\.DATABASE_MIGRATION_URL\s*\|\|\s*process\.env\.DATABASE_URL/,
    );
  });

  it('ne versionne pas le client généré', () => {
    expect(read('../../../.gitignore')).toMatch(/^packages\/db\/src\/generated\/$/m);
  });
});
