// Politiques CASL (lot 1.4a) : un jeu de règles par rôle, cumulées pour un compte à plusieurs rôles.
// Rien n'est permis sans règle explicite. Fonctions pures : l'acteur et le sujet viennent de la base.

import {
  AbilityBuilder,
  createMongoAbility,
  subject as caslSubject,
  type MongoAbility,
} from '@casl/ability';
import {
  PLAYER_DECLARATIVE_FIELDS,
  PLAYER_EDITABLE_FIELDS,
  type RbacAction,
  type RbacRole,
  type RbacSubjectType,
} from './actions.js';
import { isMinor } from './minor.js';

export interface ActorRole {
  readonly role: RbacRole;
  readonly organizationId: string | null;
}

/** Titulaire de la requête, relu en base à chaque requête : jamais tiré du jeton (CP-08). */
export interface Actor {
  readonly userId: string;
  readonly roles: readonly ActorRole[];
  /** Toujours faux jusqu'au lot KYC (1.10) : recruteurs et agences n'ont aucun droit d'ici là. */
  readonly isKyc3Verified: boolean;
}

export interface PlayerRecord {
  readonly userId: string | null;
  readonly birthDate: Date;
  readonly verificationStatus: string;
  /** Compte du tuteur **vérifié** de ce joueur : à laisser vide tant qu'il ne l'est pas. */
  readonly guardianUserId: string | null;
  readonly organizationId: string | null;
  readonly testedByOrganizationIds: readonly string[];
  /** Consentement de publication horodaté d'un tuteur vérifié en KYC 2 (EX-T16 n° 3). */
  readonly hasPublicationConsent: boolean;
  /**
   * Suppression du compte titulaire en attente (lot 1.16cba, D1) : la fiche est invisible des tiers
   * pendant le délai de rétractation ; le titulaire, son tuteur et l'administrateur la lisent.
   */
  readonly deletionPending: boolean;
}

export type PlayerSubject = Omit<
  PlayerRecord,
  'birthDate' | 'verificationStatus' | 'hasPublicationConsent'
> & {
  readonly isMinor: boolean;
  readonly isVerified: boolean;
  /** Mineur visible d'un tiers : vérifié et publié avec consentement. */
  readonly isPublished: boolean;
};

/** Pièces d'une personne (joueur ou tuteur) ; la vidéo attend son lot (D4 du lot 1.9a). */
export const PERSON_DOCUMENT_TYPES = [
  'birth_certificate',
  'identity_document',
  'photo',
  'license',
] as const;
/** Justificatif d'une organisation. */
export const ORGANIZATION_DOCUMENT_TYPES = ['organization_registration'] as const;

/** Cible d'un dépôt (lot 1.9a), lue en base sous la RLS du demandeur. */
export interface DocumentTarget {
  readonly documentType: string;
  readonly kind: 'player' | 'guardian' | 'organization';
  /** Compte titulaire : celui du joueur, ou celui de la fiche tuteur. */
  readonly ownerUserId: string | null;
  /** Joueur seulement : compte de son tuteur **vérifié**. */
  readonly guardianUserId: string | null;
  /** Organisation de rattachement du joueur, ou organisation visée. */
  readonly organizationId: string | null;
  /** Joueur seulement : la tutelle s'arrête à sa majorité. */
  readonly birthDate: Date | null;
}

export type DocumentSubject = Omit<DocumentTarget, 'birthDate'> & { readonly isMinor: boolean };

export type AuthorizationReason = 'audit' | 'limited';

export type AppAbility = MongoAbility<[RbacAction, RbacSubjectType | object]>;

const AUDIT: AuthorizationReason = 'audit';
const LIMITED: AuthorizationReason = 'limited';

type Builder = AbilityBuilder<AppAbility>;
type Rules = (builder: Builder, actor: Actor, organizationIds: readonly string[]) => void;

const inOrganizations = (ids: readonly string[]): { readonly $in: string[] } => ({ $in: [...ids] });

/** Lecture par un tiers : jamais une fiche dont le titulaire a demandé la suppression (D1). */
const LISTED = { deletionPending: false } as const;
const PUBLIC_PROFILE = { isMinor: false, isVerified: true, ...LISTED };
const PERSON_DOCUMENT = { documentType: { $in: [...PERSON_DOCUMENT_TYPES] } };
/** Qui dépose une pièce peut la relire, une fois saine (lot 1.9ca, décision du 2026-11-02). */
const DOCUMENT_ACTIONS: ('document.upload' | 'document.read')[] = [
  'document.upload',
  'document.read',
];

/** Justificatif de sa propre organisation : toute organisation, avant même le KYC 3 (D5). */
function organizationDocumentRules({ can }: Builder, ids: readonly string[]): void {
  can(DOCUMENT_ACTIONS, 'Document', {
    kind: 'organization',
    organizationId: inOrganizations(ids),
    documentType: { $in: [...ORGANIZATION_DOCUMENT_TYPES] },
  });
}
const PUBLISHED_MINOR = { isMinor: true, isPublished: true, ...LISTED };

function attachedRules(builder: Builder, ids: readonly string[]): void {
  const { can } = builder;
  const organizationId = inOrganizations(ids);
  can('profile.update', 'Player', [...PLAYER_DECLARATIVE_FIELDS], { organizationId });
  can('player.create', 'Organization', { id: organizationId });
  can('subscription.manage', 'Organization', { id: organizationId });
  // Pièces des joueurs rattachés et justificatif de l'organisation (D5 du lot 1.9a).
  can(DOCUMENT_ACTIONS, 'Document', { ...PERSON_DOCUMENT, kind: 'player', organizationId });
  organizationDocumentRules(builder, ids);
}

const RULES: Readonly<Record<RbacRole, Rules>> = {
  player({ can }, { userId }) {
    can('profile.read', 'Player', { userId });
    can('profile.update', 'Player', [...PLAYER_EDITABLE_FIELDS], { userId, isMinor: false });
    // Réglage des blocs visibles (EX-115 n° 3) : le majeur seul ; pour un mineur, son tuteur.
    can('profile.set_visibility', 'Player', { userId, isMinor: false });
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.read_minor', 'Player', { userId, isMinor: true });
    can('audit.read', 'Player', { userId });
    can(DOCUMENT_ACTIONS, 'Document', { ...PERSON_DOCUMENT, ownerUserId: userId });
  },
  guardian({ can }, { userId }) {
    // La tutelle s'arrête à la majorité : l'ancien enfant décide seul.
    const child = { guardianUserId: userId, isMinor: true };
    can('profile.read', 'Player', child);
    can('profile.update', 'Player', [...PLAYER_EDITABLE_FIELDS], child);
    can('profile.set_visibility', 'Player', child);
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.read_minor', 'Player', child);
    can('player.read_minor_contact', 'Player', child);
    can('audit.read', 'Player', child);
    // Ses propres pièces (fiche tuteur) et celles de l'enfant mineur.
    can(DOCUMENT_ACTIONS, 'Document', { ...PERSON_DOCUMENT, ownerUserId: userId });
    can(DOCUMENT_ACTIONS, 'Document', { ...PERSON_DOCUMENT, kind: 'player', ...child });
  },
  academy(builder, _actor, ids) {
    const { can } = builder;
    attachedRules(builder, ids);
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.search', 'PlayerSearch').because(LIMITED);
    can('player.read_minor', 'Player', PUBLISHED_MINOR).because(LIMITED);
    can('player.read_minor', 'Player', {
      isMinor: true,
      organizationId: inOrganizations(ids),
      ...LISTED,
    });
    can('list.manage', 'Shortlist');
  },
  club(builder, _actor, ids) {
    const { can } = builder;
    attachedRules(builder, ids);
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.search', 'PlayerSearch');
    can('player.read_minor', 'Player', PUBLISHED_MINOR);
    can('player.read_minor', 'Player', {
      isMinor: true,
      organizationId: inOrganizations(ids),
      ...LISTED,
    });
    can('list.manage', 'Shortlist');
  },
  federation(builder, _actor, ids) {
    const { can } = builder;
    organizationDocumentRules(builder, ids);
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.search', 'PlayerSearch');
    can('player.read_club_contact', 'Player');
    can('player.read_minor', 'Player', PUBLISHED_MINOR);
    can('list.manage', 'Shortlist');
    can('kyc.read', 'KycCase');
    can('subscription.manage', 'Organization', { id: inOrganizations(ids) });
  },
  center(builder, _actor, ids) {
    const { can } = builder;
    organizationDocumentRules(builder, ids);
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.read_minor', 'Player', {
      ...PUBLISHED_MINOR,
      testedByOrganizationIds: inOrganizations(ids),
    });
    can('test.certify', 'TestResult');
    can('subscription.manage', 'Organization', { id: inOrganizations(ids) });
  },
  recruiter(builder, { isKyc3Verified }, ids) {
    const { can } = builder;
    // Seule exception avant le KYC 3 : déposer le justificatif qui le prépare (D5 du lot 1.9a).
    organizationDocumentRules(builder, ids);
    // KYC 3 obligatoire (plan §7.3) : aucun autre droit avant, pas même sur un profil public.
    if (!isKyc3Verified) return;
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.search', 'PlayerSearch');
    can('list.manage', 'Shortlist');
    can('subscription.manage', 'Organization', { id: inOrganizations(ids) });
    can('player.read_minor', 'Player', PUBLISHED_MINOR).because(AUDIT);
  },
  admin({ can }) {
    can('profile.read', 'Player').because(AUDIT);
    can('profile.update', 'Player', [...PLAYER_EDITABLE_FIELDS]).because(AUDIT);
    can('player.create', 'Organization');
    can('player.read_public', 'Player', PUBLIC_PROFILE);
    can('player.search', 'PlayerSearch');
    can('player.read_club_contact', 'Player');
    can('player.read_minor', 'Player', { isMinor: true }).because(AUDIT);
    can('player.read_minor_contact', 'Player', { isMinor: true }).because(AUDIT);
    can('test.review', 'TestResult');
    can('kyc.decide', 'KycCase');
    can('kyc.read', 'KycCase');
    can('audit.read', 'Player');
    can('audit.read_log', 'AuditLog');
    can('subscription.manage', 'Organization');
    // Revue KYC (lot 1.11) ; jamais de dépôt (D5 du lot 1.9a).
    can('document.read', 'Document').because(AUDIT);
  },
};

/**
 * Droits d'un acteur. Les coordonnées selon palier restent fermées : palier payant en Phase 2.
 * `profile.update` se décide champ par champ : `can(action, sujet)` sans champ ne prouve rien.
 */
export function abilityFor(actor: Actor): AppAbility {
  const builder = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const role of new Set(actor.roles.map((entry) => entry.role))) {
    const organizationIds = actor.roles.flatMap((entry) =>
      entry.role === role && entry.organizationId !== null ? [entry.organizationId] : [],
    );
    RULES[role](builder, actor, organizationIds);
  }
  return builder.build();
}

/** Sujet de décision ; la minorité est recalculée ici, à la date de la requête (EX-T16 n° 1). */
export function playerSubject(player: PlayerRecord, now: Date): PlayerSubject {
  const { birthDate, verificationStatus, hasPublicationConsent, ...links } = player;
  const isVerified = verificationStatus === 'verified';
  return caslSubject('Player', {
    ...links,
    isMinor: isMinor(birthDate, now),
    isVerified,
    isPublished: isVerified && hasPublicationConsent,
  } satisfies PlayerSubject);
}

/** Sujet de dépôt ; la minorité est recalculée à la date de la requête, comme pour un joueur. */
export function documentSubject(target: DocumentTarget, now: Date): DocumentSubject {
  const { birthDate, ...rest } = target;
  return caslSubject('Document', {
    ...rest,
    isMinor: birthDate !== null && isMinor(birthDate, now),
  } satisfies DocumentSubject);
}

/** Sujet « organisation » d'une action de portée `org`. */
export const organizationSubject = (id: string): object => caslSubject('Organization', { id });

/**
 * Condition de l'accès, toutes règles applicables confondues, quel que soit l'ordre des rôles :
 * `audit` si l'une l'impose (EX-T16 n° 5), `limited` si aucune règle ne donne l'accès entier.
 */
export function authorizationReason(
  ability: AppAbility,
  action: RbacAction,
  target: RbacSubjectType | object,
  field?: string,
): AuthorizationReason | undefined {
  const type = ability.detectSubjectType(target) as RbacSubjectType;
  const rules = ability
    .rulesFor(action, type, field)
    .filter((rule) => rule.matchesConditions(target));
  if (rules.some((rule) => rule.reason === AUDIT)) return AUDIT;
  return rules.length > 0 && rules.every((rule) => rule.reason === LIMITED) ? LIMITED : undefined;
}
