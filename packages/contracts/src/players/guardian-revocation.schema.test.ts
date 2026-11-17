import { describe, expect, it } from 'vitest';
import {
  GUARDIAN_LINK_REVOCATION_REASONS,
  guardianLinkRevocationSchema,
} from './guardian.schema.js';

const valid = { reason: 'approved_in_error', password: 'correct horse battery staple' };

describe('retrait d’un lien approuvé (C6)', () => {
  it('accepte chaque motif de la liste fermée, avec ou sans code', () => {
    for (const reason of GUARDIAN_LINK_REVOCATION_REASONS) {
      expect(guardianLinkRevocationSchema.safeParse({ ...valid, reason }).success).toBe(true);
    }
    expect(guardianLinkRevocationSchema.safeParse({ ...valid, code: '123456' }).success).toBe(true);
  });

  it('motif absent, hors liste, ou texte libre ajouté : refusé', () => {
    expect(guardianLinkRevocationSchema.safeParse({ password: valid.password }).success).toBe(
      false,
    );
    expect(guardianLinkRevocationSchema.safeParse({ ...valid, reason: 'erreur' }).success).toBe(
      false,
    );
    expect(guardianLinkRevocationSchema.safeParse({ ...valid, note: 'Mme Dupont' }).success).toBe(
      false,
    );
  });

  it('mot de passe exigé', () => {
    expect(guardianLinkRevocationSchema.safeParse({ reason: valid.reason }).success).toBe(false);
  });
});
