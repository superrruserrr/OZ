import { describe, expect, it } from 'vitest';
import { smtpTransportOptions } from './smtp-auth-mailer.js';

const local = {
  host: 'localhost',
  port: 1025,
  user: undefined,
  password: undefined,
  requireTls: false,
};

describe('options du transport SMTP', () => {
  it('Mailpit en local : sans TLS ni identifiants', () => {
    const options = smtpTransportOptions(local);
    expect(options).toMatchObject({ secure: false, requireTLS: false, ignoreTLS: true });
    expect(options.auth).toBeUndefined();
  });

  it('recette et production sur 587 : STARTTLS obligatoire, certificat vérifié, identifiants', () => {
    const options = smtpTransportOptions({
      host: 'smtp.tem.scaleway.com',
      port: 587,
      user: 'projet',
      password: 'secret',
      requireTls: true,
    });
    expect(options).toMatchObject({
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      auth: { user: 'projet', pass: 'secret' },
      tls: { rejectUnauthorized: true },
    });
  });

  it('port 465 : TLS implicite dès la connexion', () => {
    const options = smtpTransportOptions({ ...local, port: 465, user: 'u', requireTls: true });
    expect(options).toMatchObject({ secure: true, requireTLS: false, ignoreTLS: false });
    expect(options.auth).toEqual({ user: 'u', pass: '' });
  });
});
