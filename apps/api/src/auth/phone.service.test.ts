import type { AuthConfig } from '@oz/config';
import type { PrismaClient } from '@oz/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import type { AuthMailer } from './mail/auth-mailer.js';
import type { MailDispatcher } from './mail/mail-dispatcher.js';
import type { PhoneChallengeService } from './phone-challenge.service.js';
import { PhoneService } from './phone.service.js';
import type { SmsDispatcher } from './sms-dispatcher.js';

// Cas que le banc HTTP ne sait pas provoquer : courses entre lecture et écriture.
const db = vi.hoisted(() => ({
  accountEmail: vi.fn(),
  setVerifiedPhone: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const PHONE = '+237650000001';
const challenges = {
  cooldownSeconds: vi.fn(),
  startCooldown: vi.fn(),
  issue: vi.fn(),
  verify: vi.fn(),
};
const sendLater = vi.fn();
const mailLater = vi.fn();
const service = new PhoneService(
  {} as PrismaClient,
  { sms: { allowedPrefixes: ['+237'] } } as unknown as AuthConfig,
  { consume: () => Promise.resolve({ allowed: true }) } as unknown as RateLimiter,
  challenges as unknown as PhoneChallengeService,
  { sendLater } as unknown as SmsDispatcher,
  {} as AuthMailer,
  { sendLater: mailLater } as unknown as MailDispatcher,
);

beforeEach(() => {
  vi.clearAllMocks();
  challenges.cooldownSeconds.mockResolvedValue(0);
});

describe('PhoneService', () => {
  it('deux envois simultanés : le perdant reçoit 429, aucun code ne part pour lui', async () => {
    challenges.startCooldown.mockResolvedValue(false);
    await expect(service.start(USER, { phone: PHONE })).rejects.toMatchObject({
      retryAfterSeconds: 60,
    });
    expect(challenges.issue).not.toHaveBeenCalled();
    expect(sendLater).not.toHaveBeenCalled();
  });

  it('compte clos entre l’écriture et l’alerte : pas d’email', async () => {
    challenges.verify.mockResolvedValue(PHONE);
    db.setVerifiedPhone.mockResolvedValue('changed');
    db.accountEmail.mockResolvedValue(null);
    mailLater.mockImplementation((_kind: string, send: () => Promise<void>) => send());
    await service.verify(USER, '042137');
    await mailLater.mock.results[0]?.value;
    expect(mailLater).toHaveBeenCalledOnce();
  });

  it('compte devenu inapte entre le code et l’écriture : 401', async () => {
    challenges.verify.mockResolvedValue(PHONE);
    db.setVerifiedPhone.mockResolvedValue(null);
    await expect(service.verify(USER, '042137')).rejects.toMatchObject({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });
});
