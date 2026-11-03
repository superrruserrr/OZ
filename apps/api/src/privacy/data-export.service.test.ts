import type { PrismaClient } from '@oz/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialsService } from '../auth/credentials.service.js';
import type { AuthMailer } from '../auth/mail/auth-mailer.js';
import type { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import type { TwoFactorService } from '../auth/two-factor.service.js';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { DataExportService } from './data-export.service.js';

// Export des données (lot 1.16ba) : ré-authentification, refus de la base, limites, alerte.

const db = vi.hoisted(() => ({
  accountEmail: vi.fn(),
  latestDataExport: vi.fn(),
  requestDataExport: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const REQUESTED = new Date('2026-11-09T10:00:00.000Z');
const noTwoFactor = { secret: null, pendingSecret: null, lastStep: null, required: false };
const withTwoFactor = { ...noTwoFactor, secret: 'A'.repeat(32) };

const consume = vi.fn();
const verify = vi.fn();
const state = vi.fn();
const checkSecondFactor = vi.fn();
const sendDataExportRequested = vi.fn();
const sent: Promise<void>[] = [];
const service = new DataExportService(
  {} as PrismaClient,
  { verify } as unknown as CredentialsService,
  { state, checkSecondFactor } as unknown as TwoFactorService,
  { consume } as unknown as RateLimiter,
  { sendDataExportRequested } as unknown as AuthMailer,
  {
    sendLater: (_kind: string, send: () => Promise<void>) => {
      sent.push(send());
    },
  } as unknown as MailDispatcher,
);

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  consume.mockResolvedValue({ allowed: true });
  verify.mockResolvedValue({ result: 'ok', userId: USER });
  state.mockResolvedValue(noTwoFactor);
  checkSecondFactor.mockResolvedValue(true);
  db.accountEmail.mockResolvedValue('titulaire@example.test');
  db.requestDataExport.mockResolvedValue({ outcome: 'accepted', id: 'r', requestedAt: REQUESTED });
});

describe('DataExportService.request', () => {
  it('acceptée : statut `pending`, prochaine demande 24 heures plus tard, alerte après la réponse', async () => {
    expect(await service.request(USER, { password: 'x' })).toEqual({
      status: 'pending',
      requestedAt: '2026-11-09T10:00:00.000Z',
      readyAt: null,
      expiresAt: null,
      nextRequestAt: '2026-11-10T10:00:00.000Z',
    });
    await Promise.all(sent);
    expect(sendDataExportRequested).toHaveBeenCalledWith('titulaire@example.test', REQUESTED);
    expect(verify).toHaveBeenCalledWith('titulaire@example.test', 'x');
  });

  it('quota du compte atteint : 429 avant toute vérification', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(verify).not.toHaveBeenCalled();
    expect(db.requestDataExport).not.toHaveBeenCalled();
  });

  it('mot de passe faux, code manquant ou faux : même refus, aucune demande', async () => {
    verify.mockResolvedValueOnce({ result: 'invalid' });
    const wrongPassword = service.request(USER, { password: 'x', code: '123456' });
    await expect(wrongPassword).rejects.toMatchObject({
      status: 403,
      code: 'DATA_EXPORT_REJECTED',
    });
    state.mockResolvedValue(withTwoFactor);
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      status: 403,
      code: 'DATA_EXPORT_REJECTED',
    });
    checkSecondFactor.mockResolvedValue(false);
    await expect(service.request(USER, { password: 'x', code: '123456' })).rejects.toMatchObject({
      status: 403,
      code: 'DATA_EXPORT_REJECTED',
    });
    expect(db.requestDataExport).not.toHaveBeenCalled();
  });

  it('2FA active et code juste : acceptée ; inactive : le code fourni est ignoré', async () => {
    state.mockResolvedValue(withTwoFactor);
    await service.request(USER, { password: 'x', code: '123456' });
    expect(checkSecondFactor).toHaveBeenCalledWith(USER, withTwoFactor, '123456');
    state.mockResolvedValue(noTwoFactor);
    checkSecondFactor.mockClear();
    await service.request(USER, { password: 'x', code: '123456' });
    expect(checkSecondFactor).not.toHaveBeenCalled();
  });

  it('délai du mot de passe : 429 `AUTH_RETRY_LATER`', async () => {
    verify.mockResolvedValue({ result: 'retry_later', retryAfterSeconds: 30 });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  it('compte sans email, sans état ou refusé par la base : 401', async () => {
    db.accountEmail.mockResolvedValueOnce(null);
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 401 });
    state.mockResolvedValueOnce(null);
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 401 });
    db.requestDataExport.mockResolvedValueOnce({ outcome: 'refused' });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 401 });
    expect(sent).toHaveLength(0);
  });

  it('demande active ou trop récente : 409 avec son code, sans alerte', async () => {
    db.requestDataExport.mockResolvedValueOnce({ outcome: 'active' });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      status: 409,
      code: 'DATA_EXPORT_ACTIVE',
    });
    const next = new Date(Date.now() + 3600 * 1000);
    db.requestDataExport.mockResolvedValueOnce({ outcome: 'too_soon', nextRequestAt: next });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      status: 409,
      code: 'DATA_EXPORT_TOO_SOON',
      retryAfterSeconds: 3600,
    });
    expect(sent).toHaveLength(0);
  });

  it('adresse disparue avant l’envoi : aucune alerte', async () => {
    db.accountEmail.mockResolvedValueOnce('titulaire@example.test').mockResolvedValueOnce(null);
    await service.request(USER, { password: 'x' });
    await Promise.all(sent);
    expect(sendDataExportRequested).not.toHaveBeenCalled();
  });
});

describe('ordre de la ré-authentification', () => {
  it('mot de passe faux : aucun second facteur consommé (code de secours épargné)', async () => {
    state.mockResolvedValue(withTwoFactor);
    verify.mockResolvedValue({ result: 'invalid' });
    await expect(
      service.request(USER, { password: 'x', code: 'ABCD-EFGH-IJKL-MNOP' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(checkSecondFactor).not.toHaveBeenCalled();
  });
});

describe('DataExportService.latest', () => {
  it('dernière demande, dates en ISO ; aucune : `latest: null`', async () => {
    db.latestDataExport.mockResolvedValueOnce({
      id: 'r',
      status: 'ready',
      requestedAt: REQUESTED,
      readyAt: REQUESTED,
      expiresAt: new Date('2026-11-16T10:00:00.000Z'),
      nextRequestAt: new Date('2026-11-10T10:00:00.000Z'),
    });
    expect(await service.latest(USER)).toEqual({
      latest: {
        status: 'ready',
        requestedAt: '2026-11-09T10:00:00.000Z',
        readyAt: '2026-11-09T10:00:00.000Z',
        expiresAt: '2026-11-16T10:00:00.000Z',
        nextRequestAt: '2026-11-10T10:00:00.000Z',
      },
    });
    db.latestDataExport.mockResolvedValueOnce(null);
    expect(await service.latest(USER)).toEqual({ latest: null });
  });
});
