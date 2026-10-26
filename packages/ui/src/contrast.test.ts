import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { ozColors } from './tokens.js';

describe('contrastRatio (WCAG 2.1)', () => {
  it('donne 21 pour noir sur blanc et 1 pour une couleur sur elle-même', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#35D468', '#35D468')).toBeCloseTo(1, 5);
  });

  it('est symétrique', () => {
    expect(contrastRatio('#070707', '#8C8E8B')).toBeCloseTo(
      contrastRatio('#8C8E8B', '#070707'),
      10,
    );
  });

  it('refuse une couleur mal formée', () => {
    expect(() => contrastRatio('#12345', '#000000')).toThrow();
  });
});

describe('contrastes des jetons de texte (EX-T22, AA ≥ 4,5)', () => {
  const onBackground = [
    'text',
    'text-muted',
    'text-label',
    'primary',
    'legal-text',
    'kyc',
    'danger',
    'lime',
    'admin',
  ] as const;

  const surfaces = ['bg', 'bg-page', 'surface-1', 'surface-2', 'legal-bg'] as const;
  const fieldSurfaces = ['surface-input', 'surface-ozid'] as const;

  it.each(onBackground)(
    '%s sur le fond, les panneaux, les cartes et les encadrés légaux',
    (name) => {
      for (const surface of surfaces) {
        expect(contrastRatio(ozColors[name], ozColors[surface]), surface).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );

  it.each(onBackground.filter((name) => name !== 'danger'))(
    '%s dans un champ et sur la carte OZ ID',
    (name) => {
      for (const surface of fieldSurfaces) {
        expect(contrastRatio(ozColors[name], ozColors[surface]), surface).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );

  it('danger reste sous AA dans un champ (4,4) : message d’erreur hors du champ (DEBT D-012)', () => {
    expect(contrastRatio(ozColors.danger, ozColors['surface-input'])).toBeLessThan(4.5);
  });

  it.each(['primary-from', 'primary-to', 'primary'] as const)('on-primary sur %s', (name) => {
    expect(contrastRatio(ozColors['on-primary'], ozColors[name])).toBeGreaterThanOrEqual(4.5);
  });

  it('text-disabled reste sous AA : réservé à l’inactif (dérogation WCAG admise)', () => {
    expect(contrastRatio(ozColors['text-disabled'], ozColors.bg)).toBeLessThan(4.5);
  });
});
