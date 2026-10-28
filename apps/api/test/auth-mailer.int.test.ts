import { loadApiConfig, type AuthConfig } from '@oz/config';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SmtpAuthMailer } from '../src/auth/mail/smtp-auth-mailer.js';
import { MAILPIT_IMAGE, smtpHost, testKey } from './containers.js';
import { validEnv } from './support.js';

// Envoi réel par SMTP vers un Mailpit jetable (même image que le poste local).

let mailpit: StartedTestContainer;
let api: string;
let config: AuthConfig;

interface MailpitMessage {
  readonly ID: string;
  readonly Subject: string;
  readonly To: readonly { readonly Address: string }[];
  readonly From: { readonly Address: string; readonly Name: string };
}

async function messages(): Promise<MailpitMessage[]> {
  const response = await fetch(`${api}/api/v1/messages`);
  return ((await response.json()) as { messages: MailpitMessage[] }).messages;
}

beforeAll(async () => {
  mailpit = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  api = `http://${mailpit.getHost()}:${String(mailpit.getMappedPort(8025))}`;
  const auth = loadApiConfig({
    ...validEnv,
    FEATURE_AUTH: 'true',
    APP_URL: 'http://localhost:3000',
    // IP : nodemailer résout le nom par DNS (resolve4), lent pour « localhost » sur certains postes.
    SMTP_HOST: smtpHost(mailpit.getHost()),
    SMTP_PORT: String(mailpit.getMappedPort(1025)),
    EMAIL_FROM: 'OZ <no-reply@oz.localhost>',
    AUTH_HMAC_KEY: 'h'.repeat(40),
    JWT_ACCESS_SECRET: testKey(1),
    JWT_REFRESH_SECRET: testKey(2),
  }).auth;
  if (auth === undefined) throw new Error('configuration auth absente');
  config = auth;
});
afterAll(async () => {
  await mailpit.stop();
});

describe('SmtpAuthMailer', () => {
  it('envoie les quatre emails depuis l’expéditeur configuré', async () => {
    const mailer = new SmtpAuthMailer(config);
    const token = 'T'.repeat(43);
    await mailer.sendVerification('a@example.test', token);
    await mailer.sendAlreadyRegistered('b@example.test');
    await mailer.sendPasswordReset('c@example.test', token);
    await mailer.sendPasswordChanged('d@example.test');
    const received = await messages();
    expect(received.map((m) => m.Subject).sort()).toEqual([
      'Confirmez votre adresse email',
      'Réinitialisation de votre mot de passe',
      'Votre mot de passe a été modifié',
      'Vous avez déjà un compte OZ',
    ]);
    expect(received.every((m) => m.From.Address === 'no-reply@oz.localhost')).toBe(true);
    const verification = received.find((m) => m.To[0]?.Address === 'a@example.test');
    const body = await (await fetch(`${api}/api/v1/message/${verification?.ID ?? ''}`)).json();
    expect((body as { Text: string }).Text).toContain(
      `http://localhost:3000/auth/verify-email#token=${token}`,
    );
  });

  it('remonte une erreur quand le serveur SMTP est injoignable', async () => {
    const mailer = new SmtpAuthMailer({ ...config, smtp: { ...config.smtp, port: 1 } });
    await expect(mailer.sendPasswordChanged('x@example.test')).rejects.toThrow();
  });
});
