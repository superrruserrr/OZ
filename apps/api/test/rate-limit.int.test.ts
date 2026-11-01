import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../src/common/rate-limit/rate-limiter.service.js';
import { REDIS_IMAGE } from './containers.js';

// Limiteur réel dans Redis (lot 1.3ca, D1 à D3).

let container: StartedRedisContainer;
let redis: Redis;
let setting: unknown = null;
const warn = vi.fn();
const KEY = new Uint8Array(32).fill(7);

const limiter = (ttlMs = 0) =>
  new RateLimiter(redis, KEY, () => Promise.resolve(setting), { warn }, ttlMs);

beforeAll(async () => {
  container = await new RedisContainer(REDIS_IMAGE).start();
  redis = new Redis(container.getConnectionUrl());
});
afterAll(async () => {
  redis.disconnect();
  await container.stop();
});

describe('RateLimiter', () => {
  it('N passages, puis refus avec une attente en secondes', async () => {
    setting = { login_ip: { limit: 2, windowSeconds: 60 } };
    const rl = limiter();
    expect(await rl.consume('login_ip', '198.51.100.1')).toEqual({ allowed: true });
    expect(await rl.consume('login_ip', '198.51.100.1')).toEqual({ allowed: true });
    const refused = await rl.consume('login_ip', '198.51.100.1');
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.retryAfterSeconds).toBeGreaterThanOrEqual(1);
      expect(refused.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
    // Autre sujet, autre compteur.
    expect(await rl.consume('login_ip', '198.51.100.2')).toEqual({ allowed: true });
  });

  it('fenêtre glissante : un passage se libère quand le plus ancien sort de la fenêtre', async () => {
    setting = { refresh_ip: { limit: 1, windowSeconds: 1 } };
    const rl = limiter();
    expect((await rl.consume('refresh_ip', 'a')).allowed).toBe(true);
    expect((await rl.consume('refresh_ip', 'a')).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect((await rl.consume('refresh_ip', 'a')).allowed).toBe(true);
  });

  it('requêtes parallèles : jamais plus de N acceptées', async () => {
    setting = { register_ip: { limit: 3, windowSeconds: 60 } };
    const rl = limiter();
    const results = await Promise.all(
      Array.from({ length: 25 }, () => rl.consume('register_ip', 'course')),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
  });

  it('ni IP ni email en clair dans Redis', async () => {
    setting = null;
    await limiter().consume('forgot_email', 'personne@example.test');
    const keys = await redis.keys('*');
    expect(keys.join(' ')).not.toMatch(/personne|example|198\.51/);
    expect(keys.every((key) => /^oz:rl:[a-z_]+:[0-9a-f]{64}$/.test(key))).toBe(true);
  });

  it('réglage modifié : pris en compte après la durée du cache, sans redémarrage', async () => {
    setting = { reset_ip: { limit: 1, windowSeconds: 60 } };
    const rl = limiter(200);
    expect((await rl.consume('reset_ip', 'b')).allowed).toBe(true);
    expect((await rl.consume('reset_ip', 'b')).allowed).toBe(false);
    setting = { reset_ip: { limit: 5, windowSeconds: 60 } };
    expect((await rl.consume('reset_ip', 'b')).allowed).toBe(false); // encore en cache
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await rl.consume('reset_ip', 'b')).allowed).toBe(true);
  });

  it('réglage invalide : défauts, et journal sans la valeur', async () => {
    setting = { login_ip: { limit: -1 } };
    warn.mockClear();
    const rl = limiter();
    for (let i = 0; i < 5; i++) expect((await rl.consume('login_ip', 'c')).allowed).toBe(true);
    expect((await rl.consume('login_ip', 'c')).allowed).toBe(false);
    expect(warn).toHaveBeenCalledWith({ event: 'rate_limit.settings_invalid' }, expect.any(String));
  });

  it('réglage illisible (base en panne) : défauts, journalisé', async () => {
    warn.mockClear();
    const rl = new RateLimiter(redis, KEY, () => Promise.reject(new Error('base')), { warn }, 0);
    expect((await rl.consume('verify_email_ip', 'd')).allowed).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      { event: 'rate_limit.settings_unavailable', error: 'Error' },
      expect.any(String),
    );
  });

  it('cache expiré : une seule lecture du réglage pour des requêtes simultanées', async () => {
    const read = vi.fn(() => Promise.resolve(null));
    const rl = new RateLimiter(redis, KEY, read, { warn }, 60_000);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => rl.consume('reset_ip', `f${String(i)}`)),
    );
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('limite abaissée : l’attente annoncée suffit vraiment (rang count - limite)', async () => {
    setting = { forgot_ip: { limit: 5, windowSeconds: 4 } };
    const wide = limiter();
    for (let i = 0; i < 5; i++) {
      expect((await wide.consume('forgot_ip', 'g')).allowed).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    setting = { forgot_ip: { limit: 2, windowSeconds: 4 } };
    const narrow = limiter();
    const refused = await narrow.consume('forgot_ip', 'g');
    expect(refused.allowed).toBe(false);
    // 5 entrées étalées sur ~1,6 s : la 4e (rang 3) sort en dernier parmi celles à libérer.
    if (!refused.allowed) expect(refused.retryAfterSeconds).toBe(4);
  });

  it('Redis indisponible : erreur, jamais de passage accordé (D3)', async () => {
    const down = new Redis('redis://127.0.0.1:1', {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    down.on('error', () => undefined);
    const rl = new RateLimiter(down, KEY, () => Promise.resolve(null), { warn }, 0);
    await expect(rl.consume('login_ip', 'e')).rejects.toThrow();
    down.disconnect();
  });
});
