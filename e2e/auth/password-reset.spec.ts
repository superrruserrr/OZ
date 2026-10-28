import { expect, test } from '@playwright/test';
import {
  login,
  mailTo,
  refresh,
  refreshCookieOf,
  registerAndConfirm,
  syntheticEmail,
  syntheticPassword,
  tokenIn,
} from './flows.js';

// Parcours n° 7 (EX-103) : inscription, confirmation, mot de passe oublié, nouveau mot de passe ;
// l'ancien est refusé et les sessions ouvertes avant la réinitialisation sont fermées.
test('réinitialisation du mot de passe de bout en bout', async ({ request: api }) => {
  const email = syntheticEmail();
  const oldPassword = syntheticPassword();
  const newPassword = syntheticPassword();
  await registerAndConfirm(api, email, oldPassword);

  const before = await login(api, email, oldPassword);
  expect(before.status()).toBe(200);
  const oldCookie = refreshCookieOf(before);
  const oldAccess = ((await before.json()) as { accessToken: string }).accessToken;

  expect((await api.post('/auth/password/forgot', { data: { email } })).status()).toBe(202);
  const token = tokenIn(await mailTo(email, 'Réinitialisation de votre mot de passe'));
  expect(
    (await api.post('/auth/password/reset', { data: { token, password: newPassword } })).status(),
  ).toBe(200);
  await mailTo(email, 'Votre mot de passe a été modifié');

  expect((await login(api, email, oldPassword)).status()).toBe(401);
  expect((await login(api, email, newPassword)).status()).toBe(200);
  // Sessions antérieures révoquées : cookie et jeton d'accès refusés.
  expect((await refresh(api, oldCookie)).status()).toBe(401);
  const sessions = await api.get('/auth/sessions', {
    headers: { Authorization: `Bearer ${oldAccess}` },
  });
  expect(sessions.status()).toBe(401);
});
