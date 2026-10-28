import { expect, test } from '@playwright/test';
import {
  login,
  mailTo,
  refresh,
  refreshCookieOf,
  registerAndConfirm,
  syntheticEmail,
  syntheticPassword,
} from './flows.js';

// Parcours n° 8 (EX-103 n° 5) : un jeton de rafraîchissement rejoué révoque toute la famille, y
// compris le jeton courant, et le titulaire reçoit une alerte.
test('rejeu d’un jeton de rafraîchissement', async ({ request: api }) => {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await registerAndConfirm(api, email, password);

  const first = refreshCookieOf(await login(api, email, password));
  const rotated = await refresh(api, first);
  expect(rotated.status()).toBe(200);
  const current = refreshCookieOf(rotated);

  const replay = await refresh(api, first);
  expect(replay.status()).toBe(401);
  expect(((await replay.json()) as { code: string }).code).toBe('AUTH_UNAUTHENTICATED');
  expect((await refresh(api, current)).status()).toBe(401);

  const alert = await mailTo(email, 'Activité suspecte sur votre compte OZ');
  // Booléens : un échec n'affiche jamais le jeton dans le journal de la CI.
  expect(alert.includes(first) || alert.includes(current)).toBe(false);
});
