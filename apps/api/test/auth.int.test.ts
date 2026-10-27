import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { ApiError } from '../src/common/errors/api-error.js';
import { PwnedPasswordsClient } from '@oz/auth';
import { AuthService } from '../src/auth/auth.service.js';
import { PWNED_CLIENT } from '../src/auth/auth.tokens.js';
import { RESPONSE_FLOOR_MS, startAuthHarness, tokenIn, type AuthHarness } from './auth-harness.js';
import { testConfig } from './support.js';

const PASSWORD = 'correct horse battery staple';
const errorOf = (response: { body: unknown }): ApiError => response.body as ApiError;
let harness: AuthHarness;
let server: App;
let counter = 0;
const email = (): string => `personne-${String(++counter)}@example.test`;

const register = (address: string, password = PASSWORD) =>
  request(server).post('/auth/register').send({ email: address, password });

async function registerAndToken(address = email()): Promise<{ address: string; token: string }> {
  await register(address).expect(202);
  return {
    address,
    token: tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email')),
  };
}

const userOf = async (address: string) =>
  (
    await harness.db.query<{
      status: string;
      email_verified_at: Date | null;
      password_hash: string;
    }>('SELECT status, email_verified_at, password_hash FROM users WHERE email = $1', [address])
  ).rows[0];

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
});
afterAll(async () => {
  await harness.stop();
});

describe('POST /auth/register', () => {
  it('crée le compte en attente et envoie le lien de confirmation', async () => {
    const address = email();
    const response = await register(` ${address.toUpperCase()} `).expect(202);
    expect(response.body).toEqual({ status: 'accepted' });
    expect((await userOf(address))?.status).toBe('pending_verification');
    expect((await userOf(address))?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    const text = await harness.mailTo(address, 'Confirmez votre adresse email');
    expect(text).toContain('http://localhost:3000/auth/verify-email#token=');
  });

  it('répond pareil pour une adresse déjà prise, et prévient son titulaire par email (EX-103 n° 10)', async () => {
    const address = email();
    await register(address).expect(202);
    const before = await userOf(address);
    const again = await register(address, 'un tout autre mot de passe').expect(202);
    expect(again.body).toEqual({ status: 'accepted' });
    await harness.mailTo(address, 'Vous avez déjà un compte OZ');
    expect((await userOf(address))?.password_hash).toBe(before?.password_hash);
  });

  it('ne répond jamais avant la durée plancher, compte nouveau ou existant (CP-28)', async () => {
    const address = email();
    for (let i = 0; i < 2; i++) {
      const started = performance.now();
      await register(address).expect(202);
      expect(performance.now() - started).toBeGreaterThanOrEqual(RESPONSE_FLOOR_MS - 5);
    }
  });

  it('refuse un mot de passe trop court avant toute écriture', async () => {
    const address = email();
    const response = await register(address, 'court').expect(422);
    expect(errorOf(response).code).toBe('VALIDATION_FAILED');
    expect(errorOf(response).details).toEqual([
      { field: 'password', code: 'AUTH_PASSWORD_TOO_SHORT' },
    ]);
    expect(await userOf(address)).toBeUndefined();
  });

  it('refuse un mot de passe présent dans HaveIBeenPwned', async () => {
    harness.pwned = 'breached';
    try {
      const address = email();
      const response = await register(address).expect(422);
      expect(errorOf(response).code).toBe('AUTH_PASSWORD_BREACHED');
      expect(await userOf(address)).toBeUndefined();
    } finally {
      harness.pwned = 'clean';
    }
  });

  it('accepte et journalise quand HaveIBeenPwned est indisponible (D1)', async () => {
    harness.pwned = 'unavailable';
    try {
      const address = email();
      await register(address).expect(202);
      expect((await userOf(address))?.status).toBe('pending_verification');
      await harness.logs.waitFor('auth.pwned.unavailable');
      expect(harness.logs.raw()).not.toContain(address);
    } finally {
      harness.pwned = 'clean';
    }
  });

  it('refuse une clé inconnue (aucun statut choisi par le client)', async () => {
    await request(server)
      .post('/auth/register')
      .send({ email: email(), password: PASSWORD, status: 'active' })
      .expect(422);
  });
});

describe('POST /auth/verify-email', () => {
  it('active le compte une seule fois', async () => {
    const { address, token } = await registerAndToken();
    const response = await request(server).post('/auth/verify-email').send({ token }).expect(200);
    expect(response.body).toEqual({ status: 'verified' });
    expect((await userOf(address))?.status).toBe('active');
    const again = await request(server).post('/auth/verify-email').send({ token }).expect(400);
    expect(errorOf(again).code).toBe('AUTH_TOKEN_INVALID');
  });

  it('même refus pour un jeton inconnu ou mal formé', async () => {
    const unknown = await request(server)
      .post('/auth/verify-email')
      .send({ token: 'A'.repeat(43) })
      .expect(400);
    expect(errorOf(unknown).code).toBe('AUTH_TOKEN_INVALID');
    await request(server).post('/auth/verify-email').send({ token: 'abc' }).expect(422);
  });
});

describe('réinitialisation du mot de passe', () => {
  it('même réponse pour un compte inconnu, sans email envoyé', async () => {
    const address = email();
    const response = await request(server)
      .post('/auth/password/forgot')
      .send({ email: address })
      .expect(202);
    expect(response.body).toEqual({ status: 'accepted' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await harness.subjectsTo(address)).toEqual([]);
  });

  it('envoie le lien, remplace le mot de passe une fois et prévient le titulaire', async () => {
    const { address } = await registerAndToken();
    const before = (await userOf(address))?.password_hash;
    await request(server).post('/auth/password/forgot').send({ email: address }).expect(202);
    const token = tokenIn(await harness.mailTo(address, 'Réinitialisation de votre mot de passe'));
    const body = { token, password: 'un nouveau mot de passe solide' };
    expect(
      (await request(server).post('/auth/password/reset').send(body).expect(200)).body,
    ).toEqual({
      status: 'reset',
    });
    const after = await userOf(address);
    expect(after?.password_hash).not.toBe(before);
    expect(after?.status).toBe('active');
    await harness.mailTo(address, 'Votre mot de passe a été modifié');
    const reused = await request(server).post('/auth/password/reset').send(body).expect(400);
    expect(errorOf(reused).code).toBe('AUTH_TOKEN_INVALID');
  });

  it('refuse un nouveau mot de passe compromis', async () => {
    harness.pwned = 'breached';
    try {
      const response = await request(server)
        .post('/auth/password/reset')
        .send({ token: 'A'.repeat(43), password: PASSWORD })
        .expect(422);
      expect(errorOf(response).code).toBe('AUTH_PASSWORD_BREACHED');
    } finally {
      harness.pwned = 'clean';
    }
  });
});

describe('journaux', () => {
  it('ne contiennent ni jeton, ni mot de passe, ni adresse', async () => {
    const { address, token } = await registerAndToken();
    await request(server).post('/auth/verify-email').send({ token }).expect(200);
    await harness.app.get(AuthService).flushMail();
    const raw = harness.logs.raw();
    expect(raw).not.toContain(token);
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(address);
  });
});

describe('drapeau FEATURE_AUTH (R13)', () => {
  it('monte le module avec le vrai client HaveIBeenPwned, sans connexion au démarrage', async () => {
    const enabled = await createApp(
      testConfig({
        FEATURE_AUTH: 'true',
        APP_URL: 'http://localhost:3000',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1',
        EMAIL_FROM: 'no-reply@oz.localhost',
        AUTH_HMAC_KEY: 'h'.repeat(40),
      }),
    );
    await enabled.init();
    try {
      expect(enabled.get(PWNED_CLIENT)).toBeInstanceOf(PwnedPasswordsClient);
    } finally {
      await enabled.close();
    }
  });

  it('journalise un échec d’envoi sans l’adresse, et répond quand même', async () => {
    const broken = await startAuthHarness({ SMTP_PORT: '1' });
    try {
      const address = email();
      const response = await request(broken.app.getHttpServer())
        .post('/auth/register')
        .send({ email: address, password: PASSWORD })
        .expect(202);
      expect(response.body).toEqual({ status: 'accepted' });
      await broken.app.get(AuthService).flushMail();
      // nestjs-pino garde un seul logger racine par processus : celui du premier banc démarré.
      await harness.logs.waitFor('auth.mail.failed', 15_000);
      expect(harness.logs.raw()).toMatch(
        /"event":"auth.mail.failed","kind":"verification","code":"E[A-Z]+"/,
      );
      expect(harness.logs.raw()).not.toContain(address);
    } finally {
      await broken.stop();
    }
  }, 180_000); // second banc complet : même délai que les hooks

  it('routes absentes (404) quand il est désactivé', async () => {
    const disabled = await createApp(testConfig({ FEATURE_AUTH: 'false' }));
    await disabled.init();
    try {
      for (const path of [
        '/auth/register',
        '/auth/verify-email',
        '/auth/password/forgot',
        '/auth/password/reset',
      ]) {
        await request(disabled.getHttpServer()).post(path).send({}).expect(404);
      }
    } finally {
      await disabled.close();
    }
  });
});
