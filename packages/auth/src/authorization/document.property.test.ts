import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  abilityFor,
  documentSubject,
  type Actor,
  type ActorRole,
  type DocumentTarget,
} from './abilities.js';
import { RBAC_ROLES, type RbacRole } from './actions.js';
import { isMinor } from './minor.js';

// Dépôt de documents (lot 1.9a, D5) : qui dépose pour qui, pour tout acteur et toute cible.

const NOW = new Date('2026-11-02T12:00:00Z');
const USERS = ['u1', 'u2', 'u3'] as const;
const ORGS = ['o1', 'o2'] as const;
const PERSONAL: readonly RbacRole[] = ['player', 'guardian', 'admin'];
const PERSON_DOCUMENTS = ['birth_certificate', 'identity_document', 'photo', 'license'] as const;
const DOCUMENT_TYPES = [...PERSON_DOCUMENTS, 'organization_registration', 'video'] as const;

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

const target: fc.Arbitrary<DocumentTarget> = fc.oneof(
  fc.record({
    documentType: fc.constantFrom(...DOCUMENT_TYPES),
    kind: fc.constant('player' as const),
    ownerUserId: fc.constantFrom(null, ...USERS),
    guardianUserId: fc.constantFrom(null, ...USERS),
    organizationId: fc.constantFrom(null, ...ORGS),
    birthDate: fc.date({
      min: new Date('1990-01-01'),
      max: new Date('2020-12-31'),
      noInvalidDate: true,
    }),
  }),
  fc.record({
    documentType: fc.constantFrom(...DOCUMENT_TYPES),
    kind: fc.constant('guardian' as const),
    ownerUserId: fc.constantFrom(null, ...USERS),
    guardianUserId: fc.constant(null),
    organizationId: fc.constant(null),
    birthDate: fc.constant(null),
  }),
  fc.record({
    documentType: fc.constantFrom(...DOCUMENT_TYPES),
    kind: fc.constant('organization' as const),
    ownerUserId: fc.constant(null),
    guardianUserId: fc.constant(null),
    organizationId: fc.constantFrom(...ORGS),
    birthDate: fc.constant(null),
  }),
);

const has = (who: Actor, name: RbacRole, organizationId?: string | null) =>
  who.roles.some(
    (entry) =>
      entry.role === name &&
      (organizationId === undefined || entry.organizationId === organizationId),
  );

/** Décision attendue, écrite indépendamment des règles CASL (D5 du lot 1.9a). */
function expected(who: Actor, doc: DocumentTarget): boolean {
  const personDocument = (PERSON_DOCUMENTS as readonly string[]).includes(doc.documentType);
  if (doc.kind === 'organization') {
    return (
      doc.documentType === 'organization_registration' &&
      (['academy', 'club', 'federation', 'center', 'recruiter'] as const).some((name) =>
        has(who, name, doc.organizationId),
      )
    );
  }
  if (!personDocument) return false;
  const own = doc.ownerUserId === who.userId && (has(who, 'player') || has(who, 'guardian'));
  if (doc.kind === 'guardian') return own;
  const minor = doc.birthDate !== null && isMinor(doc.birthDate, NOW);
  const child = has(who, 'guardian') && doc.guardianUserId === who.userId && minor;
  const attached =
    doc.organizationId !== null &&
    (has(who, 'academy', doc.organizationId) || has(who, 'club', doc.organizationId));
  return own || child || attached;
}

describe('document.upload (D5)', () => {
  it('décision CASL = règle écrite à part, pour tout acteur et toute cible', () => {
    fc.assert(
      fc.property(actor, target, (who, doc) => {
        expect(abilityFor(who).can('document.upload', documentSubject(doc, NOW) as never)).toBe(
          expected(who, doc),
        );
      }),
      { numRuns: 2_000 },
    );
  });

  it('jamais de vidéo (D4), jamais pour l’administrateur seul', () => {
    fc.assert(
      fc.property(actor, target, (who, doc) => {
        const ability = abilityFor(who);
        const video = documentSubject({ ...doc, documentType: 'video' }, NOW);
        expect(ability.can('document.upload', video as never)).toBe(false);
        const admin = abilityFor({ ...who, roles: [{ role: 'admin', organizationId: null }] });
        expect(admin.can('document.upload', documentSubject(doc, NOW) as never)).toBe(false);
      }),
    );
  });

  it('la tutelle s’arrête à la majorité de l’enfant', () => {
    const who: Actor = {
      userId: 'u1',
      roles: [{ role: 'guardian', organizationId: null }],
      isKyc3Verified: false,
    };
    const childDocument = (birthDate: Date) =>
      documentSubject(
        {
          documentType: 'identity_document',
          kind: 'player',
          ownerUserId: null,
          guardianUserId: 'u1',
          organizationId: null,
          birthDate,
        },
        NOW,
      );
    expect(
      abilityFor(who).can('document.upload', childDocument(new Date('2010-01-01')) as never),
    ).toBe(true);
    expect(
      abilityFor(who).can('document.upload', childDocument(new Date('2008-11-02')) as never),
    ).toBe(false);
  });

  it('recruteur sans KYC 3 : justificatif de sa propre organisation seulement', () => {
    const who: Actor = {
      userId: 'u1',
      roles: [{ role: 'recruiter', organizationId: 'o1' }],
      isKyc3Verified: false,
    };
    const ability = abilityFor(who);
    const registration = (organizationId: string) =>
      documentSubject(
        {
          documentType: 'organization_registration',
          kind: 'organization',
          ownerUserId: null,
          guardianUserId: null,
          organizationId,
          birthDate: null,
        },
        NOW,
      );
    expect(ability.can('document.upload', registration('o1') as never)).toBe(true);
    expect(ability.can('document.upload', registration('o2') as never)).toBe(false);
    expect(ability.can('player.read_public', 'Player')).toBe(false);
  });
});
