import { describe, expect, it } from 'vitest';
import { createOrganizationFactory, ORGANIZATION_TYPES } from './organization.js';

describe('createOrganizationFactory', () => {
  it('couvre les six types d’organisation (requirements.md D-K04)', () => {
    expect(ORGANIZATION_TYPES).toEqual([
      'academy',
      'club',
      'federation',
      'center',
      'recruiter',
      'agency',
    ]);
    const types = new Set(
      createOrganizationFactory(1)
        .organizations(60)
        .map((o) => o.type),
    );
    expect([...types].sort()).toEqual([...ORGANIZATION_TYPES].sort());
  });

  it('est déterministe et marque ses contacts comme synthétiques', () => {
    const a = createOrganizationFactory(4).organizations(10);
    expect(a).toEqual(createOrganizationFactory(4).organizations(10));
    for (const org of a) {
      expect(org.contactEmail).toMatch(/@example\.test$/);
      expect(org.registrationNumber).toMatch(/^SYN-/);
    }
  });
});
