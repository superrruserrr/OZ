import { describe, expect, it } from 'vitest';
import { ANONYMIZATION_REGISTRY } from '../anonymize/registry.js';
import { ERASURE_REGISTRY, erasedColumns } from './registry.js';

// Registre d'effacement (lot 1.16ca, tâche 1, EX-118 n° 3).

const names = (registry: Readonly<Record<string, Readonly<Record<string, unknown>>>>) =>
  Object.entries(registry)
    .flatMap(([table, cols]) => Object.keys(cols).map((column) => `${table}.${column}`))
    .sort();

describe('registre d’effacement', () => {
  it('mêmes tables et colonnes que le registre d’anonymisation', () => {
    const erasure = Object.fromEntries(
      Object.entries(ERASURE_REGISTRY).map(([table, { columns }]) => [table, columns]),
    );
    expect(names(erasure)).toEqual(names(ANONYMIZATION_REGISTRY));
  });

  it('chaque table dit quelles lignes du compte elle touche', () => {
    for (const [table, { scope }] of Object.entries(ERASURE_REGISTRY)) {
      expect(scope.trim().length, table).toBeGreaterThan(10);
    }
  });

  it('identité, coordonnées, secrets, appareil et textes libres du compte : effacés', () => {
    expect(erasedColumns()).toEqual(
      expect.arrayContaining([
        'users.email',
        'users.password_hash',
        'users.phone_encrypted',
        'users.totp_secret_encrypted',
        'sessions.ip',
        'sessions.user_agent',
        'sessions.device_fingerprint',
        'players.first_name',
        'players.last_name',
        'players.birth_date',
        'players.city',
        'players.phone_encrypted',
        'players.document_number_encrypted',
        'guardians.first_name',
        'guardians.email_encrypted',
        'documents.ocr_extract_encrypted',
        'documents.document_number_encrypted',
        'kyc_cases.checks',
        'kyc_cases.decision_reason',
        'notifications.payload',
      ]),
    );
  });
});
