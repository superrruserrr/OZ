import { PLAYER_VIEWS, RBAC_ROLES, type PlayerViewName, type RbacRole } from '@oz/auth';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { printedRows } from '../src/player/pdf/profile.js';
import { pdfTexts } from './pdf-text.js';
import { PLAYER_PHONE, playerFixtures, type Account } from './player-fixtures.js';

// Inspection de payload (lot 1.13a, EX-115 n° 6, CP-10, CP-11) sur la pile réelle : pour chacun des
// rôles et un compte sans rôle, les clés reçues de `GET /players/:ozId` sont exactement celles de la
// vue attendue, sur un majeur, un mineur rattaché à un club et un mineur publié non rattaché. Lot
// 1.13b : l'export PDF du même lecteur porte exactement les champs de cette réponse, et ses refus.
// Lot 1.14a : la recherche rend le même joueur dans la même vue, sans téléphone ; un joueur caché
// n'y figure pas ; un rôle sans recherche reçoit 403 (CP-12).

const ORIGIN = 'http://localhost:3000';
const binary = (
  res: NodeJS.ReadableStream,
  done: (error: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => {
    done(null, Buffer.concat(chunks));
  });
};

type Reader = RbacRole | 'none' | 'self';
type Target = 'adult' | 'attachedMinor' | 'publishedMinor';
/** Vue attendue, ou le statut d'un refus. */
type Expected = PlayerViewName | 403 | 404;

// Recruteur : aucun droit avant le KYC 3, que l'API ne connaît pas encore (lot 1.10b).
const EXPECTED: Readonly<Record<Reader, Readonly<Record<Target, Expected>>>> = {
  none: { adult: 403, attachedMinor: 403, publishedMinor: 403 },
  self: { adult: 'PlayerSelfView', attachedMinor: 404, publishedMinor: 404 },
  player: { adult: 'PlayerPublicView', attachedMinor: 404, publishedMinor: 404 },
  guardian: {
    adult: 'PlayerPublicView',
    attachedMinor: 'PlayerGuardianView',
    publishedMinor: 'PlayerGuardianView',
  },
  academy: { adult: 'PlayerPublicView', attachedMinor: 404, publishedMinor: 'PlayerPublicView' },
  club: {
    adult: 'PlayerPublicView',
    attachedMinor: 'PlayerOrganizationView',
    publishedMinor: 'PlayerPublicView',
  },
  federation: {
    adult: 'PlayerPublicView',
    attachedMinor: 404,
    publishedMinor: 'PlayerPublicView',
  },
  center: { adult: 'PlayerPublicView', attachedMinor: 404, publishedMinor: 404 },
  recruiter: { adult: 403, attachedMinor: 403, publishedMinor: 403 },
  admin: {
    adult: 'PlayerAdminView',
    attachedMinor: 'PlayerAdminView',
    publishedMinor: 'PlayerAdminView',
  },
};

/** Rôles qui recherchent (rbac `player.search`) ; recruteur : pas avant le KYC 3. */
const SEARCHERS: readonly Reader[] = ['academy', 'club', 'federation', 'admin'];

/** Rôles qui exportent (lot 1.14b, D1) : portée complète ; l'académie n'exporte pas. */
const EXPORTERS: readonly Reader[] = ['club', 'federation', 'admin'];

/** Lignes d'un CSV RFC 4180 (BOM et filigrane retirés), cellules sans guillemets. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i] ?? '';
    if (quoted) {
      if (char === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && body[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += char;
  }
  return rows.slice(1);
}

const THIRD_PARTY_VIEWS: readonly PlayerViewName[] = ['PlayerPublicView'];
const FORBIDDEN_KEY = /encrypted|hmac|hash|secret|password|token|documentNumber/i;

let harness: AuthHarness;
let server: App;
const readers = new Map<Reader, Account>();
const targets = new Map<Target, string>();

beforeAll(async () => {
  harness = await startAuthHarness();
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
  server = harness.app.getHttpServer();
  const fixtures = await playerFixtures(harness, 'payload');
  const organizations = new Map<RbacRole, string>();
  for (const role of ['academy', 'club', 'federation', 'center', 'recruiter'] as const) {
    organizations.set(role, await fixtures.organization(role));
  }
  readers.set('none', await fixtures.account());
  readers.set('self', await fixtures.account('player'));
  for (const role of RBAC_ROLES) {
    readers.set(role, await fixtures.account(role, organizations.get(role) ?? null));
  }
  const guardianId = await fixtures.verifiedGuardian(readers.get('guardian')?.userId ?? '');

  targets.set(
    'adult',
    (await fixtures.player({ userId: readers.get('self')?.userId ?? null })).ozId,
  );
  const attached = await fixtures.player({
    birthDate: '2012-06-07',
    guardianId,
    organizationId: organizations.get('club') ?? null,
  });
  targets.set('attachedMinor', attached.ozId);
  const published = await fixtures.player({ birthDate: '2011-09-10', guardianId });
  await fixtures.publish(published.id, guardianId);
  targets.set('publishedMinor', published.ozId);
}, 240_000);
afterAll(async () => {
  await harness.stop();
});

const cases = (Object.keys(EXPECTED) as Reader[]).flatMap((reader) =>
  (Object.keys(EXPECTED[reader]) as Target[]).map((target) => ({
    reader,
    target,
    expected: EXPECTED[reader][target],
  })),
);

describe.each(cases)('$reader lit $target', ({ reader, target, expected }) => {
  it(typeof expected === 'number' ? `refus ${String(expected)}` : `vue ${expected}`, async () => {
    const response = await request(server)
      .get(`/players/${targets.get(target) ?? ''}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${readers.get(reader)?.token ?? ''}`);
    if (typeof expected === 'number') {
      expect(response.status).toBe(expected);
      expect(JSON.stringify(response.body)).not.toMatch(/Synthétique|Yaoundé|\+237/);
      return;
    }
    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    const keys = Object.keys(body);
    // Exactement la vue : données toutes présentes, aucune clé de plus (CP-10).
    expect(keys.sort()).toEqual([...PLAYER_VIEWS[expected].fields].sort());
    expect(keys.filter((key) => FORBIDDEN_KEY.test(key))).toEqual([]);
    expect(Object.values(body).some((value) => value === undefined)).toBe(false);
    if (THIRD_PARTY_VIEWS.includes(expected)) {
      expect(body).not.toHaveProperty('birthDate');
      expect(body).not.toHaveProperty('verificationStatus');
    }
    // Téléphone d'un mineur : son tuteur et l'administrateur seulement (CP-11).
    const minor = target !== 'adult';
    const mayHavePhone = minor ? reader === 'guardian' || reader === 'admin' : reader !== 'player';
    if ('phone' in body) {
      expect(mayHavePhone).toBe(true);
      expect(body.phone).toBe(PLAYER_PHONE);
    }
    if (minor && (reader === 'guardian' || reader === 'admin'))
      expect(body.phone).toBe(PLAYER_PHONE);
  });

  it(
    typeof expected === 'number'
      ? `PDF : refus ${String(expected)}`
      : 'PDF : les champs de la vue, rien de plus',
    async () => {
      const get = (path: string) =>
        request(server)
          .get(`/players/${targets.get(target) ?? ''}${path}`)
          .set('Origin', ORIGIN)
          .set('Authorization', `Bearer ${readers.get(reader)?.token ?? ''}`);
      const exported = await get('/profile.pdf')
        .buffer(true)
        .parse(binary as never);
      if (typeof expected === 'number') {
        expect(exported.status).toBe(expected);
        return;
      }
      expect(exported.status).toBe(200);
      const json = (await get('').expect(200)).body as Parameters<typeof printedRows>[0];
      const texts = pdfTexts(exported.body as Buffer);
      const printed = texts.filter((text) => !text.startsWith('Exporté par '));
      // Chaque libellé et chaque valeur de la vue, et aucun autre libellé de champ (CP-10, CP-11).
      const rows = printedRows(json);
      for (const [label, value] of rows) {
        expect(printed).toContain(label);
        expect(printed.join('\n')).toContain(value);
      }
      const allLabels = printedRows({
        ozId: '',
        firstName: '',
        lastName: '',
        birthDate: '',
        birthYear: 0,
        nationality: '',
        country: '',
        region: '',
        city: '',
        primaryPosition: null,
        secondaryPosition: null,
        dominantFoot: null,
        heightCm: 0,
        weightKg: 0,
        verificationStatus: 'declared',
        verificationLevel: 0,
        phone: '',
      }).map(([label]) => label);
      expect(printed.filter((text) => allLabels.includes(text)).sort()).toEqual(
        rows.map(([label]) => label).sort(),
      );
      if (!('phone' in json)) expect(printed.join('\n')).not.toContain(PLAYER_PHONE);
    },
  );

  it(
    SEARCHERS.includes(reader)
      ? typeof expected === 'number'
        ? 'recherche : absent'
        : 'recherche : la vue de la fiche, sans téléphone'
      : 'recherche : refus 403',
    async () => {
      const response = await request(server)
        .get('/players')
        .query({ q: 'Synthétique', limit: 50 })
        .set('Origin', ORIGIN)
        .set('Authorization', `Bearer ${readers.get(reader)?.token ?? ''}`);
      if (!SEARCHERS.includes(reader)) {
        expect(response.status).toBe(403);
        expect(JSON.stringify(response.body)).not.toMatch(/Synthétique|Yaoundé|\+237/);
        return;
      }
      expect(response.status).toBe(200);
      const items = (response.body as { items: Record<string, unknown>[] }).items;
      const item = items.find((entry) => entry.ozId === targets.get(target));
      if (typeof expected === 'number') {
        expect(item).toBeUndefined();
        return;
      }
      expect(item).toBeDefined();
      const keys = Object.keys(item ?? {}).sort();
      expect(keys).toEqual(
        PLAYER_VIEWS[expected].fields.filter((field) => field !== 'phone').sort(),
      );
      expect(JSON.stringify(items)).not.toContain(PLAYER_PHONE);
    },
  );

  it(
    EXPORTERS.includes(reader)
      ? typeof expected === 'number'
        ? 'export CSV : absent'
        : 'export CSV : la vue de la recherche, champ pour champ, sans téléphone'
      : 'export CSV : refus 403',
    async () => {
      const as = (path: string) =>
        request(server)
          .get(path)
          .query({ q: 'Synthétique' })
          .set('Origin', ORIGIN)
          .set('Authorization', `Bearer ${readers.get(reader)?.token ?? ''}`);
      const exported = await as('/players/export.csv');
      if (!EXPORTERS.includes(reader)) {
        expect(exported.status).toBe(403);
        expect(exported.text).not.toMatch(/Synthétique|Yaoundé|\+237/);
        return;
      }
      expect(exported.status).toBe(200);
      expect(exported.text).not.toContain(PLAYER_PHONE);
      const [header = [], ...rows] = parseCsv(exported.text);
      expect(header).not.toContain('phone');
      const row = rows.find((cells) => cells[header.indexOf('ozId')] === targets.get(target));
      if (typeof expected === 'number') {
        expect(row).toBeUndefined();
        return;
      }
      expect(row).toBeDefined();
      const items = (
        (await as('/players').expect(200)).body as { items: Record<string, unknown>[] }
      ).items;
      const item = items.find((entry) => entry.ozId === targets.get(target)) ?? {};
      // Chaque colonne : la valeur JSON de la vue, vide hors vue (CP-10, CP-11).
      for (const [index, column] of header.entries()) {
        if (column === 'ref') continue;
        const value = item[column];
        expect(row?.[index], column).toBe(
          value === null || value === undefined ? '' : String(value as string | number),
        );
        if (!PLAYER_VIEWS[expected].fields.includes(column as never)) {
          expect(row?.[index], `${column} hors vue`).toBe('');
        }
      }
    },
  );
});
