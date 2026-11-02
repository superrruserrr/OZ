import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import type { AuthConfig } from '@oz/config';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PhoneChallengeService } from '../src/auth/phone-challenge.service.js';
import { REDIS_IMAGE } from './containers.js';

// Code de vérification réel dans Redis (lot 1.3cc, D4).

const USER = '01970000-0000-7000-8000-000000000001';
const PHONE = '+237650000001';
const CODE = '042137';
let container: StartedRedisContainer;
let redis: Redis;
let service: PhoneChallengeService;

beforeAll(async () => {
  container = await new RedisContainer(REDIS_IMAGE).start();
  redis = new Redis(container.getConnectionUrl());
  service = new PhoneChallengeService(redis, { hmacKey: 'h'.repeat(40) } as AuthConfig);
});
afterAll(async () => {
  redis.disconnect();
  await container.stop();
});
beforeEach(async () => {
  await redis.flushall();
});

describe('PhoneChallengeService', () => {
  it('5 minutes ; ni code, ni numéro, ni compte en clair dans Redis', async () => {
    await service.issue(USER, PHONE, CODE);
    const keys = await redis.keys('*');
    const challenge = keys.find((key) => key.startsWith('oz:auth:phone:')) as string;
    expect(await redis.ttl(challenge)).toBeGreaterThan(290);
    const stored = JSON.stringify([keys, await redis.hgetall(challenge)]);
    for (const value of [CODE, PHONE, PHONE.slice(1), USER]) expect(stored).not.toContain(value);
  });

  it('code juste : rend le numéro, puis usage unique', async () => {
    await service.issue(USER, PHONE, CODE);
    expect(await service.verify(USER, CODE)).toBe(PHONE);
    expect(await service.verify(USER, CODE)).toBeNull();
  });

  it('cinq essais : le cinquième peut réussir, le sixième est refusé même juste', async () => {
    await service.issue(USER, PHONE, CODE);
    for (let i = 0; i < 4; i++) expect(await service.verify(USER, '000000')).toBeNull();
    expect(await service.verify(USER, CODE)).toBe(PHONE);

    await service.issue(USER, PHONE, CODE);
    for (let i = 0; i < 5; i++) expect(await service.verify(USER, '000000')).toBeNull();
    expect(await service.verify(USER, CODE)).toBeNull();
  });

  it('requêtes parallèles : le code ne vaut qu’une fois', async () => {
    await service.issue(USER, PHONE, CODE);
    const results = await Promise.all(Array.from({ length: 5 }, () => service.verify(USER, CODE)));
    expect(results.filter((value) => value === PHONE)).toHaveLength(1);
  });

  it('un nouvel envoi invalide le code précédent et remet les essais à zéro', async () => {
    await service.issue(USER, PHONE, CODE);
    await service.verify(USER, '000000');
    await service.issue(USER, PHONE, '111111');
    expect(await service.verify(USER, CODE)).toBeNull();
    expect(await service.verify(USER, '111111')).toBe(PHONE);
  });

  it('un code ne vaut que pour son compte', async () => {
    await service.issue(USER, PHONE, CODE);
    expect(await service.verify('01970000-0000-7000-8000-000000000002', CODE)).toBeNull();
    expect(await service.verify(USER, CODE)).toBe(PHONE);
  });

  it('contenu altéré dans Redis : refus, jamais de numéro', async () => {
    await service.issue(USER, PHONE, CODE);
    const [key] = await redis.keys('oz:auth:phone:*');
    await redis.hset(key as string, 'phone', 'AAAA');
    expect(await service.verify(USER, CODE)).toBeNull();
  });

  it('renvoi : une seule place par 60 s', async () => {
    expect(await service.cooldownSeconds(USER)).toBe(0);
    expect(await service.startCooldown(USER)).toBe(true);
    expect(await service.startCooldown(USER)).toBe(false);
    const left = await service.cooldownSeconds(USER);
    expect(left).toBeGreaterThan(55);
    expect(left).toBeLessThanOrEqual(60);
  });
});
