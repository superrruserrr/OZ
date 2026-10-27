import { describe, expect, it } from 'vitest';
import { pgConnectionOptions, redisTlsOptions } from './tls.js';

const CA = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';

describe('pgConnectionOptions (D-006)', () => {
  it('sans certificat : URL transmise telle quelle, aucune option TLS (poste local, CI)', () => {
    expect(pgConnectionOptions('postgresql://oz:oz@localhost:5432/oz')).toEqual({
      connectionString: 'postgresql://oz:oz@localhost:5432/oz',
    });
  });

  it("avec certificat : vérifie la chaîne contre l'autorité de l'instance, refuse tout autre certificat", () => {
    const options = pgConnectionOptions('postgresql://oz_app:pw@10.10.0.5:5432/oz', CA);
    expect(options.ssl?.ca).toBe(CA);
    expect(options.ssl?.rejectUnauthorized).toBe(true);
  });

  it("avec certificat : retire les paramètres ssl* de l'URL, que pg ferait passer avant l'option ssl", () => {
    const options = pgConnectionOptions(
      'postgresql://oz_app:pw@10.10.0.5:5432/oz?sslmode=require&sslrootcert=/x&application_name=api',
      CA,
    );
    expect(options.connectionString).toBe(
      'postgresql://oz_app:pw@10.10.0.5:5432/oz?application_name=api',
    );
  });

  it("vérification de type verify-ca : l'adresse privée n'est pas dans le certificat Scaleway", () => {
    const options = pgConnectionOptions('postgresql://oz_app:pw@10.10.0.5:5432/oz', CA);
    expect(options.ssl?.checkServerIdentity?.('10.10.0.5', {} as never)).toBeUndefined();
  });
});

describe('redisTlsOptions (D-006)', () => {
  it('redis:// sans certificat : aucune option TLS', () => {
    expect(redisTlsOptions('redis://localhost:6379')).toEqual({});
  });

  it("rediss:// avec certificat : chaîne vérifiée contre l'autorité du cluster", () => {
    const options = redisTlsOptions('rediss://oz:pw@10.10.0.6:6379', CA);
    expect(options.tls?.ca).toBe(CA);
    expect(options.tls?.rejectUnauthorized).toBe(true);
  });

  it('refuse un certificat avec une URL redis:// en clair (certificat inutilisé, TLS oublié)', () => {
    expect(() => redisTlsOptions('redis://10.10.0.6:6379', CA)).toThrow(/rediss/);
  });
});
