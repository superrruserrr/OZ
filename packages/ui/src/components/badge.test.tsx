import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../contrast.js';
import { OZ_MODES, ozThemes } from '../tokens.js';
import { Badge } from './badge.js';

describe('Badge', () => {
  it('expose le statut en data-testid et le ton en data-tone', () => {
    render(
      <Badge tone="kyc" status="kyc-pending">
        KYC en attente
      </Badge>,
    );
    const badge = screen.getByTestId('badge-kyc-pending');
    expect(badge.dataset.tone).toBe('kyc');
    expect(badge.textContent).toBe('KYC en attente');
  });

  it('le statut vaut le ton par défaut', () => {
    render(<Badge tone="verified">Vérifié</Badge>);
    expect(screen.getByTestId('badge-verified').dataset.tone).toBe('verified');
  });

  it.each([
    ['verified', 'text-oz-primary'],
    ['kyc', 'text-oz-kyc'],
    ['legal', 'text-oz-legal-text'],
    ['danger', 'text-oz-danger'],
    ['neutral', 'text-oz-text-muted'],
  ] as const)('ton %s : couleur de texte %s (design.md §8.4)', (tone, textClass) => {
    render(<Badge tone={tone}>x</Badge>);
    expect(screen.getByTestId(`badge-${tone}`).className).toContain(textClass);
  });

  it('rempli : fond teinté du ton, pour les pilules de la direction sport', () => {
    render(
      <Badge tone="verified" filled>
        Vérifié
      </Badge>,
    );
    const badge = screen.getByTestId('badge-verified');
    expect(badge.dataset.filled).toBe('true');
    expect(badge.className).toContain('bg-oz-primary/10');
  });

  it.each([
    ['primary', 'surface-2'],
    ['kyc', 'surface-2'],
    ['legal-text', 'legal-bg'],
    ['danger', 'surface-2'],
    ['text-muted', 'surface-2'],
  ] as const)('contraste AA du texte %s sur %s, dans les deux modes', (fg, bg) => {
    for (const mode of OZ_MODES) {
      expect(contrastRatio(ozThemes[mode][fg], ozThemes[mode][bg]), mode).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
