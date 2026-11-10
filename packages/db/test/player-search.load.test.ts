import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDbClient, type PrismaClient } from '../src/client.js';
import {
  searchPlayers,
  type PlayerSearchCriteria,
  type PlayerSearchOptions,
} from '../src/player-search.js';
import { withUserContext } from '../src/session-context.js';
import {
  connectAsAppRole,
  migrateDeploy,
  startDatabase,
  type AppConnection,
  type TestDatabase,
} from './database.js';

// EX-116 n° 5 en base (lot 1.14a, tâche 6) : p95 < 300 ms sur 100 000 profils synthétiques, sous la
// RLS d'un lecteur fédération, rôle `oz_app`, pour les combinaisons courantes de filtres. Hors CI
// (durée) ; résultat consigné dans docs/db/migrations.md. Aucune donnée réelle. Le texte libre a son
// propre seuil (dette D-125).

const PLAYERS = 100_000;
/** Mesures écrites hors du dépôt (la console d'un test réussi est masquée). */
const RESULTS = join(tmpdir(), 'oz-player-search-load.txt');
const RUNS = 200;
const P95_MS = 300;
/** Texte libre hors cible (dette D-125) : l'index par trigrammes ne sert pas sous la RLS. */
const FREE_TEXT_P95_MS = 3_000;

let db: TestDatabase;
let app: AppConnection;
let client: PrismaClient;
let reader = '';

beforeAll(async () => {
  db = await startDatabase();
  await migrateDeploy(db);
  app = await connectAsAppRole(db);
  const url = new URL(db.url);
  url.username = 'oz_app_test';
  url.password = 'oz_app_test';
  client = createDbClient(url.toString());

  const [user] = await db.query<{ id: string }>(
    `INSERT INTO users (email, email_verified_at) VALUES ('charge@example.test', now()) RETURNING id`,
  );
  reader = user?.id ?? '';
  const [org] = await db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ('federation', 'Fédération synthétique', 'CM', 'verified') RETURNING id`,
  );
  await db.query(
    `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, 'federation', $2)`,
    [reader, org?.id],
  );
  const [guardianUser] = await db.query<{ id: string }>(
    `INSERT INTO users (email, email_verified_at) VALUES ('tuteur-charge@example.test', now()) RETURNING id`,
  );
  const [guardian] = await db.query<{ id: string }>(
    `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
     VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
    [guardianUser?.id],
  );

  // 100 000 joueurs : ≈ 20 % mineurs (dont la moitié publiés), 70 % vérifiés, 10 % de blocs masqués.
  await db.query(
    `INSERT INTO players (first_name, last_name, birth_date, nationality, country, region, city,
       height_cm, weight_kg, primary_position, secondary_position, dominant_foot, verification_status,
       visibility, guardian_id)
     SELECT
       (ARRAY['Samuel','Éloïse','Awa','Moussa','Fatou','Jean','Paul','Aminata','Ibrahim','Grace',
              'Yannick','Mariam','Junior','Clarisse','Didier','Nadia','Patrick','Aïcha','Serge','Ruth'])[1 + n % 20],
       (ARRAY['Ngassa','Ndongo','Diallo','Traoré','Etoundi','Mbappé','Kouassi','Mensah','Okafor','Fofana',
              'Nkoulou','Eto''o','Sow','Camara','Bamba','Owusu','Adeyemi','Tchami','Kamga','Diop'])[1 + (n / 20) % 20],
       make_date(1990 + n % 30, 1 + n % 12, 1 + n % 28),
       'CM',
       (ARRAY['CM','CM','CM','CM','SN','CI','NG','GH','CM','CM'])[1 + n % 10],
       (ARRAY['Centre','Littoral','Ouest','Nord','Sud'])[1 + n % 5],
       (ARRAY['Yaoundé','Douala','Bafoussam','Garoua','Kribi','Bamenda','Limbé','Ebolowa','Bertoua','Maroua'])[1 + (n / 7) % 10],
       150 + n % 50, 50 + n % 40,
       (enum_range(NULL::player_position))[1 + n % 8],
       (enum_range(NULL::player_position))[1 + (n / 8) % 8],
       (enum_range(NULL::dominant_foot))[1 + n % 3],
       (CASE WHEN n % 10 < 7 THEN 'verified' ELSE 'declared' END)::verification_status,
       CASE WHEN n % 10 = 3 THEN '{"location": false, "physical": false}'::jsonb ELSE '{}'::jsonb END,
       CASE WHEN 1990 + n % 30 > extract(year FROM now())::int - 18 THEN $1::uuid END
     FROM generate_series(1, ${String(PLAYERS)}) AS n`,
    [guardian?.id],
  );
  // OZ ID en masse (partie aléatoire = rang en hexadécimal, alphabet Crockford) : registre puis fiche.
  await db.query(`ALTER TABLE players DISABLE TRIGGER USER`);
  await db.query(
    `WITH ranked AS (SELECT id, country, row_number() OVER (ORDER BY id) AS n FROM players)
     INSERT INTO oz_id_registry (oz_id, player_id)
     SELECT oz_ozid_compose(country, '26', lpad(upper(to_hex(n)), 6, '0')), id FROM ranked`,
  );
  await db.query(
    `UPDATE players p SET oz_id = r.oz_id FROM oz_id_registry r WHERE r.player_id = p.id`,
  );
  await db.query(`ALTER TABLE players ENABLE TRIGGER USER`);
  await db.query(
    `INSERT INTO consents (type, text_version, player_id, granted_by_guardian_id)
     SELECT 'guardian_profile_publication', 'v1', id, guardian_id FROM players
     WHERE guardian_id IS NOT NULL AND verification_status = 'verified' AND abs(hashtext(id::text)) % 2 = 0`,
  );
  await db.query('ANALYZE');
}, 1_200_000);

afterAll(async () => {
  await client.$disconnect();
  await app.end();
  await db.stop();
});

const percentile = (sorted: number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? Number.NaN;

async function measure(
  criteria: PlayerSearchCriteria,
  options: Partial<PlayerSearchOptions> = {},
  pages = 1,
): Promise<{ p50: number; p95: number; p99: number; rows: number }> {
  const timings: number[] = [];
  let rows = 0;
  for (let run = 0; run < RUNS; run += 1) {
    let afterId: string | undefined;
    for (let page = 1; page <= pages; page += 1) {
      const started = performance.now();
      const result = await withUserContext(client, reader, (tx) =>
        searchPlayers(tx, criteria, {
          sort: 'name',
          direction: 'asc',
          limit: 20,
          respectBlocks: true,
          ...options,
          afterId,
        }),
      );
      // Seule la dernière page est mesurée (la page 3 suppose les deux précédentes).
      if (page === pages) {
        timings.push(performance.now() - started);
        rows = result.records.length;
      }
      afterId = result.records.at(-1)?.id;
    }
  }
  const sorted = [...timings].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    rows,
  };
}

describe(`recherche sur ${String(PLAYERS)} profils (EX-116 n° 5)`, () => {
  it.each([
    ['pays seul', { country: 'SN' }, {}, 1, P95_MS],
    [
      'pays, âge, poste',
      { country: 'CM', ageMin: 16, ageMax: 19, position: 'striker' },
      {},
      1,
      P95_MS,
    ],
    ['ville et taille (bloc masquable)', { city: 'Douala', heightMin: 180 }, {}, 1, P95_MS],
    ['niveau 2, par âge', { verificationLevel: 2 }, { sort: 'birthYear' }, 1, P95_MS],
    ['niveau 1, pays', { verificationLevel: 1, country: 'SN' }, {}, 1, P95_MS],
    ['les plus récents', {}, { sort: 'recent', direction: 'desc' }, 1, P95_MS],
    ['page 3 du pays', { country: 'CM' }, {}, 3, P95_MS],
    [
      'texte libre, pertinence',
      { q: 'ngassa' },
      { sort: 'relevance', direction: 'desc' },
      1,
      FREE_TEXT_P95_MS,
    ],
    ['texte libre, par nom', { q: 'eloise ndongo' }, {}, 1, FREE_TEXT_P95_MS],
  ] as const)('%s : p95 sous le seuil', async (label, criteria, options, pages, threshold) => {
    const result = await measure(criteria, options, pages);
    appendFileSync(
      RESULTS,
      `${label} : p50 ${result.p50.toFixed(1)} ms, p95 ${result.p95.toFixed(1)} ms, p99 ${result.p99.toFixed(1)} ms, ${String(result.rows)} lignes\n`,
    );
    expect(result.rows).toBeGreaterThan(0);
    expect(result.p95).toBeLessThan(threshold);
  });
});
