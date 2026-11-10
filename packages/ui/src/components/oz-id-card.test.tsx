import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OzIdCard } from './oz-id-card.js';

// Carte OZ ID (écran 06, EX-102) : format, champs absents, aucune photo, aucun effet lié à l'âge.

describe('OzIdCard', () => {
  it('nom, détails joints, OZ ID en mono sans coupure, sélectionnable', () => {
    render(
      <OzIdCard
        name="Éloïse Ndongo"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        details={['Milieu', '17 ans', 'Cameroun', 'Pied droit']}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Éloïse Ndongo' })).toBeTruthy();
    expect(screen.getByText('Milieu · 17 ans · Cameroun · Pied droit')).toBeTruthy();
    const value = screen.getByTestId('oz-id-card-value');
    expect(value.textContent).toBe('OZ-CM-26-7K4M9Q-3');
    for (const cls of ['font-mono', 'whitespace-nowrap', 'select-all', 'text-oz-primary']) {
      expect(value.className).toContain(cls);
    }
  });

  it('avatar en initiales, décoratif ; aucune image', () => {
    const { container } = render(
      <OzIdCard name="éloïse  ndongo" ozId="OZ-CM-26-7K4M9Q-3" ozIdLabel="OZ ID" />,
    );
    expect(screen.getByTestId('oz-id-card-avatar').textContent).toBe('ÉN');
    expect(screen.getByTestId('oz-id-card-avatar').getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('img')).toBeNull();
  });

  it('champs absents : ligne omise, sans QR ni badge', () => {
    render(
      <OzIdCard
        name="Junior"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        details={['', undefined]}
      />,
    );
    expect(screen.queryByTestId('oz-id-card-details')).toBeNull();
    expect(screen.queryByTestId('oz-id-card-qr')).toBeNull();
    expect(screen.getByTestId('oz-id-card-avatar').textContent).toBe('J');
  });

  it('QR et badge fournis par l’appelant ; surface-ozid, aucune animation', () => {
    render(
      <OzIdCard
        name="Junior"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        qr={<svg data-testid="qr-code" />}
        badge={<span>Vérifié</span>}
      />,
    );
    expect(screen.getByTestId('oz-id-card-qr').contains(screen.getByTestId('qr-code'))).toBe(true);
    const card = screen.getByTestId('oz-id-card');
    expect(card.className).toContain('bg-oz-surface-ozid');
    expect(card.outerHTML).not.toMatch(/animate-/);
  });

  it('révélation (E2) : la carte monte, l’OZ ID reste lisible en entier, le QR apparaît après la frappe', () => {
    render(
      <OzIdCard
        name="Junior"
        ozId="OZ-CM-26-7K4M9Q-3"
        ozIdLabel="OZ ID"
        qr={<span>QR</span>}
        reveal
      />,
    );
    expect(screen.getByTestId('oz-id-card').className).toContain('motion-safe:animate-oz-rise');
    expect(screen.getByTestId('oz-id-reveal-full').textContent).toBe('OZ-CM-26-7K4M9Q-3');
    const qr = screen.getByTestId('oz-id-card-qr');
    expect(qr.className).toContain('motion-safe:animate-oz-fade-in');
    expect(qr.style.animationDelay).toBe('1180ms');
  });
});
