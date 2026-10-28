import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_SPECS, type RateLimitSpec } from './rate-limit.decorator.js';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { RateLimiter } from './rate-limiter.service.js';

// Cas que le banc HTTP ne sait pas provoquer : IP illisible, Redis en panne, corps sans email.

const handler = (): void => undefined;

function contextFor(specs: readonly RateLimitSpec[], req: object): ExecutionContext {
  Reflect.defineMetadata(RATE_LIMIT_SPECS, specs, handler);
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const guardWith = (consume: RateLimiter['consume']) =>
  new RateLimitGuard(new Reflector(), { consume } as RateLimiter);

describe('RateLimitGuard', () => {
  it('IP illisible : 400 CLIENT_UNIDENTIFIED, rien n’est compté', async () => {
    const consume = vi.fn();
    await expect(
      guardWith(consume).canActivate(
        contextFor([{ rule: 'login_ip', by: 'ip' }], { ip: undefined }),
      ),
    ).rejects.toMatchObject({ status: 400, code: 'CLIENT_UNIDENTIFIED' });
    expect(consume).not.toHaveBeenCalled();
  });

  it('Redis en panne : l’erreur remonte, aucun passage accordé (D3)', async () => {
    const consume = vi.fn().mockRejectedValue(new Error('redis'));
    await expect(
      guardWith(consume).canActivate(
        contextFor([{ rule: 'login_ip', by: 'ip' }], { ip: '192.0.2.1' }),
      ),
    ).rejects.toThrow('redis');
  });

  it.each([
    undefined,
    null,
    {},
    { email: 42 },
    { email: '  ' },
    { email: `${'a'.repeat(250)}@b.test` },
  ])('email absent ou hors format (%j) : règle ignorée, la validation refusera', async (body) => {
    const consume = vi.fn();
    await expect(
      guardWith(consume).canActivate(
        contextFor([{ rule: 'forgot_email', by: 'email' }], { ip: '192.0.2.1', body }),
      ),
    ).resolves.toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it('règles comptées dans l’ordre, normalisées, jusqu’au premier refus', async () => {
    const consume = vi
      .fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 40 });
    await expect(
      guardWith(consume).canActivate(
        contextFor(
          [
            { rule: 'login_ip', by: 'ip' },
            { rule: 'login_account', by: 'email' },
          ],
          { ip: '::ffff:192.0.2.1', body: { email: ' A@B.test ' } },
        ),
      ),
    ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 40 });
    expect(consume).toHaveBeenNthCalledWith(1, 'login_ip', '192.0.2.1');
    expect(consume).toHaveBeenNthCalledWith(2, 'login_account', 'a@b.test');
  });

  it('IP déjà refusée : le compteur du compte n’est pas consommé', async () => {
    const consume = vi.fn().mockResolvedValue({ allowed: false, retryAfterSeconds: 5 });
    await expect(
      guardWith(consume).canActivate(
        contextFor(
          [
            { rule: 'login_ip', by: 'ip' },
            { rule: 'login_account', by: 'email' },
          ],
          { ip: '192.0.2.1', body: { email: 'a@b.test' } },
        ),
      ),
    ).rejects.toMatchObject({ retryAfterSeconds: 5 });
    expect(consume).toHaveBeenCalledTimes(1);
  });

  it('IP illisible déclarée après une règle email : rien n’est compté', async () => {
    const consume = vi.fn();
    await expect(
      guardWith(consume).canActivate(
        contextFor(
          [
            { rule: 'forgot_email', by: 'email' },
            { rule: 'forgot_ip', by: 'ip' },
          ],
          { ip: undefined, body: { email: 'a@b.test' } },
        ),
      ),
    ).rejects.toMatchObject({ code: 'CLIENT_UNIDENTIFIED' });
    expect(consume).not.toHaveBeenCalled();
  });

  it('route sans règle : passe', async () => {
    const bare = (): void => undefined;
    const context = {
      getHandler: () => bare,
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    await expect(guardWith(vi.fn()).canActivate(context)).resolves.toBe(true);
  });
});
