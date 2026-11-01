import { issueFormToken, type RecaptchaVerdict } from '@oz/auth';
import type { ApiConfig, AuthConfig } from '@oz/config';
import type { PrismaClient } from '@oz/db';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import { AuthService } from './auth.service.js';
import type { AuthMailer } from './mail/auth-mailer.js';
import type { MailDispatcher } from './mail/mail-dispatcher.js';

// Cas que le banc HTTP ne sait pas provoquer : reCAPTCHA sans secret (le banc le remplace par un
// double) et secret refusé par Google.
const db = vi.hoisted(() => ({ registerUser: vi.fn() }));
vi.mock('@oz/db', () => db);

const KEY = 'h'.repeat(40);
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const service = (recaptcha: { verify: () => Promise<RecaptchaVerdict> } | null) =>
  new AuthService(
    {} as PrismaClient,
    {} as AuthMailer,
    { check: () => Promise.resolve('clean' as const) },
    0,
    { appEnv: 'local' } as ApiConfig,
    logger as unknown as PinoLogger,
    { sendLater: vi.fn() } as unknown as MailDispatcher,
    { consume: () => Promise.resolve({ allowed: true }) } as unknown as RateLimiter,
    { hmacKey: KEY } as AuthConfig,
    recaptcha,
  );

const input = () => ({
  email: 'a@b.test',
  password: 'correct horse battery staple',
  formToken: issueFormToken(KEY, Date.now() - 10_000),
});

beforeEach(() => {
  vi.clearAllMocks();
  db.registerUser.mockResolvedValue({ userId: 'u' });
});

describe('AuthService : reCAPTCHA (D4 du lot 1.3ca)', () => {
  it('sans secret : signalé au démarrage, inscription traitée sans vérification', async () => {
    const auth = service(null);
    auth.onModuleInit();
    expect(logger.warn).toHaveBeenCalledWith(
      { event: 'auth.recaptcha.disabled', appEnv: 'local' },
      expect.any(String),
    );
    await auth.register(input());
    expect(db.registerUser).toHaveBeenCalledOnce();
  });

  it('avec secret : rien à signaler au démarrage', () => {
    service({ verify: () => Promise.resolve({ verdict: 'human', score: 0.9 }) }).onModuleInit();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('secret refusé par Google : inscription acceptée, erreur de configuration journalisée', async () => {
    await service({
      verify: () => Promise.resolve({ verdict: 'unavailable', cause: 'configuration' }),
    }).register(input());
    expect(db.registerUser).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      { event: 'auth.recaptcha.misconfigured', appEnv: 'local' },
      expect.any(String),
    );
  });
});
