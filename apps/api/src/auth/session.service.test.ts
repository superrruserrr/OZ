import { AccessTokens } from '@oz/auth';
import type { AuthConfig } from '@oz/config';
import type { PrismaClient } from '@oz/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CredentialsService } from './credentials.service.js';
import type { AuthMailer } from './mail/auth-mailer.js';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import type { LoginChallengeService } from './login-challenge.service.js';
import type { MailDispatcher } from './mail/mail-dispatcher.js';
import { SessionService } from './session.service.js';
import type { TwoFactorService } from './two-factor.service.js';

// Cas que le banc HTTP ne sait pas provoquer : course avec une suspension de compte, requête sans IP.
const db = vi.hoisted(() => ({
  openSession: vi.fn(),
  rotateSession: vi.fn(),
  accountEmail: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const FAMILY = '00000000-0000-4000-8000-000000000002';
const config = {
  tokens: {
    accessKey: new Uint8Array(64).fill(1),
    refreshKey: new Uint8Array(64).fill(2),
    refreshTtlSeconds: 86_400,
  },
} as AuthConfig;
const credentials = {
  verify: vi.fn().mockResolvedValue({ result: 'ok', userId: USER }),
} as unknown as CredentialsService;
const NO_TWO_FACTOR = { secret: null, pendingSecret: null, lastStep: null, required: false };
const twoFactor = { state: vi.fn(), checkSecondFactor: vi.fn() };
const challenges = { attempt: vi.fn(), consume: vi.fn() };
const sendSessionReuseAlert = vi.fn();
const sendNewDeviceLogin = vi.fn();
const mailer = { sendSessionReuseAlert, sendNewDeviceLogin } as unknown as AuthMailer;
const consume = vi.fn();
const warn = vi.fn();
const sent: Promise<void>[] = [];
const service = new SessionService(
  {} as PrismaClient,
  new AccessTokens(config.tokens.accessKey),
  config,
  0,
  credentials,
  mailer,
  {
    sendLater: (_kind: string, send: () => Promise<void>) => {
      sent.push(send());
    },
  } as unknown as MailDispatcher,
  { consume } as unknown as RateLimiter,
  twoFactor as unknown as TwoFactorService,
  challenges as unknown as LoginChallengeService,
  { info: vi.fn(), warn },
);
const client = { userAgent: undefined, ip: undefined };

beforeEach(() => {
  vi.clearAllMocks();
  twoFactor.state.mockResolvedValue(NO_TWO_FACTOR);
});

describe('SessionService', () => {
  it('refuse génériquement si le compte ne peut plus ouvrir de session', async () => {
    db.openSession.mockResolvedValue(null);
    await expect(service.login({ email: 'a@b.test', password: 'x' }, client)).rejects.toMatchObject(
      { code: 'AUTH_INVALID_CREDENTIALS' },
    );
    expect(db.openSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ip: null, device: 'Appareil non identifié' }),
    );
  });

  it('rafraîchit sans IP connue', async () => {
    db.rotateSession.mockResolvedValue({
      outcome: 'rotated',
      userId: USER,
      familyId: FAMILY,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const issued = await service.refresh('a'.repeat(43), client);
    expect(issued.access.expiresIn).toBe(900);
    expect(db.rotateSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ip: null }),
    );
  });

  it('réutilisation sur un compte supprimé entre-temps : aucun email', async () => {
    db.rotateSession.mockResolvedValue({ outcome: 'reuse', userId: USER, familyId: FAMILY });
    db.accountEmail.mockResolvedValue(null);
    await expect(service.refresh('a'.repeat(43), client)).rejects.toMatchObject({
      code: 'AUTH_UNAUTHENTICATED',
    });
    await Promise.all(sent);
    expect(db.accountEmail).toHaveBeenCalledOnce();
    expect(sendSessionReuseAlert).not.toHaveBeenCalled();
  });

  it('plafond « nouvel appareil » illisible (Redis en panne) : email non envoyé, signalé à part', async () => {
    db.openSession.mockResolvedValue({
      familyId: FAMILY,
      expiresAt: new Date(Date.now() + 86_400_000),
      knownDevice: false,
    });
    consume.mockRejectedValue(new Error('redis'));
    await service.login({ email: 'a@b.test', password: 'x' }, client);
    await Promise.all(sent);
    expect(sendNewDeviceLogin).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      { event: 'auth.mail.cap_unavailable', kind: 'new_device_login' },
      expect.any(String),
    );
  });

  it('compte suspendu avant la lecture de l’état 2FA : refus générique, aucune session', async () => {
    twoFactor.state.mockResolvedValueOnce(null);
    await expect(service.login({ email: 'a@b.test', password: 'x' }, client)).rejects.toMatchObject(
      { code: 'AUTH_INVALID_CREDENTIALS' },
    );
    expect(db.openSession).not.toHaveBeenCalled();
  });

  it('« nouvel appareil » sur un compte supprimé entre-temps : aucun email', async () => {
    db.openSession.mockResolvedValue({
      familyId: FAMILY,
      expiresAt: new Date(Date.now() + 86_400_000),
      knownDevice: false,
    });
    consume.mockResolvedValue({ allowed: true });
    db.accountEmail.mockResolvedValue(null);
    await service.login({ email: 'a@b.test', password: 'x' }, client);
    await Promise.all(sent);
    expect(sendNewDeviceLogin).not.toHaveBeenCalled();
  });

  describe('second temps de la connexion', () => {
    const input = { challengeToken: 'a'.repeat(43), code: '123456' };
    const challenge = { userId: USER, device: 'd', credentialStamp: 's' };
    const state = { ...NO_TWO_FACTOR, secret: 'S', credentialStamp: 's' };

    beforeEach(() => {
      challenges.attempt.mockResolvedValue(challenge);
      consume.mockResolvedValue({ allowed: true });
      twoFactor.state.mockResolvedValue(state);
      twoFactor.checkSecondFactor.mockResolvedValue(true);
      challenges.consume.mockResolvedValue(true);
    });

    it('défi consommé par une requête concurrente : refus, aucune session', async () => {
      challenges.consume.mockResolvedValue(false);
      await expect(service.loginTwoFactor(input, client)).rejects.toMatchObject({
        code: 'AUTH_2FA_INVALID',
      });
      expect(db.openSession).not.toHaveBeenCalled();
    });

    it('mot de passe changé depuis le défi : le code n’est pas évalué', async () => {
      twoFactor.state.mockResolvedValue({ ...state, credentialStamp: 'autre' });
      await expect(service.loginTwoFactor(input, client)).rejects.toMatchObject({
        code: 'AUTH_2FA_INVALID',
      });
      expect(twoFactor.checkSecondFactor).not.toHaveBeenCalled();
    });

    it('quota du compte atteint : 429, le code n’est pas évalué', async () => {
      consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });
      await expect(service.loginTwoFactor(input, client)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
      });
      expect(twoFactor.checkSecondFactor).not.toHaveBeenCalled();
    });
  });
});
