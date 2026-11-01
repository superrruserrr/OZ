import type { ApiConfig } from '@oz/config';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/api-error.js';
import { clientOf, SessionController } from './session.controller.js';
import type { SessionService } from './session.service.js';

// Pannes que le banc HTTP ne sait pas provoquer : base indisponible pendant un rafraîchissement ou
// une déconnexion.
const ORIGIN = 'http://localhost:3000';
const request = {
  headers: { cookie: `__Host-oz_refresh=${'a'.repeat(43)}` },
  header: (name: string) => (name === 'Origin' ? ORIGIN : undefined),
  ip: '::ffff:203.0.113.9',
} as unknown as Request;
const response = () => ({ clearCookie: vi.fn(), cookie: vi.fn() });
const controller = (sessions: Partial<SessionService>) =>
  new SessionController(
    sessions as SessionService,
    { corsOrigins: [ORIGIN] } as unknown as ApiConfig,
  );

describe('SessionController', () => {
  it('rafraîchissement : une panne serveur garde le cookie, un refus l’efface', async () => {
    const outage = response();
    await expect(
      controller({ refresh: vi.fn().mockRejectedValue(new Error('base')) }).refresh(
        request,
        outage as unknown as Response,
      ),
    ).rejects.toThrow('base');
    expect(outage.clearCookie).not.toHaveBeenCalled();

    const refused = response();
    await expect(
      controller({
        refresh: vi.fn().mockRejectedValue(new AppException(401, 'AUTH_UNAUTHENTICATED', 'x')),
      }).refresh(request, refused as unknown as Response),
    ).rejects.toBeInstanceOf(AppException);
    expect(refused.clearCookie).toHaveBeenCalledOnce();
  });

  it('déconnexion : le cookie est effacé même si la base échoue', async () => {
    const res = response();
    await expect(
      controller({ logout: vi.fn().mockRejectedValue(new Error('base')) }).logout(
        request,
        res as unknown as Response,
      ),
    ).rejects.toThrow('base');
    expect(res.clearCookie).toHaveBeenCalledOnce();
  });

  it('ramène une IPv4 mappée sur IPv6 en IPv4', () => {
    expect(clientOf(request).ip).toBe('203.0.113.9');
    expect(clientOf({ ...request, ip: '2001:db8::1' } as Request).ip).toBe('2001:db8::1');
  });

  it('client sans IP (socket fermée) : IP inconnue', () => {
    expect(clientOf({ header: () => undefined, ip: undefined } as unknown as Request)).toEqual({
      userAgent: undefined,
      ip: undefined,
    });
  });
});
