import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { AuthConfig } from '@oz/config';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LoginChallengeService } from '../src/auth/login-challenge.service.js';
import { REDIS_IMAGE } from './containers.js';

// Défi de connexion réel dans Redis (lot 1.3cb, D4).

const CHALLENGE = {
  userId: '01970000-0000-7000-8000-000000000001',
  device: 'd',
  credentialStamp: 'a'.repeat(64),
};
let container: StartedRedisContainer;
let redis: Redis;
let service: LoginChallengeService;

beforeAll(async () => {
  container = await new RedisContainer(REDIS_IMAGE).start();
  redis = new Redis(container.getConnectionUrl());
  service = new LoginChallengeService(redis, { hmacKey: 'h'.repeat(40) } as AuthConfig);
});
afterAll(async () => {
  redis.disconnect();
  await container.stop();
});

describe('LoginChallengeService', () => {
  it('5 minutes, sans jeton ni adresse en clair dans Redis', async () => {
    const token = await service.issue({ ...CHALLENGE, device: 'Firefox · macOS' });
    const [key] = await redis.keys('oz:auth:challenge:*');
    expect(key).toMatch(/^oz:auth:challenge:[0-9a-f]{64}$/);
    expect(key).not.toContain(token);
    expect(await redis.ttl(key as string)).toBeGreaterThan(290);
    expect(await redis.hkeys(key as string)).toEqual(['user', 'device', 'stamp', 'attempts']);
  });

  it('cinq essais : le cinquième peut encore consommer le défi, le sixième est refusé', async () => {
    const spent = await service.issue(CHALLENGE);
    for (let i = 0; i < 5; i++) expect(await service.attempt(spent)).toEqual(CHALLENGE);
    expect(await service.attempt(spent)).toBeNull();

    const last = await service.issue(CHALLENGE);
    for (let i = 0; i < 5; i++) await service.attempt(last);
    expect(await service.consume(last)).toBe(true);
  });

  it('requêtes parallèles : jamais plus de 5 essais', async () => {
    const token = await service.issue(CHALLENGE);
    const results = await Promise.all(Array.from({ length: 20 }, () => service.attempt(token)));
    expect(results.filter((r) => r !== null)).toHaveLength(5);
  });

  it('usage unique : une seule consommation réussit', async () => {
    const token = await service.issue(CHALLENGE);
    const results = await Promise.all([service.consume(token), service.consume(token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await service.attempt(token)).toBeNull();
  });

  it('jeton inconnu : null', async () => {
    expect(await service.attempt('x'.repeat(43))).toBeNull();
  });
});
