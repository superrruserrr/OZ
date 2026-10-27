import { hash as rawHash } from '@node-rs/argon2';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CredentialsService } from '../src/auth/credentials.service.js';
import { REDIS_CLIENT } from '../src/database/database.module.js';
import type { Redis } from 'ioredis';
import { startAuthHarness, tokenIn, type AuthHarness } from './auth-harness.js';

const PASSWORD = 'correct horse battery staple';
let harness: AuthHarness;
let server: App;
let credentials: CredentialsService;
let redis: Redis;
let counter = 0;
const email = (): string => `identifiants-${String(++counter)}@example.test`;

async function account({ verified = true } = {}): Promise<string> {
  const address = email();
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD })
    .expect(202);
  if (verified) {
    const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
    await request(server).post('/auth/verify-email').send({ token }).expect(200);
  }
  return address;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  credentials = harness.app.get(CredentialsService);
  redis = harness.app.get(REDIS_CLIENT);
});
afterAll(async () => {
  await harness.stop();
});

describe('vérification des identifiants (EX-103 n° 8 à 10)', () => {
  it('accepte le bon mot de passe d’un compte vérifié, quelle que soit la casse de l’email', async () => {
    const address = await account();
    const result = await credentials.verify(address.toUpperCase(), PASSWORD);
    expect(result.result).toBe('ok');
  });

  it('même résultat « invalid » : compte inconnu, mauvais mot de passe, suspendu, supprimé', async () => {
    const wrong = await account();
    const suspended = await account();
    const deleted = await account();
    await harness.db.query("UPDATE users SET status = 'suspended' WHERE email = $1", [suspended]);
    await harness.db.query('UPDATE users SET deleted_at = now() WHERE email = $1', [deleted]);
    expect(await credentials.verify('inconnu@example.test', PASSWORD)).toEqual({
      result: 'invalid',
    });
    expect(await credentials.verify(wrong, 'pas le bon mot de passe')).toEqual({
      result: 'invalid',
    });
    expect(await credentials.verify(suspended, PASSWORD)).toEqual({ result: 'invalid' });
    expect(await credentials.verify(deleted, PASSWORD)).toEqual({ result: 'invalid' });
  });

  it('signale l’email non vérifié seulement après un mot de passe juste (n° 9)', async () => {
    const address = await account({ verified: false });
    expect(await credentials.verify(address, 'pas le bon mot de passe')).toEqual({
      result: 'invalid',
    });
    expect(await credentials.verify(address, PASSWORD)).toEqual({ result: 'email_unverified' });
  });

  it('impose un délai exponentiel dès 3 échecs, sans évaluer le mot de passe, jamais définitif (n° 8)', async () => {
    const address = await account();
    const t0 = Date.now();
    for (let i = 0; i < 3; i++) {
      expect((await credentials.verify(address, 'mauvais mot de passe', t0)).result).toBe(
        'invalid',
      );
    }
    // 3 échecs : 1 s d'attente ; même le bon mot de passe est refusé pendant le délai.
    expect(await credentials.verify(address, PASSWORD, t0 + 500)).toEqual({
      result: 'retry_later',
      retryAfterSeconds: 1,
    });
    // 4e échec après le délai : 2 s.
    expect((await credentials.verify(address, 'mauvais mot de passe', t0 + 1_100)).result).toBe(
      'invalid',
    );
    expect(await credentials.verify(address, PASSWORD, t0 + 1_200)).toEqual({
      result: 'retry_later',
      retryAfterSeconds: 2,
    });
    expect((await credentials.verify(address, PASSWORD, t0 + 3_200)).result).toBe('ok');
    // Le succès remet le compteur à zéro.
    expect((await credentials.verify(address, 'mauvais mot de passe', t0 + 3_300)).result).toBe(
      'invalid',
    );
    expect((await credentials.verify(address, PASSWORD, t0 + 3_400)).result).toBe('ok');
  });

  it('n’évalue pas plus de 3 mots de passe pour des tentatives parallèles', async () => {
    const address = await account();
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => credentials.verify(address, 'mauvais mot de passe', now)),
    );
    expect(results.filter((r) => r.result === 'invalid')).toHaveLength(3);
    expect(results.filter((r) => r.result === 'retry_later')).toHaveLength(7);
  });

  it('traite un compteur illisible comme aucun échec, sans planter', async () => {
    const address = await account();
    await redis.del(...(await redis.keys('oz:auth:failures:*')));
    await credentials.verify(address, 'mauvais mot de passe');
    const [key] = await redis.keys('oz:auth:failures:*');
    await redis.hset(key ?? 'absente', 'failures', 'abc', 'last', 'xyz');
    expect((await credentials.verify(address, PASSWORD)).result).toBe('ok');
  });

  it('compte les échecs d’un compte inconnu aussi, sans email en clair dans Redis', async () => {
    const address = 'inexistant-compteur@example.test';
    await credentials.verify(address, PASSWORD);
    const keys = await redis.keys('oz:auth:failures:*');
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.join(' ')).not.toContain('example.test');
    expect(keys.every((key) => /^oz:auth:failures:[0-9a-f]{64}$/.test(key))).toBe(true);
  });

  it('met à niveau un hash aux paramètres périmés après une connexion réussie', async () => {
    const address = await account();
    const weaker = await rawHash(PASSWORD, { memoryCost: 8192, timeCost: 1, parallelism: 1 });
    await harness.db.query('UPDATE users SET password_hash = $2 WHERE email = $1', [
      address,
      weaker,
    ]);
    expect((await credentials.verify(address, PASSWORD)).result).toBe('ok');
    const { rows } = await harness.db.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE email = $1',
      [address],
    );
    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('ne permet pas de distinguer un compte existant par la durée (CP-28)', async () => {
    const address = await account();
    const known: number[] = [];
    const unknown: number[] = [];
    // Préchauffage (hash factice calculé une fois par processus).
    await credentials.verify('chauffe@example.test', PASSWORD);
    for (let i = 0; i < 50; i++) {
      await redis.del(...(await redis.keys('oz:auth:failures:*')));
      let started = performance.now();
      await credentials.verify(address, 'mauvais mot de passe');
      known.push(performance.now() - started);
      started = performance.now();
      await credentials.verify(`absent-${String(i)}@example.test`, 'mauvais mot de passe');
      unknown.push(performance.now() - started);
    }
    const gap =
      Math.abs(median(known) - median(unknown)) / Math.max(median(known), median(unknown));
    expect(gap).toBeLessThan(0.25);
  });
});
