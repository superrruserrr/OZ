// Vocabulaire de la matrice des droits (lot 1.4a, EX-104) : `docs/security/rbac.md` en est la source.

/** Colonnes de la matrice. L'agence est un recruteur rattaché à une organisation `agency`. */
export const RBAC_ROLES = [
  'player',
  'guardian',
  'academy',
  'club',
  'federation',
  'center',
  'recruiter',
  'admin',
] as const;
export type RbacRole = (typeof RBAC_ROLES)[number];

/** Sujet CASL visé par chaque action. */
export const RBAC_ACTION_SUBJECTS = {
  'profile.read': 'Player',
  'profile.update': 'Player',
  'player.create': 'Organization',
  'player.read_public': 'Player',
  'player.search': 'PlayerSearch',
  'player.read_club_contact': 'Player',
  'player.read_minor': 'Player',
  'player.read_minor_contact': 'Player',
  'list.manage': 'Shortlist',
  'test.certify': 'TestResult',
  'test.review': 'TestResult',
  'kyc.decide': 'KycCase',
  'kyc.read': 'KycCase',
  'audit.read': 'Player',
  'subscription.manage': 'Organization',
  'document.upload': 'Document',
  'document.read': 'Document',
} as const;
export type RbacAction = keyof typeof RBAC_ACTION_SUBJECTS;
export type RbacSubjectType = (typeof RBAC_ACTION_SUBJECTS)[RbacAction];

export const RBAC_ACTIONS = Object.keys(RBAC_ACTION_SUBJECTS) as readonly RbacAction[];

/** Valeurs permises dans une cellule ; leur sens est défini en tête de `docs/security/rbac.md`. */
export const RBAC_CELLS = [
  'deny',
  'never',
  'tier',
  'allow',
  'self',
  'self-adult',
  'self+child',
  'child',
  'org',
  'tested',
  'limited',
  'org+limited',
  'logged',
  'kyc3',
  'kyc3+org',
  'kyc3+logged',
] as const;
export type RbacCell = (typeof RBAC_CELLS)[number];

/** Champs déclaratifs qu'une académie ou un club modifie sur ses joueurs rattachés. */
export const PLAYER_DECLARATIVE_FIELDS = [
  'region',
  'city',
  'primaryPosition',
  'secondaryPosition',
  'dominantFoot',
  'heightCm',
  'weightKg',
] as const;

/**
 * Seuls champs modifiables, liste blanche : rôle, KYC, statut, date de naissance, rattachements et
 * visibilité n'y figurent pas (EX-T04 n° 7, CP-07), administrateur compris.
 */
export const PLAYER_EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'nationality',
  'country',
  ...PLAYER_DECLARATIVE_FIELDS,
] as const;
