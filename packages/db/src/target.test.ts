import { describe, expect, it } from 'vitest';
import { cliEnvironment, databaseTarget } from './target.js';

describe('databaseTarget', () => {
  it('lit hôte, port et base', () => {
    expect(databaseTarget('postgresql://u:p@db.oz.test:6543/oz_copy?sslmode=require')).toEqual({
      host: 'db.oz.test',
      port: 6543,
      database: 'oz_copy',
    });
    expect(databaseTarget('postgres://u:p@localhost/oz').port).toBe(5432);
  });

  it('donne l’hôte tel que pg le contacte (décodé, IPv6 sans crochets)', () => {
    expect(databaseTarget('postgresql://u:p@pr%6Fd/oz').host).toBe('prod');
    expect(databaseTarget('postgresql://u:p@[::1]:5433/oz')).toEqual({
      host: '::1',
      port: 5433,
      database: 'oz',
    });
  });

  it('accepte les paramètres Prisma et pg sans effet sur la cible', () => {
    expect(
      databaseTarget(
        'postgresql://u:p@h/oz?schema=public&connection_limit=5&pool_timeout=10&pgbouncer=true&sslcert=a&sslkey=b',
      ).database,
    ).toBe('oz');
  });

  it.each([
    'postgresql://u:p@copy/oz?host=prod',
    'postgresql://u:p@copy/oz?hostaddr=10.0.0.1',
    'postgresql://u:p@copy/oz?dbname=prod',
    'postgresql://u:p@copy/oz?port=6000',
    'postgresql://u:p@copy/oz?options=-csearch_path%3Dkyc',
    'postgresql://u:p@copy/oz?schema=kyc',
    'postgresql://u:p@/oz',
    'postgresql://u:p@copy/',
    'postgresql://u:p@%2Fvar%2Frun%2Fpostgresql/oz',
    'http://u:p@copy/oz',
    'mysql://u:p@copy/oz',
  ])('refuse une URL dont la cible réelle pourrait différer (%s)', (url) => {
    expect(() => databaseTarget(url)).toThrow(/DATABASE_URL/);
  });
});

describe('cliEnvironment (commandes à risque : rollback, seed, anonymisation)', () => {
  const dotenv = 'DATABASE_URL=postgresql://oz:oz@localhost:5432/oz\nAPP_ENV=local\n';

  it('sur le poste, prend URL et APP_ENV dans le .env quand DATABASE_URL n’est pas définie', () => {
    expect(cliEnvironment({}, dotenv)).toEqual({
      databaseUrl: 'postgresql://oz:oz@localhost:5432/oz',
      appEnv: 'local',
    });
  });

  it('ne complète jamais une URL exportée à la main avec l’APP_ENV du .env', () => {
    expect(() => cliEnvironment({ DATABASE_URL: 'postgresql://u:p@prod-host/oz' }, dotenv)).toThrow(
      /APP_ENV/,
    );
  });

  it('exige APP_ENV explicite, même hors production', () => {
    expect(() =>
      cliEnvironment({ DATABASE_URL: 'postgresql://u:p@h/oz', NODE_ENV: 'development' }, ''),
    ).toThrow(/APP_ENV/);
  });

  it('traite une DATABASE_URL vide comme absente', () => {
    expect(cliEnvironment({ DATABASE_URL: '' }, dotenv).appEnv).toBe('local');
  });

  it('refuse un APP_ENV inconnu', () => {
    expect(() =>
      cliEnvironment({ DATABASE_URL: 'postgresql://u:p@h/oz', APP_ENV: 'prod' }, ''),
    ).toThrow(/APP_ENV/);
  });
});
