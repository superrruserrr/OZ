import type { PrismaClient } from '@oz/db';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialsService } from '../auth/credentials.service.js';
import type { AuthMailer } from '../auth/mail/auth-mailer.js';
import type { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import type { TwoFactorService } from '../auth/two-factor.service.js';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { Reauthentication } from './reauthentication.js';

// Suppression du compte (lot 1.16ca) : ré-authentification, refus de la base, limites, emails.

const db = vi.hoisted(() => ({
  accountEmail: vi.fn(),
  cancelAccountDeletion: vi.fn(),
  pendingAccountDeletion: vi.fn(),
  requestAccountDeletion: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const REQUESTED = new Date('2026-11-09T10:00:00.000Z');
const SCHEDULED = new Date('2026-12-09T10:00:00.000Z');
const noTwoFactor = { secret: null, pendingSecret: null, lastStep: null, required: false };
const withTwoFactor = { ...noTwoFactor, secret: 'A'.repeat(32) };

const consume = vi.fn();
const verify = vi.fn();
const state = vi.fn();
const checkSecondFactor = vi.fn();
const info = vi.fn();
const sendAccountDeletionScheduled = vi.fn();
const sendAccountDeletionCancelled = vi.fn();
const sent: Promise<void>[] = [];
const service = new AccountDeletionService(
  {} as PrismaClient,
  new Reauthentication(
    {} as PrismaClient,
    { verify } as unknown as CredentialsService,
    { state, checkSecondFactor } as unknown as TwoFactorService,
  ),
  { consume } as unknown as RateLimiter,
  { sendAccountDeletionScheduled, sendAccountDeletionCancelled } as unknown as AuthMailer,
  {
    sendLater: (_kind: string, send: () => Promise<void>) => {
      sent.push(send());
    },
  } as unknown as MailDispatcher,
  { info } as unknown as PinoLogger,
);

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  consume.mockResolvedValue({ allowed: true });
  verify.mockResolvedValue({ result: 'ok', userId: USER });
  state.mockResolvedValue(noTwoFactor);
  checkSecondFactor.mockResolvedValue(true);
  db.accountEmail.mockResolvedValue('titulaire@example.test');
  db.requestAccountDeletion.mockResolvedValue({
    outcome: 'accepted',
    id: 'r',
    requestedAt: REQUESTED,
    scheduledFor: SCHEDULED,
  });
  db.cancelAccountDeletion.mockResolvedValue(true);
});

describe('AccountDeletionService.request', () => {
  it('acceptée : dates en ISO, email avec l’échéance, rien de secret au journal', async () => {
    expect(await service.request(USER, { password: 'secret-mdp' })).toEqual({
      requestedAt: '2026-11-09T10:00:00.000Z',
      scheduledFor: '2026-12-09T10:00:00.000Z',
    });
    await Promise.all(sent);
    expect(sendAccountDeletionScheduled).toHaveBeenCalledWith('titulaire@example.test', SCHEDULED);
    expect(consume).toHaveBeenCalledWith('account_deletion_account', USER);
    expect(JSON.stringify(info.mock.calls)).not.toContain('secret-mdp');
  });

  it('quota atteint : 429 avant toute vérification', async () => {
    consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 12 });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 429 });
    expect(verify).not.toHaveBeenCalled();
  });

  it('mot de passe faux, code manquant ou faux : un seul 403, rien en base', async () => {
    verify.mockResolvedValueOnce({ result: 'invalid' });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      status: 403,
      code: 'ACCOUNT_DELETION_REJECTED',
    });
    state.mockResolvedValue(withTwoFactor);
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 403 });
    checkSecondFactor.mockResolvedValueOnce(false);
    await expect(service.request(USER, { password: 'x', code: '123456' })).rejects.toMatchObject({
      status: 403,
    });
    expect(db.requestAccountDeletion).not.toHaveBeenCalled();
  });

  it('délai du mot de passe : 429 ; compte disparu : 401', async () => {
    verify.mockResolvedValueOnce({ result: 'retry_later', retryAfterSeconds: 30 });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 429 });
    db.accountEmail.mockResolvedValueOnce(null);
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 401 });
    state.mockResolvedValueOnce(null);
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 401 });
  });

  it('déjà programmée : 409 ; refusée par la base : 401 ; sans email', async () => {
    db.requestAccountDeletion.mockResolvedValueOnce({
      outcome: 'pending',
      scheduledFor: SCHEDULED,
    });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({
      status: 409,
      code: 'ACCOUNT_DELETION_PENDING',
    });
    db.requestAccountDeletion.mockResolvedValueOnce({ outcome: 'refused' });
    await expect(service.request(USER, { password: 'x' })).rejects.toMatchObject({ status: 401 });
    await Promise.all(sent);
    expect(sendAccountDeletionScheduled).not.toHaveBeenCalled();
  });

  it('adresse disparue entre-temps : aucune alerte', async () => {
    db.accountEmail.mockResolvedValueOnce('titulaire@example.test').mockResolvedValueOnce(null);
    await service.request(USER, { password: 'x' });
    await Promise.all(sent);
    expect(sendAccountDeletionScheduled).not.toHaveBeenCalled();
  });
});

describe('AccountDeletionService.status', () => {
  it('demande en attente en ISO ; aucune : `pending: null`', async () => {
    db.pendingAccountDeletion.mockResolvedValueOnce({
      id: 'r',
      requestedAt: REQUESTED,
      scheduledFor: SCHEDULED,
    });
    expect(await service.status(USER)).toEqual({
      pending: {
        requestedAt: '2026-11-09T10:00:00.000Z',
        scheduledFor: '2026-12-09T10:00:00.000Z',
      },
    });
    db.pendingAccountDeletion.mockResolvedValueOnce(null);
    expect(await service.status(USER)).toEqual({ pending: null });
  });
});

describe('AccountDeletionService.cancel', () => {
  it('annulée : email de confirmation ; sans adresse : rien', async () => {
    await service.cancel(USER);
    await Promise.all(sent);
    expect(sendAccountDeletionCancelled).toHaveBeenCalledWith(
      'titulaire@example.test',
      expect.any(Date),
    );
    db.accountEmail.mockResolvedValueOnce(null);
    await service.cancel(USER);
    await Promise.all(sent);
    expect(sendAccountDeletionCancelled).toHaveBeenCalledTimes(1);
  });

  it('aucune demande : 404 ; quota atteint : 429 avant la base', async () => {
    db.cancelAccountDeletion.mockResolvedValueOnce(false);
    await expect(service.cancel(USER)).rejects.toMatchObject({
      status: 404,
      code: 'ACCOUNT_DELETION_NOT_FOUND',
    });
    consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 5 });
    await expect(service.cancel(USER)).rejects.toMatchObject({ status: 429 });
    expect(db.cancelAccountDeletion).toHaveBeenCalledTimes(1);
  });
});
