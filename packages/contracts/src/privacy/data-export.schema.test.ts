import { describe, expect, it } from 'vitest';
import {
  dataExportDownloadOutputSchema,
  dataExportJobSchema,
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

describe('archive (lot 1.16bb)', () => {
  it('URL signée et échéance, rien d’autre', () => {
    const out = {
      url: 'https://s3.example.test/b/exports/x.json?X-Amz-Signature=a',
      expiresAt: '2026-11-03T10:05:00.000Z',
    };
    expect(dataExportDownloadOutputSchema.parse(out)).toEqual(out);
    expect(dataExportDownloadOutputSchema.safeParse({ ...out, key: 'exports/x' }).success).toBe(
      false,
    );
    expect(
      dataExportDownloadOutputSchema.safeParse({ ...out, url: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('message de file : identifiant de demande seul', () => {
    const requestId = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
    expect(dataExportJobSchema.parse({ requestId })).toEqual({ requestId });
    expect(dataExportJobSchema.safeParse({ requestId: 'x' }).success).toBe(false);
    expect(dataExportJobSchema.safeParse({ requestId, userId: requestId }).success).toBe(false);
  });
});
