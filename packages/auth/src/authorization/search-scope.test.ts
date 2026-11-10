import { describe, expect, it } from 'vitest';
import { abilityFor, type Actor } from './abilities.js';
import type { RbacRole } from './actions.js';
import { refusedSearchCriteria, searchScopeFor } from './search-scope.js';

// Portée de recherche (lot 1.14a, rbac `player.search`, D1) : complète, réduite ou aucune.

const ORG = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const actor = (roles: RbacRole[], isKyc3Verified = false): Actor => ({
  userId: 'u',
  roles: roles.map((role) => ({
    role,
    organizationId: ['player', 'guardian', 'admin'].includes(role) ? null : ORG,
  })),
  isKyc3Verified,
});
const scope = (roles: RbacRole[], kyc3 = false) => {
  const who = actor(roles, kyc3);
  return searchScopeFor(who, abilityFor(who));
};

describe('searchScopeFor', () => {
  it('aucune portée : joueur, tuteur, centre, recruteur et agence sans KYC 3, sans rôle', () => {
    for (const roles of [['player'], ['guardian'], ['center'], ['recruiter'], []] as RbacRole[][]) {
      expect(scope(roles), roles.join() || 'aucun').toBeNull();
    }
  });

  it('réduite pour l’académie ; complète pour club, fédération, admin, recruteur KYC 3', () => {
    expect(scope(['academy'])?.kind).toBe('limited');
    for (const roles of [['club'], ['federation'], ['admin']] as RbacRole[][]) {
      expect(scope(roles)?.kind, roles.join()).toBe('full');
    }
    expect(scope(['recruiter'], true)?.kind).toBe('full');
  });

  it('cumul de rôles : la portée la plus large l’emporte', () => {
    expect(scope(['academy', 'club'])?.kind).toBe('full');
  });

  it('portée réduite : les organisations de l’académie', () => {
    expect(scope(['academy'])).toEqual({ kind: 'limited', organizationIds: [ORG] });
    expect(scope(['admin'])).toEqual({ kind: 'full', organizationIds: null });
  });
});

describe('refusedSearchCriteria', () => {
  const limited = scope(['academy']);
  const full = scope(['club']);
  if (limited === null || full === null) throw new Error('portées attendues');

  it('portée réduite : taille, poids, pied, organisation tierce refusés', () => {
    expect(
      refusedSearchCriteria(limited, {
        heightMin: 170,
        weightMax: 80,
        foot: 'left',
        organizationId: OTHER,
        country: 'CM',
        ageMin: 16,
        position: 'striker',
        q: 'awa',
      }),
    ).toEqual(['heightMin', 'weightMax', 'foot', 'organizationId']);
  });

  it('portée réduite : sa propre organisation permise', () => {
    expect(refusedSearchCriteria(limited, { organizationId: ORG })).toEqual([]);
  });

  it('portée complète : critères physiques permis, organisation tierce refusée', () => {
    expect(
      refusedSearchCriteria(full, { heightMin: 170, foot: 'both', organizationId: ORG }),
    ).toEqual([]);
    expect(refusedSearchCriteria(full, { organizationId: OTHER })).toEqual(['organizationId']);
  });

  it('administrateur : toute organisation', () => {
    const admin = scope(['admin']);
    if (admin === null) throw new Error('portée attendue');
    expect(refusedSearchCriteria(admin, { organizationId: OTHER })).toEqual([]);
  });
});
