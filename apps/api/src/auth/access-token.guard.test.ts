import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AccessTokens } from '@oz/auth';
import type { PrismaClient } from '@oz/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionAccess = vi.fn();
vi.mock('@oz/db', () => ({
  sessionAccess: (...args: unknown[]): unknown => sessionAccess(...args) as unknown,
  withUserContext: (_db: unknown, _user: string, fn: (tx: object) => unknown) => fn({}),
}));

const { AccessTokenGuard } = await import('./access-token.guard.js');
const { TwoFactorEnrollment } = await import('./two-factor-exempt.decorator.js');

const closed = (): void => undefined;
const enrollment = (): void => undefined;
TwoFactorEnrollment()(enrollment);

const claims = { userId: 'u', familyId: 'f' };
const tokens = { verify: vi.fn().mockResolvedValue(claims) } as unknown as AccessTokens;
const guard = new AccessTokenGuard({} as PrismaClient, tokens, new Reflector());

function contextFor(handler: () => void): ExecutionContext {
  const req = { header: () => 'Bearer jeton' };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => contextFor,
  } as unknown as ExecutionContext;
}

beforeEach(() => {
  sessionAccess.mockReset();
});

describe('AccessTokenGuard : session restreinte (D6)', () => {
  it('route ordinaire fermée par défaut', async () => {
    sessionAccess.mockResolvedValue('enrollment_required');
    await expect(guard.canActivate(contextFor(closed))).rejects.toMatchObject({
      code: 'AUTH_2FA_ENROLLMENT_REQUIRED',
      status: 403,
    });
  });

  it('route d’enrôlement ouverte', async () => {
    sessionAccess.mockResolvedValue('enrollment_required');
    await expect(guard.canActivate(contextFor(enrollment))).resolves.toBe(true);
  });

  it('session pleine : toute route ouverte', async () => {
    sessionAccess.mockResolvedValue('active');
    await expect(guard.canActivate(contextFor(closed))).resolves.toBe(true);
  });
});
