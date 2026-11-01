import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formToken, startAuthHarness, tokenIn, type AuthHarness } from './auth-harness.js';

// IP du client derrière un mandataire de confiance (lot 1.3ca, D7, D-070).

const PASSWORD = 'correct horse battery staple';
let harness: AuthHarness;
let server: App;
let counter = 0;

async function account(): Promise<string> {
  const address = `proxy-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  return address;
}

async function sessionIpAfterLogin(forwardedFor: string): Promise<string | undefined> {
  const address = await account();
  await request(server)
    .post('/auth/login')
    .set('X-Forwarded-For', forwardedFor)
    .send({ email: address, password: PASSWORD })
    .expect(200);
  const { rows } = await harness.db.query<{ ip: string }>(
    `SELECT s.ip::text AS ip FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1`,
    [address],
  );
  return rows[0]?.ip;
}

beforeAll(async () => {
  harness = await startAuthHarness({ TRUST_PROXY: '1' });
  server = harness.app.getHttpServer();
});
afterAll(async () => {
  await harness.stop();
});

describe('TRUST_PROXY=1', () => {
  it('retient l’adresse ajoutée par le mandataire', async () => {
    expect(await sessionIpAfterLogin('198.51.100.7')).toBe('198.51.100.0/24');
  });

  it('ignore les adresses falsifiées par le client en tête de X-Forwarded-For', async () => {
    expect(await sessionIpAfterLogin('203.0.113.66, 198.51.100.7')).toBe('198.51.100.0/24');
  });
});
