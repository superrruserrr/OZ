import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RELAXED_RATE_LIMITS, startAuthHarness, type AuthHarness } from './auth-harness.js';
import { pdfTexts } from './pdf-text.js';
import { PLAYER_PHONE, playerFixtures, type PlayerFixtures } from './player-fixtures.js';

// QR du profil, carte OZ ID et export PDF filigrané (lot 1.13b, EX-115 n° 4 et 5, EX-119) sur la
// pile réelle : droits, en-têtes, audit dans la transaction, limite, journal sans OZ ID. Le contenu
// exact de l'export par rôle est prouvé par `player-payload.int.test.ts`.

const ORIGIN = 'http://localhost:3000';

let harness: AuthHarness;
let server: App;
let account: PlayerFixtures['account'];
let organization: PlayerFixtures['organization'];
let verifiedGuardian: PlayerFixtures['verifiedGuardian'];
let player: PlayerFixtures['player'];

const binary = (res: NodeJS.ReadableStream, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => {
    done(null, Buffer.concat(chunks));
  });
};
const get = (token: string, ozId: string, path: string) =>
  request(server)
    .get(`/players/${ozId}/${path}`)
    .set('Origin', ORIGIN)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse(binary as never);
const auditOf = async (playerId: string, action: string) =>
  (
    await harness.db.query<{ actor_user_id: string; metadata: unknown }>(
      `SELECT actor_user_id::text, metadata FROM audit_log
       WHERE target_id = $1 AND action = $2 ORDER BY chain_position`,
      [playerId, action],
    )
  ).rows;

beforeAll(async () => {
  harness = await startAuthHarness();
  server = harness.app.getHttpServer();
  ({ account, organization, verifiedGuardian, player } = await playerFixtures(
    harness,
    'documents',
  ));
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('GET /players/:ozId/qr.svg', () => {
  it('lecteur autorisé : SVG autonome, sans cache, sans script ; OZ ID absent du journal', async () => {
    const club = await account('club', await organization('club'));
    const target = await player();
    const response = await get(club.token, target.ozId, 'qr.svg').expect(200);
    expect(response.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    const svg = (response.body as Buffer).toString('utf8');
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).not.toMatch(/<script|href|<text|OZ-/);
    expect(JSON.stringify(harness.logs.lines())).not.toContain(target.ozId.slice(3));
  });

  it('mineur non publié pour un club tiers : même 404 qu’une fiche inconnue (CP-12)', async () => {
    const club = await account('club', await organization('club'));
    const guardian = await account('guardian');
    const minor = await player({
      birthDate: '2012-06-07',
      guardianId: await verifiedGuardian(guardian.userId),
    });
    const hidden = await get(club.token, minor.ozId, 'qr.svg').expect(404);
    const unknown = await get(club.token, 'OZ-CM-26-000000-0', 'qr.svg').expect(404);
    const errorOf = (body: unknown) => {
      const { code, message } = JSON.parse((body as Buffer).toString()) as Record<string, unknown>;
      return { code, message };
    };
    expect(errorOf(hidden.body)).toEqual(errorOf(unknown.body));
  });
});

describe('GET /players/:ozId/card.pdf', () => {
  it('titulaire majeur : PDF en pièce jointe, contenu de la carte, audit', async () => {
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    const response = await get(owner.token, target.ozId, 'card.pdf').expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe('attachment; filename="carte-oz-id.pdf"');
    expect(response.headers['cache-control']).toBe('no-store');
    const texts = pdfTexts(response.body as Buffer).join('\n');
    expect(texts).toContain(target.ozId);
    expect(texts).toContain('Joueur Synthétique');
    expect(texts).toContain('Identité vérifiée');
    expect(texts).toContain('le statut en ligne fait foi');
    expect(texts).not.toMatch(/1995|Yaoundé|\+237/);
    expect(await auditOf(target.id, 'player.card.issued')).toEqual([
      { actor_user_id: owner.userId, metadata: { view: 'card' } },
    ]);
  });

  it('tuteur vérifié d’un mineur : carte ; autre tuteur : 404 ; club : 403 de la matrice', async () => {
    const guardian = await account('guardian');
    const other = await account('guardian');
    await verifiedGuardian(other.userId);
    const minor = await player({
      birthDate: '2012-06-07',
      guardianId: await verifiedGuardian(guardian.userId),
    });
    await get(guardian.token, minor.ozId, 'card.pdf').expect(200);
    await get(other.token, minor.ozId, 'card.pdf').expect(404);
    const club = await account('club', await organization('club'));
    await get(club.token, minor.ozId, 'card.pdf').expect(403);
    expect(await auditOf(minor.id, 'player.card.issued')).toHaveLength(1);
  });

  it('mineur titulaire : pas de carte (son tuteur la demande)', async () => {
    const minor = await account('player');
    const own = await player({ userId: minor.userId, birthDate: '2012-06-07' });
    await get(minor.token, own.ozId, 'card.pdf').expect(404);
  });
});

describe('GET /players/:ozId/profile.pdf', () => {
  it('filigrane au nom masqué du lecteur sur chaque page, audit de l’export seul', async () => {
    const admin = await account('admin');
    const target = await player();
    const response = await get(admin.token, target.ozId, 'profile.pdf').expect(200);
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="fiche-joueur-oz.pdf"',
    );
    const texts = pdfTexts(response.body as Buffer);
    const marks = texts.filter((text) => text.startsWith('Exporté par '));
    expect(marks.length).toBeGreaterThan(3);
    expect(marks[0]).toMatch(
      /^Exporté par d\*\*\*@example\.test \(admin\) le \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/,
    );
    expect(texts.join('\n')).toContain(PLAYER_PHONE);
    expect(await auditOf(target.id, 'player.profile.exported')).toEqual([
      { actor_user_id: admin.userId, metadata: { view: 'PlayerAdminView' } },
    ]);
    // L'export a son propre audit : pas de lecture journalisée en double.
    expect(await auditOf(target.id, 'player.profile.viewed')).toEqual([]);
  });

  it('20 documents par heure et par compte : 429 avec Retry-After', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      player_document_account: { limit: 1, windowSeconds: 3600 },
    });
    const owner = await account('player');
    const target = await player({ userId: owner.userId });
    await get(owner.token, target.ozId, 'profile.pdf').expect(200);
    const limited = await get(owner.token, target.ozId, 'card.pdf').expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(await auditOf(target.id, 'player.card.issued')).toEqual([]);
  });
});
