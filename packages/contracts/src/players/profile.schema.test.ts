import { describe, expect, it } from 'vitest';
import {
  playerProfileOutputSchema,
  playerProfileParamsSchema,
  playerVisibilityInputSchema,
  playerVisibilityOutputSchema,
} from './profile.schema.js';

describe('playerProfileParamsSchema', () => {
  it('OZ ID canonique seul', () => {
    expect(playerProfileParamsSchema.parse({ ozId: 'OZ-CM-26-7K4M9Q-M' })).toEqual({
      ozId: 'OZ-CM-26-7K4M9Q-M',
    });
    for (const ozId of ['oz-cm-26-7k4m9q-m', 'OZ-CM-26-7K4M9Q-U', 'OZ-CM-26-7K4M9Q', '']) {
      expect(playerProfileParamsSchema.safeParse({ ozId }).success, ozId).toBe(false);
    }
  });
});

describe('playerProfileOutputSchema', () => {
  it('vue publique : champs facultatifs, badge 0 à 2', () => {
    const view = {
      ozId: 'OZ-CM-26-7K4M9Q-M',
      firstName: 'Awa',
      birthYear: 2001,
      verificationLevel: 2,
    };
    expect(playerProfileOutputSchema.parse(view)).toEqual(view);
    expect(playerProfileOutputSchema.safeParse({ verificationLevel: 3 }).success).toBe(false);
  });

  it('refuse tout champ hors vues (empreinte, chiffré, statut interne)', () => {
    for (const extra of [{ phoneHmac: 'x' }, { phoneEncrypted: 'x' }, { visibility: {} }]) {
      expect(playerProfileOutputSchema.safeParse(extra).success).toBe(false);
    }
  });
});

describe('playerVisibilityInputSchema', () => {
  it('un à trois blocs booléens', () => {
    expect(playerVisibilityInputSchema.parse({ physical: false })).toEqual({ physical: false });
    expect(
      playerVisibilityInputSchema.parse({ location: true, sport: false, physical: true }),
    ).toEqual({ location: true, sport: false, physical: true });
  });

  it('refuse vide, bloc inconnu, valeur non booléenne', () => {
    for (const value of [{}, { phone: false }, { sport: 'non' }, { sport: null }]) {
      expect(playerVisibilityInputSchema.safeParse(value).success, JSON.stringify(value)).toBe(
        false,
      );
    }
  });

  it('réglage rendu : blocs connus seulement', () => {
    expect(playerVisibilityOutputSchema.parse({})).toEqual({});
    expect(playerVisibilityOutputSchema.safeParse({ phone: true }).success).toBe(false);
  });
});
