import type { Actor } from '@oz/auth';
import type { PrismaClient } from '@oz/db';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialsService } from '../auth/credentials.service.js';
import type { AuthMailer } from '../auth/mail/auth-mailer.js';
import type { MailDispatcher } from '../auth/mail/mail-dispatcher.js';
import type { TwoFactorService } from '../auth/two-factor.service.js';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { PlayerDeletionService } from './player-deletion.service.js';
import { Reauthentication } from './reauthentication.js';

// Suppression de la fiche d'un enfant par son tuteur (lot 1.16cbb) : droits, refus, limites, emails.

const db = vi.hoisted(() => ({
  accountEmail: vi.fn(),
  cancelPlayerDeletion: vi.fn(),
  pendingPlayerDeletion: vi.fn(),
  playerProfileByOzId: vi.fn(),
  requestPlayerDeletion: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const GUARDIAN = '00000000-0000-4000-8000-000000000001';
const OZ_ID = 'OZ-CM-26-7K4M9Q-M';
const NOW = new Date('2026-11-09T10:00:00.000Z');
const REQUESTED = new Date('2026-11-09T10:00:00.000Z');
const SCHEDULED = new Date('2026-12-09T10:00:00.000Z');
const actor: Actor = {
  userId: GUARDIAN,
  roles: [{ role: 'guardian', organizationId: null }],
  isKyc3Verified: false,
};
const access = {
  userId: null,
  birthDate: new Date('2014-06-07'),
  verificationStatus: 'declared',
  guardianUserId: GUARDIAN,
  organizationId: null,
  testedByOrganizationIds: [],
  hasPublicationConsent: false,
  deletionPending: false,
  checkedAt: NOW,
};

const consume = vi.fn();
const verify = vi.fn();
const state = vi.fn();
const info = vi.fn();
const sendChildDeletionScheduled = vi.fn();
const sendChildDeletionCancelled = vi.fn();
const sent: Promise<void>[] = [];
const service = new PlayerDeletionService(
  {} as PrismaClient,
  new Reauthentication(
    {} as PrismaClient,
    { verify } as unknown as CredentialsService,
    { state, checkSecondFactor: vi.fn() } as unknown as TwoFactorService,
  ),
  { consume } as unknown as RateLimiter,
  { sendChildDeletionScheduled, sendChildDeletionCancelled } as unknown as AuthMailer,
  {
    sendLater: (_kind: string, send: () => Promise<void>) => {
      sent.push(send());
    },
  } as unknown as MailDispatcher,
  { info } as unknown as PinoLogger,
);
const PASSWORD = { password: 'correct horse battery staple' };

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  consume.mockResolvedValue({ allowed: true });
  verify.mockResolvedValue({ result: 'ok', userId: GUARDIAN });
  state.mockResolvedValue({ secret: null, pendingSecret: null, lastStep: null, required: false });
  db.accountEmail.mockResolvedValue('tuteur@example.test');
  db.playerProfileByOzId.mockResolvedValue({ id: 'p', access });
});

describe('PlayerDeletionService.request', () => {
  it('acceptée : emails au tuteur et à l’enfant, dates ISO', async () => {
    db.requestPlayerDeletion.mockResolvedValue({
      outcome: 'accepted',
      id: 'r',
      requestedAt: REQUESTED,
      scheduledFor: SCHEDULED,
      childEmail: 'enfant@example.test',
    });
    expect(await service.request(actor, OZ_ID, PASSWORD)).toEqual({
      requestedAt: REQUESTED.toISOString(),
      scheduledFor: SCHEDULED.toISOString(),
    });
    await Promise.all(sent);
    expect(sendChildDeletionScheduled.mock.calls).toEqual([
      ['tuteur@example.test', SCHEDULED, 'guardian'],
      ['enfant@example.test', SCHEDULED, 'child'],
    ]);
    expect(JSON.stringify(info.mock.calls)).not.toContain(OZ_ID);
  });

  it('enfant sans compte, tuteur sans adresse : aucun email', async () => {
    db.requestPlayerDeletion.mockResolvedValue({
      outcome: 'accepted',
      id: 'r',
      requestedAt: REQUESTED,
      scheduledFor: SCHEDULED,
      childEmail: null,
    });
    db.accountEmail.mockResolvedValueOnce('tuteur@example.test').mockResolvedValueOnce(null);
    await service.request(actor, OZ_ID, PASSWORD);
    await Promise.all(sent);
    expect(sendChildDeletionScheduled).not.toHaveBeenCalled();
  });

  it('déjà programmée : 409 ; refus de la base : 404', async () => {
    db.requestPlayerDeletion.mockResolvedValueOnce({ outcome: 'pending', scheduledFor: SCHEDULED });
    await expect(service.request(actor, OZ_ID, PASSWORD)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_PENDING',
    });
    db.requestPlayerDeletion.mockResolvedValueOnce({ outcome: 'refused' });
    await expect(service.request(actor, OZ_ID, PASSWORD)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('hors droits ou fiche inconnue : 404 avant la ré-authentification', async () => {
    db.playerProfileByOzId.mockResolvedValueOnce(null);
    await expect(service.request(actor, OZ_ID, PASSWORD)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    db.playerProfileByOzId.mockResolvedValueOnce({
      id: 'p',
      access: { ...access, guardianUserId: 'autre' },
    });
    await expect(service.request(actor, OZ_ID, PASSWORD)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(verify).not.toHaveBeenCalled();
  });

  it('mot de passe faux : 403 ; quota : 429', async () => {
    verify.mockResolvedValueOnce({ result: 'invalid' });
    await expect(service.request(actor, OZ_ID, PASSWORD)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_REJECTED',
    });
    consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 60 });
    await expect(service.request(actor, OZ_ID, PASSWORD)).rejects.toMatchObject({ status: 429 });
  });
});

describe('PlayerDeletionService.status et cancel', () => {
  it('suivi : en attente ou `null`', async () => {
    db.pendingPlayerDeletion.mockResolvedValueOnce(null);
    expect(await service.status(actor, OZ_ID)).toEqual({ pending: null });
    db.pendingPlayerDeletion.mockResolvedValueOnce({
      id: 'r',
      requestedAt: REQUESTED,
      scheduledFor: SCHEDULED,
    });
    expect(await service.status(actor, OZ_ID)).toEqual({
      pending: { requestedAt: REQUESTED.toISOString(), scheduledFor: SCHEDULED.toISOString() },
    });
  });

  it('annulée : emails au tuteur et à l’enfant ; rien à annuler : 404', async () => {
    db.cancelPlayerDeletion.mockResolvedValueOnce({
      cancelled: true,
      childEmail: 'enfant@example.test',
    });
    await service.cancel(actor, OZ_ID);
    await Promise.all(sent);
    const calls = sendChildDeletionCancelled.mock.calls as [string, Date, string][];
    expect(calls.map(([to, , who]) => [to, who])).toEqual([
      ['tuteur@example.test', 'guardian'],
      ['enfant@example.test', 'child'],
    ]);
    db.cancelPlayerDeletion.mockResolvedValueOnce({ cancelled: false });
    await expect(service.cancel(actor, OZ_ID)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_NOT_FOUND',
    });
  });

  it('annulée sans adresse ni compte de l’enfant : aucun email', async () => {
    db.accountEmail.mockResolvedValue(null);
    db.cancelPlayerDeletion.mockResolvedValueOnce({ cancelled: true, childEmail: null });
    await service.cancel(actor, OZ_ID);
    await Promise.all(sent);
    expect(sendChildDeletionCancelled).not.toHaveBeenCalled();
  });
});
