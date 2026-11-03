import { describe, expect, it } from 'vitest';
import { abilityFor, playerSubject, type Actor, type PlayerRecord } from './abilities.js';
import type { RbacRole } from './actions.js';
import {
  PLAYER_BLOCK_FIELDS,
  PLAYER_VIEWS,
  playerViewFor,
  presentPlayer,
  serializeView,
  type PlayerViewData,
} from './views.js';

const NOW = new Date('2026-11-02T12:00:00Z');

const record = (overrides: Partial<PlayerRecord> = {}): PlayerRecord => ({
  userId: 'titulaire',
  birthDate: new Date('2000-01-01'),
  verificationStatus: 'verified',
  guardianUserId: null,
  organizationId: null,
  testedByOrganizationIds: [],
  hasPublicationConsent: false,
  ...overrides,
});
const child = (overrides: Partial<PlayerRecord> = {}): PlayerRecord =>
  record({
    userId: null,
    birthDate: new Date('2014-05-06'),
    guardianUserId: 'tuteur',
    organizationId: 'club-a',
    hasPublicationConsent: true,
    ...overrides,
  });

const actor = (
  userId: string,
  role: RbacRole,
  organizationId: string | null = null,
  isKyc3Verified = false,
): Actor => ({ userId, roles: [{ role, organizationId }], isKyc3Verified });

const viewOf = (who: Actor, target: PlayerRecord) =>
  playerViewFor(who, abilityFor(who), playerSubject(target, NOW))?.name ?? null;

const DATA: PlayerViewData = {
  id: 'p1',
  ozId: 'OZ-CM-14-ABCDEF-7',
  firstName: 'Awa',
  lastName: 'Synthétique',
  birthDate: '2014-05-06',
  birthYear: 2014,
  nationality: 'CM',
  country: 'CM',
  region: 'Littoral',
  city: 'Douala',
  primaryPosition: 'winger',
  secondaryPosition: null,
  dominantFoot: 'left',
  heightCm: 150,
  weightKg: 40,
  verificationStatus: 'verified',
  organizationId: 'club-a',
  phone: '+237650000001',
};

describe('vues de joueur', () => {
  it('chaque vue est une liste figée, sans colonne chiffrée ni empreinte', () => {
    for (const view of Object.values(PLAYER_VIEWS)) {
      expect(Object.isFrozen(view)).toBe(true);
      expect(Object.isFrozen(view.fields)).toBe(true);
      for (const field of view.fields) {
        expect(field).not.toMatch(/encrypted|hmac|password|totp/i);
      }
    }
  });

  it('seules les vues titulaire, tuteur et admin portent le téléphone ; aucun tiers ne reçoit la date de naissance', () => {
    const withPhone = Object.values(PLAYER_VIEWS)
      .filter((view) => view.fields.includes('phone'))
      .map((view) => view.name);
    expect(withPhone.sort()).toEqual(['PlayerAdminView', 'PlayerGuardianView', 'PlayerSelfView']);
    expect(PLAYER_VIEWS.PlayerPublicView.fields).not.toContain('birthDate');
    expect(PLAYER_VIEWS.PlayerPublicView.fields).toContain('birthYear');
  });

  it('serializeView ne copie que les champs de la vue ; un champ absent reste absent', () => {
    const extra = { ...DATA, phoneEncrypted: 'secret', passwordHash: 'x' } as PlayerViewData;
    const out = serializeView(PLAYER_VIEWS.PlayerPublicView, extra);
    expect(Object.keys(out).sort()).toEqual(
      PLAYER_VIEWS.PlayerPublicView.fields.filter((field) => field in DATA).sort(),
    );
    expect(out).not.toHaveProperty('phone');
    expect(out).not.toHaveProperty('phoneEncrypted');
    expect(serializeView(PLAYER_VIEWS.PlayerPublicView, { id: 'p1' })).toEqual({ id: 'p1' });
  });

  it('serializeView ignore les champs hérités du prototype', () => {
    const data = Object.create({ phone: '+237650000001' }) as PlayerViewData;
    expect(serializeView(PLAYER_VIEWS.PlayerSelfView, data)).toEqual({});
  });
});

describe('playerViewFor', () => {
  it('titulaire majeur : sa vue, téléphone compris', () => {
    const view = playerViewFor(
      actor('titulaire', 'player'),
      abilityFor(actor('titulaire', 'player')),
      playerSubject(record(), NOW),
    );
    expect(view?.name).toBe('PlayerSelfView');
    expect(view?.fields).toContain('phone');
  });

  it('titulaire mineur : sa vue, sans téléphone (CP-11)', () => {
    const who = actor('titulaire', 'player');
    const view = playerViewFor(
      who,
      abilityFor(who),
      playerSubject(record({ birthDate: new Date('2012-01-01') }), NOW),
    );
    expect(view?.name).toBe('PlayerSelfView');
    expect(view?.fields).not.toContain('phone');
  });

  it('tuteur vérifié de l’enfant : vue tuteur, téléphone compris ; ancien enfant majeur : vue publique', () => {
    const who = actor('tuteur', 'guardian');
    const view = playerViewFor(who, abilityFor(who), playerSubject(child(), NOW));
    expect(view?.name).toBe('PlayerGuardianView');
    expect(view?.fields).toContain('phone');
    expect(viewOf(who, child({ birthDate: new Date('2000-01-01') }))).toBe('PlayerPublicView');
  });

  it('académie ou club de rattachement : vue organisation, sans téléphone', () => {
    for (const role of ['academy', 'club'] as const) {
      const who = actor('membre', role, 'club-a');
      const view = playerViewFor(
        who,
        abilityFor(who),
        playerSubject(child({ hasPublicationConsent: false }), NOW),
      );
      expect(view?.name, role).toBe('PlayerOrganizationView');
      expect(view?.fields, role).not.toContain('phone');
    }
  });

  it('tiers vérifié : vue publique pour un majeur vérifié et un mineur publié', () => {
    for (const role of ['federation', 'club', 'academy'] as const) {
      const who = actor('tiers', role, 'autre');
      expect(viewOf(who, record()), role).toBe('PlayerPublicView');
      expect(viewOf(who, child()), role).toBe('PlayerPublicView');
      expect(viewOf(who, child({ hasPublicationConsent: false })), role).toBeNull();
    }
  });

  it('administrateur : vue admin ; téléphone d’un mineur compris (journalisé, D-087)', () => {
    const who = actor('admin', 'admin');
    const view = playerViewFor(who, abilityFor(who), playerSubject(child(), NOW));
    expect(view?.name).toBe('PlayerAdminView');
    expect(view?.fields).toContain('phone');
  });

  it('recruteur ou agence sans KYC 3 : aucune vue, même d’un majeur (CP-12)', () => {
    for (const org of ['recruteur', 'agence']) {
      const who = actor('r', 'recruiter', org);
      expect(viewOf(who, record())).toBeNull();
      expect(viewOf(who, child())).toBeNull();
    }
  });

  it('recruteur KYC 3 : vue publique d’un mineur publié, jamais son téléphone', () => {
    const who = actor('r', 'recruiter', 'recruteur', true);
    const view = playerViewFor(who, abilityFor(who), playerSubject(child(), NOW));
    expect(view?.name).toBe('PlayerPublicView');
    expect(view?.fields).not.toContain('phone');
  });

  it('aucune lecture permise : null, jamais une vue vide', () => {
    const who: Actor = { userId: 'x', roles: [], isKyc3Verified: false };
    expect(viewOf(who, record())).toBeNull();
  });

  it('un rôle porteur de profile.read sans être admin ne reçoit pas la vue admin', () => {
    // Joueur qui lit le profil public d'un autre : profile.read ne vaut que pour lui-même.
    const who = actor('autre', 'player');
    expect(viewOf(who, record())).toBe('PlayerPublicView');
  });
});

describe('presentPlayer', () => {
  it('sérialise par la vue choisie, ou rend null', () => {
    const who = actor('tiers', 'federation', 'f');
    const out = presentPlayer(who, abilityFor(who), playerSubject(child(), NOW), DATA);
    expect(out).not.toBeNull();
    expect(out).not.toHaveProperty('phone');
    expect(out).not.toHaveProperty('birthDate');
    expect(out?.birthYear).toBe(2014);
    const nobody: Actor = { userId: 'x', roles: [], isKyc3Verified: false };
    expect(presentPlayer(nobody, abilityFor(nobody), playerSubject(child(), NOW), DATA)).toBeNull();
  });
});

describe('blocs masqués et badge (lot 1.13a)', () => {
  const hidden = { location: false, physical: false, sport: false } as const;

  it('tiers : champs des blocs masqués absents ; identité et badge conservés', () => {
    const who = actor('lecteur', 'club', 'club-b');
    const out = presentPlayer(
      who,
      abilityFor(who),
      playerSubject(record(), NOW),
      { ...DATA, verificationLevel: 2 },
      hidden,
    );
    expect(out).not.toBeNull();
    for (const field of Object.values(PLAYER_BLOCK_FIELDS).flat()) {
      expect(out).not.toHaveProperty(field);
    }
    expect(out).toMatchObject({ ozId: DATA.ozId, firstName: 'Awa', verificationLevel: 2 });
  });

  it('un seul bloc masqué ; `true` ou absent : visible', () => {
    const who = actor('lecteur', 'club', 'club-b');
    const out = presentPlayer(who, abilityFor(who), playerSubject(record(), NOW), DATA, {
      physical: false,
      sport: true,
    });
    expect(out).not.toHaveProperty('heightCm');
    expect(out).toMatchObject({ city: 'Douala', primaryPosition: 'winger' });
  });

  it('titulaire, tuteur, organisation de rattachement et admin : réglages sans effet', () => {
    const cases: [Actor, PlayerRecord][] = [
      [actor('titulaire', 'player'), record()],
      [actor('tuteur', 'guardian'), child()],
      [actor('membre', 'club', 'club-a'), child({ hasPublicationConsent: false })],
      [actor('admin', 'admin'), record()],
    ];
    for (const [who, target] of cases) {
      const out = presentPlayer(who, abilityFor(who), playerSubject(target, NOW), DATA, hidden);
      expect(out, who.roles[0]?.role).toMatchObject({ heightCm: 150, city: 'Douala' });
    }
  });

  it('le badge figure dans toutes les vues', () => {
    for (const view of Object.values(PLAYER_VIEWS)) {
      expect(view.fields, view.name).toContain('verificationLevel');
    }
  });
});
