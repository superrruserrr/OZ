import fc from 'fast-check';
import { describe, it } from 'vitest';
import {
  abilityFor,
  playerSubject,
  type Actor,
  type ActorRole,
  type PlayerRecord,
} from './abilities.js';
import { RBAC_ROLES, type RbacRole } from './actions.js';
import { isMinor } from './minor.js';
import { playerViewFor, presentPlayer, type PlayerViewData } from './views.js';

// Inspection des payloads (lot 1.4b) : CP-10, CP-11 et CP-12 pour tout acteur et tout joueur.

const NOW = new Date('2026-11-02T12:00:00Z');
const USERS = ['u1', 'u2', 'u3'] as const;
const ORGS = ['o1', 'o2'] as const;
const PERSONAL: readonly RbacRole[] = ['player', 'guardian', 'admin'];

const role: fc.Arbitrary<ActorRole> = fc
  .constantFrom(...RBAC_ROLES)
  .chain((name): fc.Arbitrary<ActorRole> =>
    PERSONAL.includes(name)
      ? fc.constant({ role: name, organizationId: null })
      : fc.constantFrom(...ORGS).map((organizationId) => ({ role: name, organizationId })),
  );

const actor: fc.Arbitrary<Actor> = fc.record({
  userId: fc.constantFrom(...USERS),
  roles: fc.array(role, { maxLength: 3 }),
  isKyc3Verified: fc.boolean(),
});

const record: fc.Arbitrary<PlayerRecord> = fc.record({
  userId: fc.constantFrom(null, ...USERS),
  birthDate: fc.date({
    min: new Date('1990-01-01'),
    max: new Date('2020-12-31'),
    noInvalidDate: true,
  }),
  verificationStatus: fc.constantFrom('declared', 'pending', 'verified', 'suspended'),
  guardianUserId: fc.constantFrom(null, ...USERS),
  organizationId: fc.constantFrom(null, ...ORGS),
  testedByOrganizationIds: fc.subarray([...ORGS]),
  hasPublicationConsent: fc.boolean(),
  deletionPending: fc.boolean(),
});

/** Donnée complète, colonnes internes comprises : rien de ce qui n'est pas dans la vue ne doit sortir. */
const DATA = {
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
  organizationId: 'o1',
  phone: '+237650000001',
  phoneEncrypted: 'chiffré',
  phoneHmac: 'empreinte',
  documentNumberEncrypted: 'chiffré',
  guardianId: 'g1',
  visibility: {},
} as PlayerViewData;

const has = (who: Actor, name: RbacRole): boolean => who.roles.some((entry) => entry.role === name);

const attached = (who: Actor, organizationId: string | null): boolean =>
  who.roles.some(
    (entry) =>
      (entry.role === 'academy' || entry.role === 'club') &&
      entry.organizationId !== null &&
      entry.organizationId === organizationId,
  );

describe('inspection des payloads', () => {
  it('CP-10 : aucun champ hors de la vue choisie ; aucune colonne interne', () => {
    fc.assert(
      fc.property(actor, record, (who, target) => {
        const ability = abilityFor(who);
        const subject = playerSubject(target, NOW);
        const view = playerViewFor(who, ability, subject);
        const out = presentPlayer(who, ability, subject, DATA);
        if (view === null) return out === null;
        const keys = Object.keys(out ?? {});
        return (
          keys.every((key) => view.fields.includes(key as never)) &&
          !keys.some((key) => /encrypted|hmac|guardianId|visibility/i.test(key))
        );
      }),
      { numRuns: 2_000 },
    );
  });

  it('CP-11 : le téléphone d’un mineur ne sort que pour son tuteur vérifié ou l’admin', () => {
    fc.assert(
      fc.property(actor, record, (who, target) => {
        const out = presentPlayer(who, abilityFor(who), playerSubject(target, NOW), DATA);
        if (out === null || !('phone' in out) || !isMinor(target.birthDate, NOW)) return true;
        const guardian = has(who, 'guardian') && target.guardianUserId === who.userId;
        return guardian || has(who, 'admin');
      }),
      { numRuns: 2_000 },
    );
  });

  it('CP-10 : la vue choisie correspond à la relation réelle du lecteur avec le joueur', () => {
    fc.assert(
      fc.property(actor, record, (who, target) => {
        const view = playerViewFor(who, abilityFor(who), playerSubject(target, NOW));
        const minor = isMinor(target.birthDate, NOW);
        switch (view?.name) {
          case 'PlayerSelfView':
            return target.userId === who.userId && has(who, 'player');
          case 'PlayerGuardianView':
            return minor && target.guardianUserId === who.userId && has(who, 'guardian');
          case 'PlayerAdminView':
            return has(who, 'admin');
          case 'PlayerOrganizationView':
            return minor && attached(who, target.organizationId);
          default:
            return true;
        }
      }),
      { numRuns: 3_000 },
    );
  });

  it('CP-11 : la date de naissance complète ne sort que pour le titulaire, le tuteur, l’admin ou l’organisation de rattachement', () => {
    fc.assert(
      fc.property(actor, record, (who, target) => {
        const out = presentPlayer(who, abilityFor(who), playerSubject(target, NOW), DATA);
        if (out === null || !('birthDate' in out)) return true;
        const minor = isMinor(target.birthDate, NOW);
        return (
          target.userId === who.userId ||
          (minor && target.guardianUserId === who.userId) ||
          has(who, 'admin') ||
          (minor && attached(who, target.organizationId))
        );
      }),
      { numRuns: 3_000 },
    );
  });

  it('CP-12 : recruteur ou agence sans KYC 3 : aucune vue, aucun profil', () => {
    const recruiter = fc.record({
      userId: fc.constantFrom(...USERS),
      roles: fc.array(
        fc.constantFrom(...ORGS).map((organizationId) => ({
          role: 'recruiter' as const,
          organizationId,
        })),
        { minLength: 1, maxLength: 2 },
      ),
      isKyc3Verified: fc.constant(false),
    });
    fc.assert(
      fc.property(
        recruiter,
        record,
        (who, target) =>
          presentPlayer(who, abilityFor(who), playerSubject(target, NOW), DATA) === null,
      ),
      { numRuns: 1_000 },
    );
  });

  it('CP-12 : un recruteur KYC 3 ne reçoit jamais le téléphone d’un mineur', () => {
    const recruiter = fc.record({
      userId: fc.constantFrom(...USERS),
      roles: fc
        .constantFrom(...ORGS)
        .map((organizationId) => [{ role: 'recruiter' as const, organizationId }]),
      isKyc3Verified: fc.constant(true),
    });
    fc.assert(
      fc.property(recruiter, record, (who, target) => {
        const out = presentPlayer(who, abilityFor(who), playerSubject(target, NOW), DATA);
        return out === null || !isMinor(target.birthDate, NOW) || !('phone' in out);
      }),
      { numRuns: 1_000 },
    );
  });
});
