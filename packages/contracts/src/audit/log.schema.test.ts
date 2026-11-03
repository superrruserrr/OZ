import { describe, expect, it } from 'vitest';
import {
  auditCheckSchema,
  auditIntegritySchema,
  auditLogPageSchema,
  auditLogQuerySchema,
} from './log.schema.js';

// Journal d'audit (lot 1.16a) : requête bornée et stricte, page et intégrité sans champ inattendu.

const UUID = '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192';
const entry = {
  id: UUID,
  position: 42,
  actorUserId: null,
  action: 'document.read.granted',
  targetType: 'document',
  targetId: UUID,
  reason: 'Lecture accordée',
  requestId: 'req-1',
  metadata: '{"document_type":"photo"}',
  createdAt: '2026-11-07T10:00:00.000Z',
  hash: 'ab'.repeat(32),
};

describe('auditLogQuerySchema', () => {
  it('page de 50 par défaut ; nombres et filtres lus depuis la chaîne de requête', () => {
    expect(auditLogQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      auditLogQuerySchema.parse({
        limit: '10',
        cursor: 'MTI',
        action: 'kyc.case.transitioned',
        targetType: 'kyc_case',
        targetId: UUID,
        actorUserId: UUID,
        from: '2026-11-01T00:00:00Z',
        to: '2026-11-08T00:00:00+01:00',
      }),
    ).toMatchObject({ limit: 10, cursor: 'MTI' });
  });

  it.each([
    { limit: '0' },
    { limit: '101' },
    { limit: '1.5' },
    { cursor: '../x' },
    { cursor: 'a'.repeat(33) },
    { action: 'DROP TABLE' },
    { action: 'kyc.case' },
    { targetType: 'Kyc-Case' },
    { targetId: 'x' },
    { actorUserId: 'x' },
    { from: 'hier' },
    { from: '2026-11-08T00:00:00Z', to: '2026-11-01T00:00:00Z' },
    { offset: '10' },
  ])('refuse %j', (query) => {
    expect(auditLogQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('auditLogPageSchema', () => {
  it('entrées et curseur suivant ; aucun champ inattendu', () => {
    expect(auditLogPageSchema.parse({ entries: [entry], nextCursor: null })).toEqual({
      entries: [entry],
      nextCursor: null,
    });
    expect(
      auditLogPageSchema.safeParse({ entries: [{ ...entry, prevHash: 'x' }], nextCursor: null })
        .success,
    ).toBe(false);
    expect(
      auditLogPageSchema.safeParse({ entries: [{ ...entry, hash: 'x' }], nextCursor: null })
        .success,
    ).toBe(false);
  });
});

describe('auditIntegritySchema', () => {
  const check = {
    checkedAt: '2026-11-07T10:00:00.000Z',
    headPosition: 42,
    anchorPosition: 40,
    isIntact: true,
    defectPosition: null,
  };

  it('intègre, en défaut, ou jamais vérifiée', () => {
    expect(auditIntegritySchema.parse({ lastCheck: check })).toEqual({ lastCheck: check });
    expect(auditCheckSchema.parse({ ...check, isIntact: false, defectPosition: 7 })).toMatchObject({
      defectPosition: 7,
    });
    expect(auditIntegritySchema.parse({ lastCheck: null })).toEqual({ lastCheck: null });
    expect(auditIntegritySchema.safeParse(null).success).toBe(false);
    expect(auditIntegritySchema.safeParse({ lastCheck: null, extra: 1 }).success).toBe(false);
  });

  it('refuse un état incohérent', () => {
    expect(auditCheckSchema.safeParse({ ...check, defectPosition: 7 }).success).toBe(false);
    expect(auditCheckSchema.safeParse({ ...check, isIntact: false }).success).toBe(false);
  });
});
