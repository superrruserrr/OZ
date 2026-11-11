import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Audit du lot 1.5bb (EX-T22, EX-105 n° 3 et 4) : axe-core, 320 px et chargement en 3G simulée.
// Lighthouse lui-même est passé en recette (D-129) ; ces mesures en tiennent lieu en CI.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const PAGES = [
  '/',
  '/en',
  '/page-inexistante',
  // Site public (lot 1.6)
  '/tarifs',
  '/en/tarifs',
  '/a-propos',
  '/contact',
  '/legal/cgu',
  '/legal/confidentialite',
  '/legal/mentions',
  '/profils/joueur',
  '/profils/federation',
] as const;

/** Profil « Fast 3G » des outils de Chromium : 562,5 ms de latence, 1,44 Mbit/s descendant. */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1.44 * 1024 * 1024) / 8,
  uploadThroughput: (675 * 1024) / 8,
};
const RUNS = 5;
const P95_BUDGET_MS = 2500;

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      // Les boucles (flottement des puces, E20) ne finissent jamais : seules les entrées comptent.
      .filter((animation) => animation.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
      .every((animation) => animation.playState === 'finished'),
  );
}

for (const path of PAGES) {
  test(`${path} : WCAG 2.1 AA (axe-core) à 320 px, sans défilement horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(path);
    await settle(page);
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
    expect(violations.map(({ id, nodes }) => `${id} (${String(nodes.length)})`)).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('barre du navigateur à la couleur du fond sombre, quel que soit le réglage (ADR-011)', async ({
  page,
}) => {
  await page.goto('/');
  const colors = await page
    .locator('meta[name="theme-color"]')
    .evaluateAll((metas) =>
      metas.map(
        (meta) => `${meta.getAttribute('media') ?? ''} ${meta.getAttribute('content') ?? ''}`,
      ),
    );
  // Un seul thème servi : une seule balise, sans requête média.
  expect(colors.map((color) => color.trim().toLowerCase())).toEqual(['#1b161b']);
});

test(`accueil en 3G simulée : p95 de l’affichage du contenu principal (LCP) sous ${String(P95_BUDGET_MS)} ms (EX-T22.3)`, async ({
  page,
  context,
}) => {
  test.slow();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', FAST_3G);
  // Mesure : le plus grand affichage de contenu (LCP), seuil « bon » des Core Web Vitals ; le
  // chargement complet (JavaScript compris) est consigné à titre indicatif (D-129).
  const lcps: number[] = [];
  const loads: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    await page.goto('/', { waitUntil: 'load' });
    const { lcp, load } = await page.evaluate(
      () =>
        new Promise<{ lcp: number; load: number }>((resolve) => {
          new PerformanceObserver((list) => {
            const [nav] = performance.getEntriesByType(
              'navigation',
            ) as PerformanceNavigationTiming[];
            resolve({
              lcp: list.getEntries().at(-1)?.startTime ?? Number.POSITIVE_INFINITY,
              load: nav ? nav.loadEventEnd : Number.POSITIVE_INFINITY,
            });
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        }),
    );
    lcps.push(lcp);
    loads.push(load);
  }
  lcps.sort((a, b) => a - b);
  // Sur 5 essais, le 95e centile est le plus lent.
  const p95 = lcps.at(-1) ?? Number.POSITIVE_INFINITY;
  test.info().annotations.push(
    { type: 'LCP 3G (ms)', description: lcps.map((d) => d.toFixed(0)).join(', ') },
    {
      type: 'chargement complet 3G (ms)',
      description: loads.map((d) => d.toFixed(0)).join(', '),
    },
  );
  expect(p95).toBeLessThan(P95_BUDGET_MS);
});
