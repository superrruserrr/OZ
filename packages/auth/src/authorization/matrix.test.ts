import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  abilityFor,
  authorizationReason,
  organizationSubject,
  playerSubject,
  type Actor,
  type PlayerRecord,
} from './abilities.js';
import {
  RBAC_ACTION_SUBJECTS,
  RBAC_ACTIONS,
  RBAC_ROLES,
  type RbacAction,
  type RbacCell,
  type RbacRole,
} from './actions.js';
import { parseRbacMatrix } from './matrix.js';

// Suite générée (EX-104 n° 7) : chaque couple (action, rôle) de `docs/security/rbac.md` est vérifié
// contre CASL, dans les deux sens : le cas permis est permis, le cas voisin est refusé.

const MARKDOWN = readFileSync(
  new URL('../../../../docs/security/rbac.md', import.meta.url),
  'utf8',
);
const matrix = parseRbacMatrix(MARKDOWN);

const NOW = new Date('2026-11-02T12:00:00Z');
const ADULT = new Date('2000-01-01');
const MINOR = new Date('2012-01-01');
const ORG = 'organisation-du-compte';
const OTHER_ORG = 'autre-organisation';
const USER = 'compte';
const SCOPED: readonly RbacRole[] = ['academy', 'club', 'federation', 'center', 'recruiter'];

const actorOf = (role: RbacRole, isKyc3Verified = false): Actor => ({
  userId: USER,
  roles: [{ role, organizationId: SCOPED.includes(role) ? ORG : null }],
  isKyc3Verified,
});

const isMinorAction = (action: RbacAction): boolean =>
  action === 'player.read_minor' || action === 'player.read_minor_contact';

function player(action: RbacAction, overrides: Partial<PlayerRecord> = {}): object {
  return playerSubject(
    {
      userId: 'tiers',
      birthDate: isMinorAction(action) ? MINOR : ADULT,
      verificationStatus: 'verified',
      guardianUserId: 'tuteur-tiers',
      organizationId: OTHER_ORG,
      testedByOrganizationIds: [],
      hasPublicationConsent: true,
      ...overrides,
    },
    NOW,
  );
}

/** Sujet « du compte » pour la cellule : profil lié, ou organisation pour une action de portée. */
function linked(action: RbacAction, link: 'self' | 'child' | 'org' | 'tested'): object {
  if (RBAC_ACTION_SUBJECTS[action] === 'Organization') return organizationSubject(ORG);
  if (link === 'self') return player(action, { userId: USER });
  if (link === 'child') return player(action, { guardianUserId: USER, birthDate: MINOR });
  if (link === 'org') return player(action, { organizationId: ORG });
  return player(action, { testedByOrganizationIds: [ORG] });
}

function stranger(action: RbacAction): object | string {
  const type = RBAC_ACTION_SUBJECTS[action];
  if (type === 'Organization') return organizationSubject(OTHER_ORG);
  return type === 'Player' ? player(action) : type;
}

/** Tout sujet qu'une cellule fermée doit refuser. */
const everySubject = (action: RbacAction): (object | string)[] =>
  RBAC_ACTION_SUBJECTS[action] === 'Player' || RBAC_ACTION_SUBJECTS[action] === 'Organization'
    ? [
        stranger(action),
        linked(action, 'self'),
        linked(action, 'child'),
        linked(action, 'org'),
        linked(action, 'tested'),
      ]
    : [stranger(action)];

function expectCell(action: RbacAction, role: RbacRole, cell: RbacCell): void {
  const ability = abilityFor(actorOf(role));
  const denied = (target: object | string): void => {
    expect(ability.can(action, target as never)).toBe(false);
  };
  const allowed = (target: object | string, reason?: string): void => {
    expect(ability.can(action, target as never)).toBe(true);
    expect(authorizationReason(ability, action, target as never)).toBe(reason);
  };
  switch (cell) {
    case 'deny':
    case 'tier':
      everySubject(action).forEach(denied);
      return;
    case 'never': {
      const verified = abilityFor(actorOf(role, true));
      everySubject(action).forEach(denied);
      for (const target of everySubject(action)) {
        expect(verified.can(action, target as never)).toBe(false);
      }
      return;
    }
    case 'allow':
      allowed(stranger(action));
      return;
    case 'logged':
      allowed(stranger(action), 'audit');
      return;
    case 'limited':
      allowed(stranger(action), 'limited');
      return;
    case 'self':
    case 'child':
    case 'org':
    case 'tested':
      allowed(linked(action, cell));
      denied(stranger(action));
      return;
    case 'self-adult':
      allowed(player(action, { userId: USER }));
      denied(player(action, { userId: USER, birthDate: MINOR }));
      denied(stranger(action));
      return;
    case 'org+limited':
      allowed(linked(action, 'org'));
      allowed(stranger(action), 'limited');
      denied(player(action, { hasPublicationConsent: false }));
      return;
    case 'kyc3': {
      everySubject(action).forEach(denied);
      const verified = abilityFor(actorOf(role, true));
      expect(verified.can(action, stranger(action) as never)).toBe(true);
      return;
    }
    case 'kyc3+org': {
      everySubject(action).forEach(denied);
      const verified = abilityFor(actorOf(role, true));
      expect(verified.can(action, linked(action, 'org') as never)).toBe(true);
      expect(verified.can(action, stranger(action) as never)).toBe(false);
      return;
    }
    case 'kyc3+logged': {
      denied(stranger(action));
      const verified = abilityFor(actorOf(role, true));
      expect(verified.can(action, stranger(action) as never)).toBe(true);
      expect(authorizationReason(verified, action, stranger(action) as never)).toBe('audit');
    }
  }
}

describe('matrice actions × rôles', () => {
  for (const action of RBAC_ACTIONS) {
    for (const role of RBAC_ROLES) {
      const cell = matrix.actions[action][role];
      it(`${action} / ${role} : ${cell}`, () => {
        expectCell(action, role, cell);
      });
    }
  }
});
