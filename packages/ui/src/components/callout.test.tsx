import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Callout } from './callout.js';
import { CheckList } from './check-list.js';

// Encadré d'information (§8.6, E6) et liste à coches.

describe('Callout', () => {
  it('ton légal : jetons du cadre légal (bleu, §8.4 n° 2)', () => {
    render(
      <Callout tone="legal" testId="guardian-callout">
        Un tuteur doit valider.
      </Callout>,
    );
    const box = screen.getByTestId('guardian-callout');
    for (const cls of ['bg-oz-legal-bg', 'border-oz-legal-border', 'text-oz-legal-text']) {
      expect(box.className).toContain(cls);
    }
  });

  it('ton info par défaut : surface-2 et texte atténué', () => {
    render(<Callout testId="info">Texte</Callout>);
    expect(screen.getByTestId('info').className).toContain('bg-oz-surface-2');
  });

  it('dépliable : rien quand fermé ; région polie présente avant l’ouverture ; dépliage animé', () => {
    const { rerender } = render(
      <Callout tone="legal" testId="minor" open={false} live>
        Mineur
      </Callout>,
    );
    expect(screen.queryByTestId('minor')).toBeNull();
    const region = screen.getByTestId('minor-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    rerender(
      <Callout tone="legal" testId="minor" open live>
        Mineur
      </Callout>,
    );
    expect(region.contains(screen.getByTestId('minor'))).toBe(true);
    expect(screen.getByTestId('minor').className).toContain('animate-oz-unfold');
  });

  it('titre et icône décorative', () => {
    render(
      <Callout testId="c" title="À savoir" icon={<svg data-testid="ico" />}>
        x
      </Callout>,
    );
    expect(screen.getByText('À savoir')).toBeTruthy();
    expect(screen.getByTestId('ico').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('CheckList', () => {
  it('liste sémantique, coches décoratives', () => {
    render(<CheckList items={['Publication', 'Journal des consultations']} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(items[1]?.textContent).toBe('Journal des consultations');
  });
});
