import { describe, expect, it, vi } from 'vitest';
import { dataExportReadyEmail, smtpTransportOptions, WorkerMailer } from './mailer.js';

const transport = vi.hoisted(() => ({ sendMail: vi.fn(() => Promise.resolve()), close: vi.fn() }));
vi.mock('nodemailer', () => ({ createTransport: vi.fn(() => transport) }));

// SMTP du worker (lot 1.16bb, D5).

const SMTP = {
  host: 'smtp.example.test',
  port: 587,
  user: 'oz',
  password: 'pw',
  from: 'OZ <no-reply@example.test>',
  appUrl: 'https://recette.example.test',
};

describe('smtpTransportOptions', () => {
  it('hors local : STARTTLS exigé, certificat vérifié, identifiants', () => {
    expect(smtpTransportOptions(SMTP, 'staging')).toMatchObject({
      host: 'smtp.example.test',
      port: 587,
      secure: false,
      requireTLS: true,
      ignoreTLS: false,
      auth: { user: 'oz', pass: 'pw' },
      tls: { rejectUnauthorized: true },
    });
  });

  it('465 : TLS implicite ; local (Mailpit) : sans TLS ni identifiants', () => {
    expect(smtpTransportOptions({ ...SMTP, port: 465 }, 'production')).toMatchObject({
      secure: true,
      requireTLS: false,
    });
    const local = smtpTransportOptions(
      { ...SMTP, port: 1025, user: undefined, password: undefined },
      'local',
    );
    expect(local).toMatchObject({ secure: false, requireTLS: false, ignoreTLS: true });
    expect(local).not.toHaveProperty('auth');
    expect(smtpTransportOptions({ ...SMTP, password: undefined }, 'staging').auth).toEqual({
      user: 'oz',
      pass: '',
    });
  });
});

describe('dataExportReadyEmail', () => {
  it('lien vers le site seul : ni URL signée, ni clé, ni donnée', () => {
    const mail = dataExportReadyEmail('https://recette.example.test');
    expect(mail.subject).toBe('Votre export de données OZ est prêt');
    expect(mail.text).toContain('7 jours');
    expect(mail.text).toContain('https://recette.example.test');
    for (const body of [mail.text, mail.html]) {
      expect(body).not.toMatch(/exports\/|X-Amz|Signature/);
    }
    expect(mail.html).toContain('<a href="https://recette.example.test">');
  });
});

describe('WorkerMailer', () => {
  it('envoie depuis EMAIL_FROM vers le titulaire, puis ferme le transport', async () => {
    const mailer = new WorkerMailer(SMTP, 'staging');
    await mailer.sendDataExportReady('titulaire@example.test');
    expect(transport.sendMail).toHaveBeenCalledWith({
      from: 'OZ <no-reply@example.test>',
      to: 'titulaire@example.test',
      ...dataExportReadyEmail('https://recette.example.test'),
    });
    mailer.close();
    expect(transport.close).toHaveBeenCalled();
  });
});
