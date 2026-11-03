// Sérialisation par vue (lot 1.4b, EX-104 n° 2 et 3) : un champ non autorisé n'est pas masqué, il
// n'est pas envoyé. Chaque vue est une liste blanche figée ; aucune colonne chiffrée ni empreinte
// n'y figure, le téléphone sort déchiffré sous `phone` (D6).

import type { Actor, AppAbility, PlayerSubject } from './abilities.js';
import type { RbacRole } from './actions.js';

/** Champs qu'une vue de joueur peut porter. `birthYear` remplace la date de naissance chez un tiers. */
export interface PlayerViewData {
  readonly id?: string;
  readonly ozId?: string | null;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly birthDate?: string;
  readonly birthYear?: number;
  readonly nationality?: string;
  readonly country?: string;
  readonly region?: string | null;
  readonly city?: string | null;
  readonly primaryPosition?: string | null;
  readonly secondaryPosition?: string | null;
  readonly dominantFoot?: string | null;
  readonly heightCm?: number | null;
  readonly weightKg?: number | null;
  readonly verificationStatus?: string;
  /** Badge (D2 du lot 1.13a) : 0 email seul, 1 email et téléphone, 2 identité vérifiée. */
  readonly verificationLevel?: 0 | 1 | 2;
  readonly organizationId?: string | null;
  readonly phone?: string | null;
}

export type PlayerViewField = keyof PlayerViewData;

export type PlayerViewName =
  | 'PlayerSelfView'
  | 'PlayerGuardianView'
  | 'PlayerOrganizationView'
  | 'PlayerPublicView'
  | 'PlayerAdminView';

export interface PlayerView {
  readonly name: PlayerViewName;
  readonly fields: readonly PlayerViewField[];
}

const IDENTITY: readonly PlayerViewField[] = [
  'id',
  'ozId',
  'firstName',
  'lastName',
  'nationality',
  'country',
  'region',
  'city',
  'verificationLevel',
];
const SPORT: readonly PlayerViewField[] = [
  'primaryPosition',
  'secondaryPosition',
  'dominantFoot',
  'heightCm',
  'weightKg',
];
const ACCOUNT: readonly PlayerViewField[] = [
  ...IDENTITY,
  'birthDate',
  ...SPORT,
  'verificationStatus',
  'organizationId',
];

const view = (name: PlayerViewName, fields: readonly PlayerViewField[]): PlayerView =>
  Object.freeze({ name, fields: Object.freeze([...fields]) });

/** `docs/security/rbac.md` (section « Vues ») en est la description. */
export const PLAYER_VIEWS: Readonly<Record<PlayerViewName, PlayerView>> = Object.freeze({
  PlayerSelfView: view('PlayerSelfView', [...ACCOUNT, 'phone']),
  PlayerGuardianView: view('PlayerGuardianView', [...ACCOUNT, 'phone']),
  PlayerAdminView: view('PlayerAdminView', [...ACCOUNT, 'phone']),
  PlayerOrganizationView: view('PlayerOrganizationView', ACCOUNT),
  PlayerPublicView: view('PlayerPublicView', [...IDENTITY, 'birthYear', ...SPORT]),
});

/** Blocs que le titulaire majeur ou le tuteur peut masquer aux tiers (EX-115 n° 3, D1 du lot 1.13a). */
export const PLAYER_BLOCK_FIELDS = Object.freeze({
  location: Object.freeze(['region', 'city']),
  physical: Object.freeze(['heightCm', 'weightKg']),
  sport: Object.freeze(['primaryPosition', 'secondaryPosition', 'dominantFoot']),
} as const satisfies Record<string, readonly PlayerViewField[]>);
export type PlayerBlock = keyof typeof PLAYER_BLOCK_FIELDS;
/** `false` : bloc masqué aux tiers ; absent ou `true` : visible. */
export type PlayerBlockVisibility = Partial<Record<PlayerBlock, boolean>>;

/** Copie champ par champ : seuls les champs de la vue, propres à l'objet, sont repris. */
export function serializeView(target: PlayerView, data: PlayerViewData): Partial<PlayerViewData> {
  const out: Record<string, unknown> = {};
  for (const field of target.fields) {
    if (Object.hasOwn(data, field)) out[field] = data[field];
  }
  return out;
}

const READS = ['profile.read', 'player.read_public', 'player.read_minor'] as const;

const holds = (actor: Actor, role: RbacRole): boolean =>
  actor.roles.some((entry) => entry.role === role);

/** `actor.roles` doit être déjà filtré aux organisations vérifiées (`sessionAccess`, lot 1.4a). */
const attachedTo = (actor: Actor, organizationId: string | null): boolean =>
  organizationId !== null &&
  actor.roles.some(
    (entry) =>
      (entry.role === 'academy' || entry.role === 'club') &&
      entry.organizationId === organizationId,
  );

/** Chaque vue exige la relation qui la fonde, en plus de la lecture permise par CASL. */
function chooseView(actor: Actor, ability: AppAbility, target: PlayerSubject): PlayerView | null {
  if (!READS.some((action) => ability.can(action, target))) return null;
  const owns = ability.can('profile.read', target);
  if (owns && holds(actor, 'player') && target.userId === actor.userId) {
    return PLAYER_VIEWS.PlayerSelfView;
  }
  if (
    owns &&
    holds(actor, 'guardian') &&
    target.isMinor &&
    target.guardianUserId === actor.userId
  ) {
    return PLAYER_VIEWS.PlayerGuardianView;
  }
  if (owns && holds(actor, 'admin')) return PLAYER_VIEWS.PlayerAdminView;
  if (
    target.isMinor &&
    attachedTo(actor, target.organizationId) &&
    ability.can('player.read_minor', target)
  ) {
    return PLAYER_VIEWS.PlayerOrganizationView;
  }
  return PLAYER_VIEWS.PlayerPublicView;
}

/** Les blocs masqués ne s'appliquent qu'aux tiers : titulaire, tuteur, organisation, admin voient tout. */
function hideBlocks(
  chosen: PlayerView | null,
  visibility: PlayerBlockVisibility,
): PlayerView | null {
  if (chosen?.name !== 'PlayerPublicView') return chosen;
  const hidden = new Set<PlayerViewField>(
    (Object.keys(PLAYER_BLOCK_FIELDS) as PlayerBlock[])
      .filter((block) => visibility[block] === false)
      .flatMap((block) => PLAYER_BLOCK_FIELDS[block]),
  );
  return hidden.size === 0
    ? chosen
    : view(
        chosen.name,
        chosen.fields.filter((field) => !hidden.has(field)),
      );
}

/**
 * Vue la plus large que permet l'ability, ou `null` si aucune lecture n'est permise : l'appelant
 * répond alors 403 ou 404, jamais une vue vide. Le téléphone d'un mineur ne reste que pour qui a
 * `player.read_minor_contact` (son tuteur, l'admin journalisé : CP-11).
 */
export function playerViewFor(
  actor: Actor,
  ability: AppAbility,
  target: PlayerSubject,
  visibility: PlayerBlockVisibility = {},
): PlayerView | null {
  const chosen = hideBlocks(chooseView(actor, ability, target), visibility);
  if (chosen === null || !chosen.fields.includes('phone')) return chosen;
  if (!target.isMinor || ability.can('player.read_minor_contact', target)) return chosen;
  return view(
    chosen.name,
    chosen.fields.filter((field) => field !== 'phone'),
  );
}

/** Vue choisie puis sérialisée ; `null` si le lecteur n'a droit à aucune vue. */
export function presentPlayer(
  actor: Actor,
  ability: AppAbility,
  target: PlayerSubject,
  data: PlayerViewData,
  visibility: PlayerBlockVisibility = {},
): Partial<PlayerViewData> | null {
  const chosen = playerViewFor(actor, ability, target, visibility);
  return chosen === null ? null : serializeView(chosen, data);
}
