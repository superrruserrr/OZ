import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../messages/en.json';
import fr from '../../../messages/fr.json';
import HomePage from './page';

// Hors routeur Next : le lien localisé devient un lien simple.
vi.mock('../../i18n/navigation', () => ({
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
}));

function renderHome(locale: 'fr' | 'en'): ReturnType<typeof render> {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <NextIntlClientProvider locale={locale} messages={locale === 'fr' ? fr : en}>
      {children}
    </NextIntlClientProvider>
  );
  return render(<HomePage />, { wrapper });
}

describe('page d’accueil provisoire (EX-004.3)', () => {
  it('a un seul titre de niveau 1, en français par défaut', () => {
    renderHome('fr');
    const [title, ...others] = screen.getAllByRole('heading', { level: 1 });
    expect(others).toHaveLength(0);
    expect(title?.textContent).toContain('Ton talent');
  });

  it('propose un lien d’évitement vers le contenu principal', () => {
    renderHome('fr');
    const skip = screen.getByRole('link', { name: 'Aller au contenu' });
    expect(skip.getAttribute('href')).toBe('#contenu');
    expect(document.getElementById('contenu')).toBe(screen.getByRole('main'));
  });

  it('présente les trois piliers sans chiffre fictif ni logo de tiers (M4, M5)', () => {
    const { container } = renderHome('fr');
    const pillars = screen.getByRole('region', { name: 'Ce que OZ garantit' });
    expect(within(pillars).getAllByRole('listitem')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/\d/);
    // Seule image : le logo OZ (charte, ADR-009).
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it.each([
    ['fr', 'OZ Football ID'],
    ['en', 'OZ Football ID'],
  ] as const)('affiche le logo de la charte, nommé (%s)', (locale, name) => {
    renderHome(locale);
    const logo = screen.getByRole('img', { name });
    expect(logo.closest('picture')?.dataset.testid).toBe('oz-logo');
    expect(logo.closest('header')).not.toBeNull();
  });

  it('accroche en rose de la charte (ADR-009)', () => {
    renderHome('fr');
    const accent = screen.getByRole('heading', { level: 1 }).querySelector('span');
    expect(accent?.className).toContain('text-oz-accent');
  });

  it('pied de page aux quatre couleurs du logo, décoratif', () => {
    renderHome('fr');
    const band = screen.getByTestId('home-brand-band');
    expect(band.getAttribute('aria-hidden')).toBe('true');
    expect(band.children).toHaveLength(4);
  });

  it('n’offre aucun lien vers une page qui n’existe pas encore', () => {
    renderHome('fr');
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(['#contenu', '/', '/en']));
  });

  it('permet de changer de langue, langue courante signalée', () => {
    renderHome('fr');
    const nav = screen.getByRole('navigation', { name: 'Langue' });
    const french = within(nav).getByTestId('locale-switcher-fr');
    const english = within(nav).getByTestId('locale-switcher-en');
    expect(french.getAttribute('aria-current')).toBe('true');
    expect(english.getAttribute('aria-current')).toBeNull();
    expect(english.getAttribute('hreflang')).toBe('en');
    expect(english.getAttribute('lang')).toBe('en');
  });

  it('se traduit en anglais', () => {
    renderHome('en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Your talent');
    expect(screen.getByTestId('locale-switcher-en').getAttribute('aria-current')).toBe('true');
  });
});
