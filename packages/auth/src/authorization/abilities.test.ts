import { describe, expect, it } from 'vitest';
import {
  abilityFor,
  authorizationReason,
  organizationSubject,
  playerSubject,
  type Actor,
  type PlayerRecord,
} from './abilities.js';
import { RBAC_ACTIONS, RBAC_ROLES } from './actions.js';

const NOW = new Date('2026-11-02T12:00:00Z');

const record = (overrides: Partial<PlayerRecord> = {}): PlayerRecord => ({
  userId: 'joueur',
  birthDate: new Date('2012-01-01'),
  verificationStatus: 'verified',
  guardianUserId: 'tuteur',
  organizationId: 'org',
  testedByOrganizationIds: [],
  hasPublicationConsent: true,
  ...overrides,
});
const adult = (overrides: Partial<PlayerRecord> = {}): object =>
  playerSubject(record({ birthDate: new Date('2000-01-01'), ...overrides }), NOW);
const minor = playerSubject(record(), NOW);

const actor = (
  role: (typeof RBAC_ROLES)[number],
  organizationId: string | null = 'org',
  isKyc3Verified = false,
): Actor => ({ userId: 'compte', roles: [{ role, organizationId }], isKyc3Verified });

describe('abilityFor', () => {
  it('acteur sans rôle : tout est refusé', () => {
    const ability = abilityFor({ userId: 'compte', roles: [], isKyc3Verified: true });
    expect(ability.rules).toEqual([]);
    for (const action of RBAC_ACTIONS) {
      expect(ability.can(action, minor)).toBe(false);
    }
  });

  it('plusieurs rôles : droits cumulés, chacun borné à ses organisations', () => {
    const ability = abilityFor({
      userId: 'compte',
      roles: [
        { role: 'academy', organizationId: 'a' },
        { role: 'academy', organizationId: 'b' },
        { role: 'guardian', organizationId: null },
      ],
      isKyc3Verified: false,
    });
    expect(ability.can('player.create', organizationSubject('a'))).toBe(true);
    expect(ability.can('player.create', organizationSubject('b'))).toBe(true);
    expect(ability.can('player.create', organizationSubject('c'))).toBe(false);
    expect(
      ability.can('profile.read', playerSubject(record({ guardianUserId: 'compte' }), NOW)),
    ).toBe(true);
  });

  it('rôle sans organisation : aucune portée `org`', () => {
    const ability = abilityFor(actor('club', null));
    expect(ability.can('player.create', organizationSubject('org'))).toBe(false);
    expect(ability.can('profile.update', adult({ organizationId: null }), 'city')).toBe(false);
  });

  it('un même droit ne s’étend pas à une autre organisation', () => {
    const ability = abilityFor(actor('academy', 'org'));
    expect(ability.can('profile.update', adult({ organizationId: 'org' }), 'city')).toBe(true);
    expect(ability.can('profile.update', adult({ organizationId: 'autre' }), 'city')).toBe(false);
  });

  it('académie et club : champs déclaratifs seulement', () => {
    for (const role of ['academy', 'club'] as const) {
      const ability = abilityFor(actor(role));
      expect(ability.can('profile.update', adult(), 'heightCm')).toBe(true);
      expect(ability.can('profile.update', adult(), 'firstName')).toBe(false);
    }
  });

  it('CP-07 : aucun rôle ne modifie rôle, KYC, statut ni rattachements, pas même sur son profil', () => {
    const closed = [
      'role',
      'kycLevel',
      'status',
      'verificationStatus',
      'ozId',
      'birthDate',
      'userId',
      'guardianId',
      'organizationId',
      'visibility',
      'phoneEncrypted',
      'documentNumberEncrypted',
    ];
    const own = adult({ userId: 'compte', organizationId: 'org' });
    const child = playerSubject(record({ guardianUserId: 'compte' }), NOW);
    for (const role of RBAC_ROLES) {
      const ability = abilityFor(actor(role));
      for (const field of closed) {
        expect(ability.can('profile.update', own, field)).toBe(false);
        expect(ability.can('profile.update', child, field)).toBe(false);
      }
    }
  });

  it('la tutelle s’arrête à la majorité de l’enfant', () => {
    const ability = abilityFor(actor('guardian', null));
    const former = adult({ guardianUserId: 'compte' });
    for (const action of ['profile.read', 'audit.read'] as const) {
      expect(ability.can(action, former)).toBe(false);
    }
    expect(ability.can('profile.update', former, 'city')).toBe(false);
  });

  it('EX-T16 n° 5 : `audit` l’emporte quel que soit l’ordre des rôles', () => {
    const roles = [
      { role: 'recruiter', organizationId: 'o' },
      { role: 'club', organizationId: 'o' },
    ] as const;
    for (const entries of [roles, [...roles].reverse()]) {
      const ability = abilityFor({ userId: 'compte', roles: entries, isKyc3Verified: true });
      expect(authorizationReason(ability, 'player.read_minor', minor)).toBe('audit');
    }
  });

  it('`limited` seulement si aucune règle ne donne l’accès entier', () => {
    const roles = [
      { role: 'academy', organizationId: 'a' },
      { role: 'club', organizationId: 'c' },
    ] as const;
    for (const entries of [roles, [...roles].reverse()]) {
      const ability = abilityFor({ userId: 'compte', roles: entries, isKyc3Verified: false });
      expect(authorizationReason(ability, 'player.read_minor', minor)).toBeUndefined();
    }
  });

  it('la raison se lit champ par champ', () => {
    const ability = abilityFor({
      userId: 'compte',
      roles: [
        { role: 'admin', organizationId: null },
        { role: 'club', organizationId: 'org' },
      ],
      isKyc3Verified: false,
    });
    expect(authorizationReason(ability, 'profile.update', adult(), 'firstName')).toBe('audit');
  });

  it('sans règle applicable : aucune raison', () => {
    expect(
      authorizationReason(abilityFor(actor('player')), 'kyc.decide', 'KycCase'),
    ).toBeUndefined();
  });

  it('CP-12 : recruteur sans KYC 3, aucun mineur ; avec, journalisé ; coordonnées jamais', () => {
    const without = abilityFor(actor('recruiter'));
    expect(without.can('player.read_minor', minor)).toBe(false);
    const verified = abilityFor(actor('recruiter', 'org', true));
    expect(verified.can('player.read_minor', minor)).toBe(true);
    expect(authorizationReason(verified, 'player.read_minor', minor)).toBe('audit');
    expect(verified.can('player.read_minor_contact', minor)).toBe(false);
  });

  it('recruteur sans KYC 3 : aucun droit, sauf déposer le justificatif de son organisation (D5 du lot 1.9a)', () => {
    const rules = abilityFor(actor('recruiter')).rules;
    expect(rules.map((rule) => rule.action)).toEqual(['document.upload']);
    expect(rules[0]?.conditions).toMatchObject({
      kind: 'organization',
      documentType: { $in: ['organization_registration'] },
    });
  });

  it('EX-T16 n° 3 : mineur non vérifié ou sans consentement fermé aux tiers', () => {
    const closed = [
      playerSubject(record({ verificationStatus: 'declared', organizationId: 'autre' }), NOW),
      playerSubject(record({ hasPublicationConsent: false, organizationId: 'autre' }), NOW),
    ];
    const roles = ['academy', 'club', 'federation', 'recruiter'] as const;
    for (const role of roles) {
      const ability = abilityFor(actor(role, 'org', true));
      for (const target of closed) expect(ability.can('player.read_minor', target)).toBe(false);
    }
    const center = abilityFor(actor('center'));
    const tested = playerSubject(
      record({ hasPublicationConsent: false, testedByOrganizationIds: ['org'] }),
      NOW,
    );
    expect(center.can('player.read_minor', tested)).toBe(false);
  });

  it('EX-T16 n° 3 : l’organisation de rattachement, le tuteur et l’admin le voient encore', () => {
    const attached = playerSubject(
      record({ hasPublicationConsent: false, guardianUserId: 'compte' }),
      NOW,
    );
    for (const role of ['academy', 'club', 'guardian', 'admin'] as const) {
      expect(abilityFor(actor(role)).can('player.read_minor', attached)).toBe(true);
    }
  });

  it('CP-11 : un majeur ne relève pas des droits sur mineur', () => {
    const admin = abilityFor(actor('admin', null));
    expect(admin.can('player.read_minor_contact', adult())).toBe(false);
    const guardian = abilityFor(actor('guardian', null));
    expect(guardian.can('player.read_minor_contact', adult({ guardianUserId: 'compte' }))).toBe(
      false,
    );
  });

  it('profil public : ni mineur ni non vérifié', () => {
    for (const role of RBAC_ROLES) {
      const ability = abilityFor(actor(role));
      expect(ability.can('player.read_public', minor)).toBe(false);
      expect(ability.can('player.read_public', adult({ verificationStatus: 'pending' }))).toBe(
        false,
      );
    }
  });

  it('la minorité suit la date de la requête, pas le sujet d’hier', () => {
    const player = record({ birthDate: new Date('2008-11-02') });
    const ability = abilityFor(actor('recruiter', 'org', true));
    expect(ability.can('player.read_public', playerSubject(player, new Date('2026-11-01')))).toBe(
      false,
    );
    expect(ability.can('player.read_public', playerSubject(player, new Date('2026-11-02')))).toBe(
      true,
    );
  });

  it('D5 : la fédération consulte un dossier KYC sans le décider', () => {
    const ability = abilityFor(actor('federation'));
    expect(ability.can('kyc.read', 'KycCase')).toBe(true);
    expect(ability.can('kyc.decide', 'KycCase')).toBe(false);
  });
});
