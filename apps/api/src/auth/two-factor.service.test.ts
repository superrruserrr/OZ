import type { AuthConfig } from '@oz/config';
import type { PrismaClient } from '@oz/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RateLimiter } from '../common/rate-limit/rate-limiter.service.js';
import type { CredentialsService } from './credentials.service.js';
import type { AuthMailer } from './mail/auth-mailer.js';
import type { MailDispatcher } from './mail/mail-dispatcher.js';
import { TwoFactorService } from './two-factor.service.js';

// Cas que le banc HTTP ne sait pas provoquer : courses avec la base entre lecture et écriture.
const db = vi.hoisted(() => ({
  accountEmail: vi.fn(),
  beginTotp: vi.fn(),
  consumeRecoveryCode: vi.fn(),
  consumeTotpStep: vi.fn(),
  disableTotp: vi.fn(),
  enableTotp: vi.fn(),
  replaceRecoveryCodes: vi.fn(),
  totpState: vi.fn(),
  withUserContext: vi.fn((_db: unknown, _user: string, fn: (tx: unknown) => unknown) => fn({})),
}));
vi.mock('@oz/db', () => db);

const USER = '00000000-0000-4000-8000-000000000001';
const FAMILY = '00000000-0000-4000-8000-000000000002';
const SECRET = 'A'.repeat(32);
const RECOVERY = 'ABCD-EFGH-IJKL-MNOP';
const { generateTotpCode } = await import('@oz/auth');
const code = () => generateTotpCode(SECRET, Date.now());
const active = {
  secret: SECRET,
  pendingSecret: null,
  lastStep: null,
  required: false,
  credentialStamp: 's',
};
const disableInput = () => ({ password: 'x', code: code() });

const consume = vi.fn();
const verify = vi.fn();
const reserveSecondFactor = vi.fn();
const clearSecondFactor = vi.fn();
const sendRecoveryCodeUsed = vi.fn();
const sent: Promise<void>[] = [];
const service = new TwoFactorService(
  {} as PrismaClient,
  { hmacKey: 'h'.repeat(40), totpEncryptionKey: 'k'.repeat(40) } as AuthConfig,
  { verify, reserveSecondFactor, clearSecondFactor } as unknown as CredentialsService,
  { consume } as unknown as RateLimiter,
  { sendRecoveryCodeUsed, sendTwoFactorDisabled: vi.fn() } as unknown as AuthMailer,
  {
    sendLater: (_kind: string, send: () => Promise<void>) => {
      sent.push(send());
    },
  } as unknown as MailDispatcher,
);

beforeEach(() => {
  vi.clearAllMocks();
  consume.mockResolvedValue({ allowed: true });
  reserveSecondFactor.mockResolvedValue(0);
  verify.mockResolvedValue({ result: 'ok', userId: USER });
  db.totpState.mockResolvedValue(active);
  db.accountEmail.mockResolvedValue('a@b.test');
  db.consumeTotpStep.mockResolvedValue(true);
});

describe('TwoFactorService', () => {
  it('quota du compte atteint : 429 avant tout travail', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
    await expect(service.setup(USER)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(db.beginTotp).not.toHaveBeenCalled();
  });

  it('compte suspendu pendant l’enrôlement : 401', async () => {
    db.beginTotp.mockResolvedValue(false);
    await expect(service.setup(USER)).rejects.toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
    db.totpState.mockResolvedValue(null);
    await expect(service.enable(USER, FAMILY, { code: '123456' })).rejects.toMatchObject({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('secret remplacé par un enrôlement concurrent : 409', async () => {
    db.totpState.mockResolvedValue({ ...active, secret: null, pendingSecret: SECRET });
    db.enableTotp.mockResolvedValue(false);
    await expect(service.enable(USER, FAMILY, { code: code() })).rejects.toMatchObject({
      code: 'AUTH_2FA_NOT_PENDING',
    });
  });

  it('désactivation : compte disparu pendant la lecture de l’adresse', async () => {
    db.accountEmail.mockResolvedValue(null);
    await expect(service.disable(USER, FAMILY, disableInput())).rejects.toMatchObject({
      code: 'AUTH_UNAUTHENTICATED',
    });
  });

  it('désactivation : délai exponentiel du mot de passe porté jusqu’au client', async () => {
    verify.mockResolvedValue({ result: 'retry_later', retryAfterSeconds: 9 });
    await expect(service.disable(USER, FAMILY, disableInput())).rejects.toMatchObject({
      code: 'AUTH_RETRY_LATER',
    });
  });

  it('désactivation : rôle obligatoire déjà connu, puis attribué pendant la vérification', async () => {
    db.totpState.mockResolvedValue({ ...active, required: true });
    await expect(service.disable(USER, FAMILY, disableInput())).rejects.toMatchObject({
      code: 'AUTH_2FA_REQUIRED',
    });
    db.totpState.mockResolvedValue(active);
    db.disableTotp.mockResolvedValue('required');
    await expect(service.disable(USER, FAMILY, disableInput())).rejects.toMatchObject({
      code: 'AUTH_2FA_REQUIRED',
    });
  });

  it('désactivation : déjà inactive à l’écriture', async () => {
    db.disableTotp.mockResolvedValue('inactive');
    await expect(service.disable(USER, FAMILY, disableInput())).rejects.toMatchObject({
      code: 'AUTH_2FA_NOT_ENABLED',
    });
  });

  it('désactivation réussie, compte supprimé avant l’alerte : aucun email', async () => {
    db.disableTotp.mockResolvedValue('disabled');
    db.accountEmail.mockResolvedValueOnce('a@b.test').mockResolvedValueOnce(null);
    await service.disable(USER, FAMILY, disableInput());
    await Promise.all(sent);
  });

  it('régénération : 2FA retirée entre la lecture et l’écriture', async () => {
    db.replaceRecoveryCodes.mockResolvedValue(false);
    await expect(service.regenerateRecoveryCodes(USER, code())).rejects.toMatchObject({
      code: 'AUTH_2FA_NOT_ENABLED',
    });
  });

  it('second facteur pendant le délai : 429, le code n’est pas évalué', async () => {
    reserveSecondFactor.mockResolvedValue(30);
    await expect(service.checkSecondFactor(USER, active, code())).rejects.toMatchObject({
      code: 'AUTH_RETRY_LATER',
    });
    expect(db.consumeTotpStep).not.toHaveBeenCalled();
  });

  it('second facteur sans secret actif : refus', async () => {
    const state = { ...active, secret: null };
    expect(await service.checkSecondFactor(USER, state, code())).toBe(false);
  });

  it('code de secours consommé : compteur effacé, alerte envoyée', async () => {
    db.consumeRecoveryCode.mockResolvedValue(9);
    expect(await service.checkSecondFactor(USER, active, RECOVERY)).toBe(true);
    await Promise.all(sent);
    expect(clearSecondFactor).toHaveBeenCalledOnce();
    expect(sendRecoveryCodeUsed).toHaveBeenCalledOnce();
  });

  it('code de secours inconnu ou saisie sans forme : refus, compteur conservé', async () => {
    db.consumeRecoveryCode.mockResolvedValue(null);
    expect(await service.checkSecondFactor(USER, active, RECOVERY)).toBe(false);
    expect(await service.checkSecondFactor(USER, active, '000000')).toBe(false);
    expect(clearSecondFactor).not.toHaveBeenCalled();
  });
});
