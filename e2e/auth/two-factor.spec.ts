import { expect, test } from '@playwright/test';
import { generateTotpCode } from '@oz/auth';
import {
  login,
  mailTo,
  refreshCookieOf,
  registerAndConfirm,
  syntheticEmail,
  syntheticPassword,
} from './flows.js';

// EX-103 n° 7 (D4, D5) : enrôlement, connexion avec code, rejeu refusé, code de secours.
test('2FA TOTP : enrôlement puis connexion en deux étapes', async ({ request }) => {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await registerAndConfirm(request, email, password);

  const first = await login(request, email, password);
  expect(first.status()).toBe(200);
  const { accessToken } = (await first.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const setup = await request.post('/auth/2fa/setup', { headers });
  const { secret } = (await setup.json()) as { secret: string };
  const enable = await request.post('/auth/2fa/enable', {
    headers,
    data: { code: generateTotpCode(secret, Date.now() - 30_000) },
  });
  expect(enable.status()).toBe(200);
  const { recoveryCodes } = (await enable.json()) as { recoveryCodes: string[] };
  expect(recoveryCodes).toHaveLength(10);

  const challenge = async (): Promise<string> => {
    const response = await login(request, email, password);
    const body = (await response.json()) as { status: string; challengeToken: string };
    expect(body.status).toBe('2fa_required');
    return body.challengeToken;
  };

  const code = generateTotpCode(secret, Date.now());
  const done = await request.post('/auth/login/2fa', {
    data: { challengeToken: await challenge(), code },
  });
  expect(done.status()).toBe(200);
  refreshCookieOf(done);

  const replay = await request.post('/auth/login/2fa', {
    data: { challengeToken: await challenge(), code },
  });
  expect(replay.status()).toBe(401);

  const rescued = await request.post('/auth/login/2fa', {
    data: { challengeToken: await challenge(), code: recoveryCodes[0] },
  });
  expect(rescued.status()).toBe(200);
  await mailTo(email, 'Code de secours utilisé sur votre compte OZ');
});
