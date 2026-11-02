import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, otpFor, registerAndConfirm, syntheticEmail, syntheticPassword } from './flows.js';

// EX-111 n° 2, D4 et D5 du lot 1.3cc : envoi, preuve du numéro, code rejoué refusé.
test('téléphone : code reçu, numéro prouvé, rejeu refusé', async ({ request }) => {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await registerAndConfirm(request, email, password);
  const response = await login(request, email, password);
  const { accessToken } = (await response.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const phone = `+23765${String(randomInt(1_000_000, 9_999_999))}`;

  const refused = await request.post('/auth/phone/start', {
    headers,
    data: { phone: '+33612345678' },
  });
  expect(refused.status()).toBe(422);

  const start = await request.post('/auth/phone/start', { headers, data: { phone } });
  expect(start.status()).toBe(202);
  expect(await start.json()).toEqual({ expiresIn: 300, resendAfter: 60 });

  const code = await otpFor(phone);
  const verify = await request.post('/auth/phone/verify', { headers, data: { code } });
  expect(verify.status()).toBe(204);

  const replay = await request.post('/auth/phone/verify', { headers, data: { code } });
  expect(replay.status()).toBe(422);
});
