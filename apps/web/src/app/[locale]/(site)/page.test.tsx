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

  it('accroche en rose de la charte (ADR-009)', () => {
    renderHome('fr');
    const accent = screen.getByRole('heading', { level: 1 }).querySelector('span');
    expect(accent?.className).toContain('text-oz-accent');
  });

  it('pied de page : bande aux quatre couleurs, profils, site et informations légales', () => {
    renderHome('fr');
    const band = screen.getByTestId('home-brand-band');
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(band.children).toHaveLength(4);
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

  it('seulement des liens vers des pages qui existent ; inscriptions annoncées sans lien (lot 1.7)', () => {
    renderHome('fr');
    const hrefs = new Set(screen.getAllByRole('link').map((link) => link.getAttribute('href')));
    const allowed =
      /^(#contenu|\/|\/en|\/tarifs|\/a-propos|\/contact|\/profils\/[a-z]+|\/legal\/(cgu|confidentialite|mentions)|\/auth\/(login|role))$/;
    for (const href of hrefs) expect(href, String(href)).toMatch(allowed);
    expect(screen.getByTestId('home-signup-soon').closest('a')).toBeNull();
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
