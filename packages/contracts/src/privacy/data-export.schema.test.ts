import { describe, expect, it } from 'vitest';
import {
  dataExportOutputSchema,
  dataExportRequestInputSchema,
  dataExportStatusOutputSchema,
} from './data-export.schema.js';

// Export des données (lot 1.16ba) : demande stricte, ré-authentifiée ; suivi sans champ inattendu.

describe('dataExportRequestInputSchema', () => {
  it('mot de passe seul, ou avec un code TOTP ou de secours', () => {
    expect(dataExportRequestInputSchema.parse({ password: 'mot-de-passe' })).toEqual({
      password: 'mot-de-passe',
    });
    expect(
      dataExportRequestInputSchema.parse({ password: 'mot-de-passe', code: '123456' }).code,
    ).toBe('123456');
    expect(
      dataExportRequestInputSchema.parse({ password: 'x', code: ' ABCD-EFGH-IJKL-MNOP ' }).code,
    ).toBe('ABCD-EFGH-IJKL-MNOP');
  });

  it.each([
    ['sans mot de passe', {}],
    ['mot de passe vide', { password: '' }],
    ['code mal formé', { password: 'x', code: '12' }],
    ['champ inconnu', { password: 'x', userId: '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192' }],
  ])('refuse : %s', (_name, input) => {
    expect(dataExportRequestInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('dataExportOutputSchema', () => {
  const output = {
    status: 'pending',
    requestedAt: '2026-11-09T10:00:00.000Z',
    readyAt: null,
    expiresAt: null,
    nextRequestAt: '2026-11-10T10:00:00.000Z',
  };

  it('suivi de la dernière demande', () => {
    expect(dataExportOutputSchema.parse(output)).toEqual(output);
  });

  it('refuse un statut inconnu ou un champ inattendu (clé de stockage)', () => {
    expect(dataExportOutputSchema.safeParse({ ...output, status: 'sent' }).success).toBe(false);
    expect(dataExportOutputSchema.safeParse({ ...output, storageKey: 'exports/x' }).success).toBe(
      false,
    );
  });
});

describe('dataExportStatusOutputSchema', () => {
  it('dernière demande ou null, rien d’autre', () => {
    expect(dataExportStatusOutputSchema.parse({ latest: null })).toEqual({ latest: null });
    expect(dataExportStatusOutputSchema.safeParse({}).success).toBe(false);
    expect(dataExportStatusOutputSchema.safeParse({ latest: null, extra: 1 }).success).toBe(false);
  });
});
