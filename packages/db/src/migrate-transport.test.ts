import { describe, expect, it } from 'vitest';
import { assertPinnedTransport, migrationCaCert, relayPlan } from './migrate-transport.js';

const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';
const REMOTE = 'postgresql://oz_migrator:pw@10.10.0.5:5432/oz?sslmode=require';

describe('assertPinnedTransport (D-039)', () => {
  it.each(['staging', 'production'])('%s sans DATABASE_CA_CERT : refusé', (appEnv) => {
    expect(() => {
      assertPinnedTransport({ APP_ENV: appEnv }, REMOTE);
    }).toThrow(/DATABASE_CA_CERT/);
    expect(() => {
      assertPinnedTransport({ APP_ENV: appEnv, DATABASE_CA_CERT: '' }, REMOTE);
    }).toThrow(/DATABASE_CA_CERT/);
  });

  it('autorité fournie mais connexion directe à la base : refusé (prisma migrate deploy à la main)', () => {
    expect(() => {
      assertPinnedTransport({ APP_ENV: 'staging', DATABASE_CA_CERT: CA }, REMOTE);
    }).toThrow(/pnpm db:migrate/);
  });

  it('autorité fournie et URL du relais local : accepté', () => {
    const relayed = relayPlan(REMOTE).relayedUrl(40000);
    expect(() => {
      assertPinnedTransport({ APP_ENV: 'staging', DATABASE_CA_CERT: CA }, relayed);
    }).not.toThrow();
  });

  it('poste et CI sans autorité : connexion directe permise', () => {
    expect(() => {
      assertPinnedTransport({ APP_ENV: 'local' }, 'postgresql://oz:oz@localhost:5432/oz');
    }).not.toThrow();
    expect(() => {
      assertPinnedTransport({}, 'postgresql://oz:oz@localhost:5432/oz');
    }).not.toThrow();
  });
});

describe('relayPlan', () => {
  it('vise la vraie base, et envoie Prisma au relais local sans paramètre TLS', () => {
    const plan = relayPlan(`${REMOTE}&sslaccept=accept_invalid_certs&sslcert=/x`);
    expect(plan.target).toEqual({ host: '10.10.0.5', port: 5432, database: 'oz' });
    expect(plan.relayedUrl(40000)).toBe(
      'postgresql://oz_migrator:pw@127.0.0.1:40000/oz?sslmode=disable',
    );
  });

  it('refuse une URL ambiguë (paramètre de redirection)', () => {
    expect(() => relayPlan(`${REMOTE}&host=autre`)).toThrow(/ambiguë/);
  });
});

describe('migrationCaCert', () => {
  it('accepte les \\n littéraux et traite le vide comme absent', () => {
    expect(migrationCaCert({ DATABASE_CA_CERT: CA.replaceAll('\n', '\\n') })).toBe(CA);
    expect(migrationCaCert({ DATABASE_CA_CERT: '  ' })).toBeUndefined();
  });
});
