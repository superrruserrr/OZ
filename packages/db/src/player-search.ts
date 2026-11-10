// Recherche de joueurs (lot 1.14a, EX-116 n° 1, 2, 5) : sous la RLS du lecteur, avec les colonnes
// d'une fiche (CASL et la vue décident ensuite ligne par ligne, côté API). Pagination par clé (jamais
// `OFFSET`), clés de tri d'une liste fermée. Toute valeur du lecteur passe en paramètre ; seuls les
// fragments SQL de cette liste fermée sont composés.

import { Prisma } from './generated/prisma/client.js';
import {
  PROFILE_COLUMNS,
  profileRecordOf,
  type PlayerProfileRecord,
  type PlayerProfileRow,
} from './players.js';
import type { TransactionClient } from './session-context.js';

export type PlayerSearchSort = 'name' | 'birthYear' | 'recent' | 'relevance';

export interface PlayerSearchCriteria {
  readonly country?: string | undefined;
  readonly region?: string | undefined;
  readonly city?: string | undefined;
  readonly ageMin?: number | undefined;
  readonly ageMax?: number | undefined;
  readonly position?: string | undefined;
  readonly foot?: string | undefined;
  readonly heightMin?: number | undefined;
  readonly heightMax?: number | undefined;
  readonly weightMin?: number | undefined;
  readonly weightMax?: number | undefined;
  readonly verificationLevel?: number | undefined;
  readonly organizationId?: string | undefined;
  readonly q?: string | undefined;
}

export interface PlayerSearchOptions {
  readonly sort: PlayerSearchSort;
  readonly direction: 'asc' | 'desc';
  readonly limit: number;
  /**
   * Identifiant de la dernière ligne de la page précédente : ses clés de tri sont relues en base,
   * sous la même RLS. Devenue invisible entre deux pages : `anchorLost`, aucune ligne.
   */
  readonly afterId?: string | undefined;
  /**
   * Un filtre sur un bloc masqué exclut le joueur (D4) : vrai pour tout lecteur sauf
   * l'administrateur, qui lit la fiche complète. Conservateur pour les autres vues complètes.
   */
  readonly respectBlocks: boolean;
}

export interface PlayerSearchPage {
  readonly records: readonly PlayerProfileRecord[];
  readonly hasMore: boolean;
  /** La dernière ligne de la page précédente n'est plus visible du lecteur : curseur périmé. */
  readonly anchorLost: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const lastName = (t: Prisma.Sql) => Prisma.sql`lower(oz_unaccent(${t}.last_name))`;
const firstName = (t: Prisma.Sql) => Prisma.sql`lower(oz_unaccent(${t}.first_name))`;
const fullName = (t: Prisma.Sql) =>
  Prisma.sql`lower(oz_unaccent(${t}.first_name || ' ' || ${t}.last_name))`;
const P = Prisma.sql`p`;
const A = Prisma.sql`a`;

/** Clés de tri sur la table d'alias `t`, identifiant non compris. */
type SortKeys = (t: Prisma.Sql) => Prisma.Sql[];

function sortKeys(sort: PlayerSearchSort, q: Prisma.Sql | null): SortKeys {
  switch (sort) {
    case 'name':
      return (t) => [lastName(t), firstName(t)];
    case 'birthYear':
      return (t) => [
        Prisma.sql`extract(year FROM ${t}.birth_date)::int`,
        lastName(t),
        firstName(t),
      ];
    case 'recent':
      return (t) => [Prisma.sql`${t}.created_at`];
    case 'relevance':
      if (q === null) throw new Error('Recherche : la pertinence demande un texte.');
      return (t) => [Prisma.sql`word_similarity(${q}, ${fullName(t)})`];
  }
}

const hidden = (block: 'location' | 'physical' | 'sport') =>
  Prisma.sql`(p.visibility ->> ${block}) IS DISTINCT FROM 'false'`;

function filters(criteria: PlayerSearchCriteria, q: Prisma.Sql | null, respectBlocks: boolean) {
  // Sans OZ ID, pas de fiche : jamais un résultat.
  const where: Prisma.Sql[] = [Prisma.sql`p.deleted_at IS NULL`, Prisma.sql`p.oz_id IS NOT NULL`];
  const blocks = new Set<'location' | 'physical' | 'sport'>();
  if (criteria.country !== undefined) where.push(Prisma.sql`p.country = ${criteria.country}`);
  if (criteria.region !== undefined) {
    where.push(Prisma.sql`lower(oz_unaccent(p.region)) = lower(oz_unaccent(${criteria.region}))`);
    blocks.add('location');
  }
  if (criteria.city !== undefined) {
    where.push(Prisma.sql`lower(oz_unaccent(p.city)) = lower(oz_unaccent(${criteria.city}))`);
    blocks.add('location');
  }
  // Âge par année de naissance (D5), sur l'année UTC de la base : plage de dates indexable.
  const year = Prisma.sql`extract(year FROM (now() AT TIME ZONE 'UTC'))::int`;
  if (criteria.ageMax !== undefined) {
    where.push(Prisma.sql`p.birth_date >= make_date(${year} - ${criteria.ageMax}::int, 1, 1)`);
  }
  if (criteria.ageMin !== undefined) {
    where.push(Prisma.sql`p.birth_date < make_date(${year} - ${criteria.ageMin}::int + 1, 1, 1)`);
  }
  if (criteria.position !== undefined) {
    where.push(
      Prisma.sql`(p.primary_position::text = ${criteria.position} OR p.secondary_position::text = ${criteria.position})`,
    );
    blocks.add('sport');
  }
  if (criteria.foot !== undefined) {
    where.push(Prisma.sql`p.dominant_foot::text = ${criteria.foot}`);
    blocks.add('sport');
  }
  const range = (column: Prisma.Sql, min?: number, max?: number) => {
    if (min !== undefined) where.push(Prisma.sql`${column} >= ${min}::int`);
    if (max !== undefined) where.push(Prisma.sql`${column} <= ${max}::int`);
    if (min !== undefined || max !== undefined) blocks.add('physical');
  };
  range(Prisma.sql`p.height_cm`, criteria.heightMin, criteria.heightMax);
  range(Prisma.sql`p.weight_kg`, criteria.weightMin, criteria.weightMax);
  if (criteria.verificationLevel === 2) {
    where.push(Prisma.sql`p.verification_status = 'verified'`);
  } else if (criteria.verificationLevel !== undefined && criteria.verificationLevel > 0) {
    where.push(Prisma.sql`oz_player_kyc_level(p.id) >= ${criteria.verificationLevel}::int`);
  }
  if (criteria.organizationId !== undefined) {
    if (!UUID.test(criteria.organizationId)) where.push(Prisma.sql`false`);
    else where.push(Prisma.sql`p.organization_id = ${criteria.organizationId}::uuid`);
  }
  if (q !== null) where.push(Prisma.sql`${q} <% ${fullName(P)}`);
  if (respectBlocks) for (const block of blocks) where.push(hidden(block));
  return where;
}

/**
 * Une page de joueurs visibles du lecteur du contexte, triée et filtrée ; `limit + 1` lignes lues
 * pour savoir s'il en reste. La décision de lecture et la vue de chaque ligne restent à l'appelant.
 */
export async function searchPlayers(
  tx: TransactionClient,
  criteria: PlayerSearchCriteria,
  options: PlayerSearchOptions,
): Promise<PlayerSearchPage> {
  const q =
    criteria.q === undefined
      ? null
      : Prisma.sql`lower(oz_unaccent(${criteria.q.normalize('NFC').trim()}))`;
  const keys = sortKeys(options.sort, q);
  const where = filters(criteria, q, options.respectBlocks);
  const direction = options.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
  if (options.afterId !== undefined) {
    if (!UUID.test(options.afterId)) throw new Error('Recherche : position de page invalide.');
    const anchor = await tx.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM players a
        WHERE a.id = ${options.afterId}::uuid AND a.deleted_at IS NULL) AS found`;
    if (anchor[0]?.found !== true) return { records: [], hasMore: false, anchorLost: true };
    const comparison = options.direction === 'desc' ? Prisma.sql`<` : Prisma.sql`>`;
    where.push(Prisma.sql`(${Prisma.join([...keys(P), Prisma.sql`p.id`])}) ${comparison} (
      SELECT ${Prisma.join([...keys(A), Prisma.sql`a.id`])} FROM players a
      WHERE a.id = ${options.afterId}::uuid AND a.deleted_at IS NULL)`);
  }
  const order = Prisma.join(
    [...keys(P), Prisma.sql`p.id`].map((expression) => Prisma.sql`${expression} ${direction}`),
  );
  const rows = await tx.$queryRaw<PlayerProfileRow[]>`
    SELECT ${PROFILE_COLUMNS}
    FROM players p
    WHERE ${Prisma.join(where, ' AND ')}
    ORDER BY ${order}
    LIMIT ${options.limit + 1}`;
  return {
    records: rows.slice(0, options.limit).map(profileRecordOf),
    hasMore: rows.length > options.limit,
    anchorLost: false,
  };
}
