import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { OZ_MODES, ozThemes } from './tokens.js';

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

describe.each(OZ_MODES)('contrastes des jetons, mode %s (EX-T22, AA ≥ 4,5)', (mode) => {
  const c = ozThemes[mode];
  const onBackground = [
    'text',
    'text-muted',
    'text-label',
    'primary',
    'legal-text',
    'kyc',
    'danger',
    'admin',
  ] as const;

  const surfaces = ['bg', 'bg-page', 'surface-1', 'surface-2', 'legal-bg', 'tint-green'] as const;
  const fieldSurfaces = ['surface-input', 'surface-ozid'] as const;

  it.each(onBackground)(
    '%s sur le fond, les panneaux, les cartes et les encadrés légaux',
    (name) => {
      for (const surface of surfaces) {
        expect(contrastRatio(c[name], c[surface]), surface).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it.each(onBackground)('%s dans un champ et sur la carte OZ ID', (name) => {
    for (const surface of fieldSurfaces) {
      expect(contrastRatio(c[name], c[surface]), surface).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['primary-from', 'primary-to', 'primary'] as const)('on-primary sur %s', (name) => {
    expect(contrastRatio(c['on-primary'], c[name])).toBeGreaterThanOrEqual(4.5);
  });

  it('pastille de compteur des onglets : bg sur danger (lot 1.5ba)', () => {
    expect(contrastRatio(c.bg, c.danger)).toBeGreaterThanOrEqual(4.5);
  });

  it('accent (rose) : grand texte sur le fond nu seulement, ≥ 3', () => {
    for (const surface of ['bg', 'bg-page'] as const) {
      expect(contrastRatio(c.accent, c[surface]), surface).toBeGreaterThanOrEqual(3);
    }
  });

  it('repères non textuels (focus, icône légale) ≥ 3 sur le fond', () => {
    for (const name of ['primary-bright', 'legal'] as const) {
      expect(contrastRatio(c[name], c.bg), name).toBeGreaterThanOrEqual(3);
    }
  });

  it('text-disabled reste sous AA : réservé à l’inactif (dérogation WCAG admise)', () => {
    expect(contrastRatio(c['text-disabled'], c.bg)).toBeLessThan(4.5);
  });
});
