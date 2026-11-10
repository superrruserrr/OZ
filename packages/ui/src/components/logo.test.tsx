import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Logo, LOGO_FILES } from './logo.js';

describe('Logo', () => {
  it('choisit la version par mode et par largeur, de la plus précise à la plus générale', () => {
    const { container } = render(<Logo alt="OZ Football ID" />);
    const sources = [...container.querySelectorAll('source')].map((source) => [
      source.getAttribute('media'),
      source.getAttribute('srcset'),
    ]);
    expect(sources).toEqual([
      [
        '(max-width: 639px) and (prefers-color-scheme: dark)',
        '/brand/oz-logo-empile-fond-sombre.png',
      ],
      ['(max-width: 639px)', '/brand/oz-logo-empile-fond-clair.png'],
      ['(prefers-color-scheme: dark)', '/brand/oz-logo-horizontal-fond-sombre.png'],
    ]);
    const img = screen.getByRole('img', { name: 'OZ Football ID' });
    expect(img.getAttribute('src')).toBe('/brand/oz-logo-horizontal-fond-clair.png');
  });

  it('fixe les dimensions de chaque version : aucun décalage au chargement', () => {
    const { container } = render(<Logo alt="OZ" />);
    for (const source of container.querySelectorAll('source')) {
      expect(Number(source.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(source.getAttribute('height'))).toBeGreaterThan(0);
    }
    const img = screen.getByRole('img', { name: 'OZ' });
    expect(img.getAttribute('width')).toBe(String(LOGO_FILES.horizontal.width));
    expect(img.getAttribute('height')).toBe(String(LOGO_FILES.horizontal.height));
  });

  it('accepte un autre dossier et des classes, et reste décoratif avec un alt vide', () => {
    const { container } = render(<Logo alt="" basePath="/static/brand" className="h-10" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/static/brand/oz-logo-horizontal-fond-clair.png');
    expect(img?.getAttribute('alt')).toBe('');
    expect(img?.className).toContain('h-10');
    expect(container.querySelector('picture')?.dataset.testid).toBe('oz-logo');
  });
});
