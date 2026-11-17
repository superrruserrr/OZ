import { createRequire } from 'node:module';
import AxeBuilder from '@axe-core/playwright';
import { generateTotpCode } from '@oz/auth';
import { expect, request as apiRequest, test, type Browser, type Page } from '@playwright/test';
import { buildPdf } from '../../apps/worker/test/fixtures.js';
import { API_URL, WEB_ORIGIN } from '../auth/api-stack.js';
import {
  login,
  mailTo,
  registerAndConfirm,
  syntheticEmail,
  syntheticPassword,
  tokenIn,
} from '../auth/flows.js';
import { logIn, settle, signUpAndConfirm, useClientAddress } from './helpers.js';

// E2E n° 2 (lot 1.7b, EX-108, CP-13) : un joueur mineur invite son tuteur ; le tuteur crée son
// compte, accepte, dépose son justificatif ; un administrateur l'approuve ; le tuteur consent, et la
// fiche reste non publiée faute de KYC (lot 1.10). Puis retrait d'un accord, et retrait du lien par
// un administrateur (C6) : l'enfant peut réinviter. Le site relaie l'API (ADR-010) ; données
// synthétiques seulement. L'analyse antivirus (prouvée par le parcours n° 10) est posée en base.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const fromApi = createRequire(new URL('../../apps/api/package.json', import.meta.url));
interface SqlClient {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}
const pg = fromApi('pg') as {
  Client: new (config: { connectionString: string | undefined }) => SqlClient;
};

function bornYearsAgo(years: number): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - 2);
  return date.toISOString().slice(0, 10);
}

async function choose(page: Page, testId: string, option: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function audit(page: Page): Promise<void> {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  expect(violations.map((violation) => violation.id)).toEqual([]);
  // 320 px : aucun défilement horizontal.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
}

/** Joueur mineur inscrit par le parcours réel, tuteur déclaré par téléphone seulement. */
async function minorWithCard(page: Page): Promise<void> {
  const email = syntheticEmail();
  const password = syntheticPassword();
  await signUpAndConfirm(page, email, password);
  await page.getByTestId('verify-login').click();
  await logIn(page, email, password);
  await expect(page).toHaveURL(/\/onboarding\/identite$/);
  await page.getByTestId('onboarding-first-name').fill('Awa');
  await page.getByTestId('onboarding-last-name').fill('Ndiaye');
  await page.getByTestId('onboarding-birth-date').fill(bornYearsAgo(14));
  await choose(page, 'onboarding-nationality', 'Cameroun');
  await choose(page, 'onboarding-country', 'Cameroun');
  await page.getByTestId('onboarding-city').fill('Douala');
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(/\/onboarding\/physique$/);
  await choose(page, 'onboarding-primary-position', 'Attaquant');
  await page.getByTestId('onboarding-foot-right').click();
  await page.getByTestId('onboarding-height').fill('160');
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(/\/onboarding\/rattachement$/);
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(/\/onboarding\/tuteur$/);
  await page.getByTestId('onboarding-guardian-first-name').fill('Mariam');
  await page.getByTestId('onboarding-guardian-last-name').fill('Ndiaye');
  await choose(page, 'onboarding-guardian-relationship', 'Mère');
  await choose(page, 'onboarding-guardian-country', 'Cameroun');
  await page.getByTestId('onboarding-guardian-phone').fill('+237690000002');
  await page.getByTestId('onboarding-submit').click();
  await expect(page).toHaveURL(/\/onboarding\/oz-id$/);
  await page.getByTestId('onboarding-complete').click();
  await expect(page.getByTestId('oz-id-card')).toBeVisible();
}

/** Invitation depuis l'écran du mineur : canal lien, lien affiché une seule fois. */
async function invite(page: Page): Promise<string> {
  await page.goto('/onboarding');
  await page.getByTestId('guardian-invite-entry').click();
  await expect(page).toHaveURL(/\/onboarding\/invitation-tuteur$/);
  await page.getByTestId('guardian-invite-send').click();
  await expect(page.getByTestId('guardian-invite-link')).toBeVisible();
  const link = await page.getByTestId('guardian-invite-url').inputValue();
  expect(link.startsWith(`${WEB_ORIGIN}/tuteur/invitation#token=`)).toBe(true);
  return link;
}

/** Administrateur à 2FA réelle, posé par l'API puis promu en base. */
async function admin(db: SqlClient) {
  const api = await apiRequest.newContext({
    baseURL: API_URL,
    extraHTTPHeaders: { Origin: WEB_ORIGIN, 'X-Forwarded-For': '198.51.100.90' },
  });
  const email = syntheticEmail();
  const password = syntheticPassword();
  await registerAndConfirm(api, email, password);
  const session = await login(api, email, password);
  const { accessToken } = (await session.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const setup = await api.post('/auth/2fa/setup', { headers });
  const { secret } = (await setup.json()) as { secret: string };
  expect(
    (
      await api.post('/auth/2fa/enable', {
        headers,
        data: { code: generateTotpCode(secret, Date.now() - 30_000) },
      })
    ).status(),
  ).toBe(200);
  await db.query(
    `INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM users WHERE email = $1`,
    [email],
  );
  const reauth = () => ({ password, code: generateTotpCode(secret, Date.now()) });
  return { api, headers, reauth };
}

async function newPage(browser: Browser, host: number): Promise<Page> {
  const context = await browser.newContext({ baseURL: WEB_ORIGIN });
  const page = await context.newPage();
  await useClientAddress(page, host);
  await page.setViewportSize({ width: 320, height: 720 });
  return page;
}

test('E2E n° 2 : mineur → tuteur → justificatif → accord, publication bloquée ; puis C6', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await db.connect();
  try {
    // 1. Le joueur mineur s'inscrit et invite son tuteur.
    const child = await newPage(browser, 40);
    await minorWithCard(child);
    const link = await invite(child);
    await audit(child);

    // 2. Le tuteur ouvre le lien : aperçu sans compte, jeton retiré de l'adresse.
    const tutor = await newPage(browser, 41);
    await tutor.goto(link);
    await expect(tutor.getByTestId('guardian-invitation-preview')).toContainText('Awa');
    await expect(tutor.getByTestId('guardian-invitation-preview')).not.toContainText('Ndiaye');
    expect(new URL(tutor.url()).hash).toBe('');
    await audit(tutor);

    // 3. Il crée son compte de tuteur, confirme son adresse, se connecte et revient à l'invitation.
    const email = syntheticEmail();
    const password = syntheticPassword();
    await tutor.getByTestId('guardian-invitation-signup').click();
    await expect(tutor).toHaveURL(/\/auth\/signup\/guardian$/);
    await tutor.getByTestId('signup-email').fill(email);
    await tutor.getByTestId('signup-password').fill(password);
    await tutor.waitForTimeout(3_100);
    await tutor.getByTestId('signup-submit').click();
    await expect(tutor.getByTestId('signup-sent')).toBeVisible();
    const verify = tokenIn(await mailTo(email, 'Confirmez votre adresse email'));
    await tutor.goto(`/auth/verify-email#token=${verify}`);
    await expect(tutor.getByTestId('verify-done')).toBeVisible();
    await tutor.getByTestId('verify-login').click();
    await logIn(tutor, email, password);
    await expect(tutor).toHaveURL(/\/tuteur\/invitation$/);
    await tutor.getByTestId('guardian-invitation-accept').click();
    await expect(tutor).toHaveURL(/\/tuteur$/);
    await expect(tutor.getByTestId('badge-link-awaiting_documents')).toBeVisible();
    await expect(tutor.getByTestId('guardian-child-ozid')).toHaveCount(0);
    await audit(tutor);

    // 4. Dépôt du justificatif : pièce relayée par le site, analysée (posée en base), soumise.
    await tutor.getByTestId('guardian-child-deposit').click();
    await expect(tutor).toHaveURL(/\/tuteur\/justificatif\//);
    await audit(tutor);
    await tutor.getByTestId('guardian-link-file').setInputFiles({
      name: 'acte-de-naissance.pdf',
      mimeType: 'application/pdf',
      buffer: buildPdf(1),
    });
    await tutor.getByTestId('guardian-link-add').click();
    await expect(tutor.getByTestId('guardian-link-pieces')).toContainText('acte-de-naissance.pdf');
    await db.query(
      `UPDATE documents SET av_status = 'clean', storage_key = 'clean/' || id
       WHERE uploaded_by = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    await tutor.getByTestId('guardian-link-submit').click();
    await expect(tutor.getByTestId('guardian-link-sent')).toBeVisible();

    // 5. Un administrateur approuve (API, pas d'écran : D-135).
    const reviewer = await admin(db);
    const queue = await reviewer.api.get('/admin/guardian-links', { headers: reviewer.headers });
    const { reviews } = (await queue.json()) as {
      reviews: { reviewId: string; childFirstName: string }[];
    };
    const review = reviews.find((entry) => entry.childFirstName === 'Awa');
    expect(review).toBeDefined();
    const approved = await reviewer.api.post(
      `/admin/guardian-links/${review?.reviewId ?? ''}/decision`,
      { headers: reviewer.headers, data: { decision: 'approve', ...reviewer.reauth() } },
    );
    expect(approved.status()).toBe(200);

    // 6. Le tuteur consent (traitement, puis publication), ré-authentifié.
    await tutor.goto('/tuteur');
    await expect(tutor.getByTestId('badge-link-approved')).toBeVisible();
    await expect(tutor.getByTestId('guardian-child-ozid')).toContainText(/OZ-CM-/);
    await tutor.getByTestId('guardian-child-consent').click();
    await expect(tutor).toHaveURL(/\/tuteur\/accords\/OZ-CM-/);
    await expect(tutor.getByTestId('guardian-consent-kyc')).toBeVisible();
    await expect(
      tutor.getByTestId('guardian-consent-guardian_profile_publication-blocked'),
    ).toBeVisible();
    await audit(tutor);
    const data = 'guardian-consent-guardian_data_processing';
    await tutor.getByTestId(`${data}-agree`).check();
    await tutor.getByTestId(`${data}-password`).fill('mauvais mot de passe');
    await tutor.getByTestId(`${data}-give`).click();
    await expect(tutor.getByTestId(`${data}-error`)).toContainText(
      'Mot de passe ou code incorrect',
    );
    await tutor.getByTestId(`${data}-password`).fill(password);
    await tutor.getByTestId(`${data}-give`).click();
    await expect(tutor.getByTestId(`${data}-notice`)).toBeVisible();
    await expect(tutor.getByTestId(data).getByTestId('badge-consent-active')).toBeVisible();
    const publication = 'guardian-consent-guardian_profile_publication';
    await tutor.getByTestId(`${publication}-agree`).check();
    await tutor.getByTestId(`${publication}-password`).fill(password);
    await tutor.getByTestId(`${publication}-give`).click();
    await expect(tutor.getByTestId(publication).getByTestId('badge-consent-active')).toBeVisible();

    // 7. Blocage de publication (CP-13, R5) : accords enregistrés, fiche non publiée sans KYC.
    const published = async (): Promise<boolean> => {
      const { rows } = await db.query(
        `SELECT oz_player_published(p.id, p.guardian_id, p.verification_status) AS published
         FROM players p WHERE p.guardian_id = (
           SELECT g.id FROM guardians g JOIN users u ON u.id = g.user_id WHERE u.email = $1)`,
        [email],
      );
      return (rows[0] as { published: boolean } | undefined)?.published === true;
    };
    const { rows: active } = await db.query(
      `SELECT count(*)::int AS n FROM consents c JOIN users u ON u.id = c.granted_by_user_id
       WHERE u.email = $1 AND c.revoked_at IS NULL`,
      [email],
    );
    expect((active[0] as { n: number }).n).toBe(2);
    expect(await published()).toBe(false);
    await tutor.goto('/tuteur');
    await expect(tutor.getByTestId('badge-unpublished')).toBeVisible();

    // 8. Retrait d'un accord : sans ré-authentification, confirmé.
    await tutor.getByTestId('guardian-child-consent').click();
    await tutor.getByTestId(`${publication}-revoke`).click();
    await tutor.getByTestId(`${publication}-revoke-confirm`).click();
    await expect(tutor.getByTestId(`${publication}-notice`)).toBeVisible();
    await expect(
      tutor.getByTestId(publication).getByTestId('badge-consent-inactive'),
    ).toBeVisible();

    // 9. C6 : un autre administrateur retire le lien ; le tuteur perd l'enfant, l'enfant réinvite.
    const second = await admin(db);
    const revoked = await second.api.post(
      `/admin/guardian-links/${review?.reviewId ?? ''}/revocation`,
      { headers: second.headers, data: { reason: 'approved_in_error', ...second.reauth() } },
    );
    expect(revoked.status()).toBe(200);
    await tutor.goto('/tuteur');
    await expect(tutor.getByTestId('guardian-children-empty')).toBeVisible();
    expect(await mailTo(email, 'Votre lien avec votre enfant a été retiré')).toContain('Awa');
    await invite(child);
    await Promise.all([reviewer.api.dispose(), second.api.dispose()]);
  } finally {
    await db.end();
  }
});
