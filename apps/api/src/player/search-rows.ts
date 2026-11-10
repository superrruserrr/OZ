import {
  abilityFor,
  authorizationReason,
  playerSubject,
  playerViewFor,
  refusedSearchCriteria,
  searchScopeFor,
  serializeView,
  type Actor,
  type AppAbility,
  type PlayerSubject,
  type SearchScope,
} from '@oz/auth';
import type { PlayerProfileOutput, PlayerSearchSortOutput } from '@oz/contracts';
import type { PlayerProfileRecord } from '@oz/db';
import type { PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/errors/api-error.js';
import { profileViewData } from './view-data.js';

// Portée et vue par ligne de la recherche (lot 1.14a), partagées par la recherche, les recherches
// sauvegardées et l'export CSV (lot 1.14b).

const READS = ['profile.read', 'player.read_public', 'player.read_minor'] as const;

/** Sens par défaut (D6) : alphabétique et par âge croissants ; récents et pertinents d'abord. */
export const DEFAULT_DIRECTION: Readonly<Record<PlayerSearchSortOutput, 'asc' | 'desc'>> = {
  name: 'asc',
  birthYear: 'asc',
  recent: 'desc',
  relevance: 'desc',
};

export const SEARCH_FORBIDDEN = (): AppException =>
  new AppException(403, 'FORBIDDEN', 'Action non autorisée.');
const CRITERIA_FORBIDDEN = (fields: readonly string[]): AppException =>
  new AppException(
    403,
    'SEARCH_CRITERIA_FORBIDDEN',
    'Critères réservés à une recherche complète.',
    fields.map((field) => ({ field, code: 'criteria_forbidden' })),
  );

export interface SearchAuthorization {
  readonly ability: AppAbility;
  readonly scope: SearchScope;
}

/**
 * Portée relue en base (CASL) et critères refusés à la portée (D1) : 403 sinon. Le journal ne porte
 * que les noms des critères refusés.
 */
export function authorizeSearch(
  actor: Actor,
  criteria: Readonly<Record<string, unknown>>,
  logger: PinoLogger,
): SearchAuthorization {
  const ability = abilityFor(actor);
  const scope = searchScopeFor(actor, ability);
  if (scope === null) throw SEARCH_FORBIDDEN();
  const refused = refusedSearchCriteria(scope, criteria);
  if (refused.length > 0) {
    logger.info({ event: 'player.search.refused', criteria: refused }, 'Recherche refusée');
    throw CRITERIA_FORBIDDEN(refused);
  }
  return { ability, scope };
}

/** Lecture journalisée (cellule `logged`, `kyc3+logged`) : le mineur listé est audité (D3). */
function auditedRead(ability: AppAbility, subject: PlayerSubject): boolean {
  return READS.some(
    (action) =>
      ability.can(action, subject) && authorizationReason(ability, action, subject) === 'audit',
  );
}

export interface ViewedRow {
  readonly id: string;
  readonly body: PlayerProfileOutput;
}

/**
 * Chaque ligne repasse par la décision et la vue de sa fiche (CP-10, CP-12) ; une ligne sans vue
 * n'est pas sérialisée (filet derrière la RLS). Le téléphone n'est jamais listé.
 */
export function viewRows(
  actor: Actor,
  ability: AppAbility,
  records: readonly PlayerProfileRecord[],
): { rows: ViewedRow[]; listedMinors: string[] } {
  const rows: ViewedRow[] = [];
  const listedMinors: string[] = [];
  for (const record of records) {
    const { checkedAt, ...access } = record.access;
    const subject = playerSubject(access, checkedAt);
    const view = playerViewFor(actor, ability, subject, record.visibility);
    if (view === null) continue;
    if (subject.isMinor && auditedRead(ability, subject)) listedMinors.push(record.id);
    rows.push({
      id: record.id,
      body: serializeView(view, profileViewData(record)) as PlayerProfileOutput,
    });
  }
  return { rows, listedMinors };
}
