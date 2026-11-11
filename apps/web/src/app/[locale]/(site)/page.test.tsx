import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/en.json';
import fr from '../../../../messages/fr.json';
import SiteLayout from './layout';
import HomePage from './page';

// Hors routeur Next : le lien localisé devient un lien simple.
vi.mock('../../../i18n/navigation', () => ({
  Link: ({
    href,
    locale,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { locale?: string }) => (
    <a
      href={locale === 'en' ? `/en${href === '/' ? '' : String(href)}` : String(href)}
      {...props}
    />
  ),
  usePathname: () => '/',
}));
vi.mock('next/root-params', () => ({ locale: () => Promise.resolve('fr') }));

function renderHome(locale: 'fr' | 'en'): ReturnType<typeof render> {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === 'fr' ? fr : en}>
      {children}
    </NextIntlClientProvider>
  );
  return render(
    <SiteLayout>
      <HomePage />
    </SiteLayout>,
    { wrapper },
  );
}

describe('accueil et gabarit du site public (lot 1.6, EX-106)', () => {
  it('un seul titre de niveau 1, en français par défaut', () => {
    renderHome('fr');
    const [title, ...others] = screen.getAllByRole('heading', { level: 1 });
    expect(others).toHaveLength(0);
    expect(title?.textContent).toContain('Ton talent');
  });

  it('lien d’évitement vers le contenu principal', () => {
    renderHome('fr');
    const skip = screen.getByRole('link', { name: 'Aller au contenu' });
    expect(skip.getAttribute('href')).toBe('#contenu');
    expect(document.getElementById('contenu')).toBe(screen.getByRole('main'));
  });

  it('trois piliers, sans chiffre fictif ni logo de tiers (M4, M5)', () => {
    const { container } = renderHome('fr');
    const pillars = screen.getByRole('region', { name: 'Ce que OZ garantit' });
    expect(within(pillars).getAllByRole('listitem')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/\d/);
    expect(container.textContent).not.toMatch(/FIFA|CAF|Puma|Turkish|MTN/i);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it.each(['fr', 'en'] as const)(
    'logo de la charte dans l’en-tête, lien vers l’accueil (%s)',
    (locale) => {
      renderHome(locale);
      const logo = screen.getByRole('img', { name: 'OZ Football ID' });
      expect(logo.closest('picture')?.dataset.testid).toBe('oz-logo');
      expect(logo.closest('header')).not.toBeNull();
      // Le vrai `Link` préfixe la langue ; la doublure ne le fait qu'avec `locale`.
      expect(logo.closest('a')?.getAttribute('href')).toBe('/');
    },
  );

  it('héros de stade : accroche en lime, panneau « en direct » sans chiffre (1.5cba, ADR-012)', () => {
    renderHome('fr');
    const accent = screen.getByRole('heading', { level: 1 }).querySelector('em');
    expect(accent?.className).toContain('text-oz-accent');
    expect(screen.getByTestId('stadium-hero-grid')).toBeTruthy();
    expect(screen.getByTestId('home-live-panel').textContent).not.toMatch(/\d/);
  });

  it('appel à l’inscription vers le choix du rôle, tarifs à côté', () => {
    renderHome('fr');
    expect(screen.getByTestId('home-signup').getAttribute('href')).toBe('/auth/role');
    expect(screen.getByTestId('home-pricing-link').getAttribute('href')).toBe('/tarifs');
  });

  it('en-tête « sport » : menu mobile et lien de création de compte', () => {
    renderHome('fr');
    expect(screen.getByTestId('site-menu-button').getAttribute('aria-label')).toBe('Menu');
    expect(screen.getAllByTestId('site-signup')[0]?.getAttribute('href')).toBe('/auth/role');
  });

  it('pied de page : profils, site et informations légales, sans la bande de l’ancienne charte', () => {
    renderHome('fr');
    expect(screen.queryByTestId('home-brand-band')).toBeNull();
    const legal = screen.getByRole('navigation', { name: 'Informations légales' });
    expect(
      within(legal)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['/legal/mentions', '/legal/confidentialite', '/legal/cgu']);
  });

  it('les sept profils, chacun vers sa page', () => {
    renderHome('fr');
    const profiles = screen.getByRole('region', { name: 'Pour qui ?' });
    expect(
      within(profiles)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual([
      '/profils/joueur',
      '/profils/tuteur',
      '/profils/academie',
      '/profils/club',
      '/profils/federation',
      '/profils/centre',
      '/profils/recruteur',
    ]);
  });

  it('seulement des liens vers des pages qui existent', () => {
    renderHome('fr');
    const hrefs = new Set(screen.getAllByRole('link').map((link) => link.getAttribute('href')));
    const allowed =
      /^(#contenu|\/|\/en|\/tarifs|\/a-propos|\/contact|\/profils\/[a-z]+|\/legal\/(cgu|confidentialite|mentions)|\/auth\/(login|role))$/;
    for (const href of hrefs) expect(href, String(href)).toMatch(allowed);
  });

  it('landing : mission, parcours en trois étapes, questions fréquentes (lot 1.5db)', () => {
    renderHome('fr');
    const mission = screen.getByRole('region', { name: 'Pourquoi OZ existe' });
    expect(mission.textContent).toContain('Le problème');
    expect(mission.textContent).toContain('Notre réponse');
    const steps = screen.getByRole('region', { name: 'Comment ça marche' });
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3);
    const faq = screen.getByRole('region', { name: 'Questions fréquentes' });
    expect(faq.querySelectorAll('details').length).toBeGreaterThanOrEqual(4);
  });

  it('aperçu de fiche : exemple annoncé comme tel, sport et écusson visibles, sans chiffre', () => {
    renderHome('fr');
    const preview = screen.getByTestId('home-preview');
    expect(preview.textContent).toContain('Exemple');
    expect(within(preview).getByTestId('sport-tag-football').textContent).toBe('Football');
    expect(within(preview).getByTestId('club-crest')).toBeTruthy();
    expect(preview.textContent).not.toMatch(/\d/);
    expect(preview.textContent).not.toMatch(/score|index|note/i);
  });

  it('données structurées : organisation et site, sans balise ouvrante dans le JSON', () => {
    const { container } = renderHome('fr');
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script?.textContent).not.toContain('<');
    const data = JSON.parse(script?.textContent ?? '{}') as { '@graph': { '@type': string }[] };
    expect(data['@graph'].map((node) => node['@type'])).toEqual(['Organization', 'WebSite']);
  });

  it('langues : même page, langue courante signalée', () => {
    renderHome('fr');
    const nav = screen.getByRole('navigation', { name: 'Langue' });
    expect(within(nav).getByTestId('locale-switcher-fr').getAttribute('aria-current')).toBe('true');
    expect(within(nav).getByTestId('locale-switcher-en').getAttribute('hreflang')).toBe('en');
  });

  it('se traduit en anglais', () => {
    renderHome('en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Your talent');
  });
});
