import type { RbacRole } from '@oz/auth';
import { cleanKey, type DocumentStorage } from '@oz/storage';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ApiError } from '../src/common/errors/api-error.js';
import { DOCUMENT_STORAGE } from '../src/document/document.tokens.js';
import {
  formToken,
  RELAXED_RATE_LIMITS,
  startAuthHarness,
  tokenIn,
  type AuthHarness,
} from './auth-harness.js';

// Lecture des documents (lot 1.9ca, EX-110 n° 6 et n° 8) sur la pile réelle : PostgreSQL, Redis,
// SeaweedFS. CP-21 : seule une pièce saine a une URL ; CP-22 : l'URL ne sert rien sans signature
// valide ni après 5 minutes ; chaque URL délivrée est inscrite au journal d'audit.

const PASSWORD = 'correct horse battery staple';
const ORIGIN = 'http://localhost:3000';
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

let harness: AuthHarness;
let server: App;
let storage: DocumentStorage;
let counter = 0;

interface Account {
  readonly userId: string;
  readonly token: string;
}

async function account(role?: RbacRole, organizationId: string | null = null): Promise<Account> {
  const address = `lecture-${String(++counter)}@example.test`;
  await request(server)
    .post('/auth/register')
    .send({ email: address, password: PASSWORD, formToken: formToken() })
    .expect(202);
  const token = tokenIn(await harness.mailTo(address, 'Confirmez votre adresse email'));
  await request(server).post('/auth/verify-email').send({ token }).expect(200);
  const { rows } = await harness.db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [
    address,
  ]);
  const userId = rows[0]?.id ?? '';
  const login = await request(server)
    .post('/auth/login')
    .send({ email: address, password: PASSWORD })
    .expect(200);
  if (role !== undefined) {
    await harness.db.query(
      `INSERT INTO user_roles (user_id, role, organization_id) VALUES ($1, $2, $3)`,
      [userId, role, organizationId],
    );
    // Rôles à 2FA obligatoire : posée ici, le parcours d'enrôlement a sa propre suite.
    await harness.db.query(
      `UPDATE users SET totp_secret_encrypted = '\\x00', totp_enabled_at = now() WHERE id = $1`,
      [userId],
    );
  }
  return { userId, token: (login.body as { accessToken: string }).accessToken };
}

async function player(userId: string | null, birthDate = '1995-03-04'): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `INSERT INTO players (user_id, first_name, last_name, birth_date, nationality, country, verification_status)
     VALUES ($1, 'Joueur', 'Synthétique', $2, 'CM', 'CM', 'declared') RETURNING id`,
    [userId, birthDate],
  );
  return rows[0]?.id ?? '';
}

async function organization(type: string): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `INSERT INTO organizations (type, name, country, verification_status)
     VALUES ($1, 'Organisation synthétique', 'CM', 'verified') RETURNING id`,
    [type],
  );
  return rows[0]?.id ?? '';
}

type Status = 'pending' | 'clean' | 'infected' | 'rejected' | 'error';

/**
 * Pièce telle que l'analyse (lot 1.9b) la laisse : saine, fichier sous `clean/<id>` ; sinon aucun
 * fichier servable. `uploadedBy` : un compte quelconque, la lecture ne dépend pas du déposant.
 */
async function document(
  subject: { playerId?: string; organizationId?: string },
  uploadedBy: string,
  status: Status = 'clean',
): Promise<string> {
  const { rows } = await harness.db.query<{ id: string }>(
    `WITH n AS (SELECT oz_uuid_v7() AS id)
     INSERT INTO documents (id, type, player_id, organization_id, uploaded_by, storage_key, mime_type,
       size_bytes, sha256, av_status, rejection_reason, retention_until)
     SELECT n.id,
       CASE WHEN $2::uuid IS NULL THEN 'identity_document' ELSE 'organization_registration' END::document_type,
       $1, $2, $3, CASE WHEN $4 = 'clean' THEN 'clean/' ELSE 'quarantine/' END || n.id, 'image/png',
       $5, repeat('a', 64), $4::av_status, CASE WHEN $4 = 'rejected' THEN 'dimensions' END,
       now() + interval '90 days'
     FROM n RETURNING id::text`,
    [subject.playerId ?? null, subject.organizationId ?? null, uploadedBy, status, PNG.length],
  );
  const id = rows[0]?.id ?? '';
  if (status === 'clean') await storage.put(cleanKey(id), PNG, 'image/png');
  return id;
}

const readUrl = (token: string | undefined, id: string) => {
  const pending = request(server).get(`/documents/${id}/url`).set('Origin', ORIGIN);
  return token === undefined ? pending : pending.set('Authorization', `Bearer ${token}`);
};

interface Granted {
  readonly url: string;
  readonly expiresAt: string;
}

const granted = async (token: string, id: string): Promise<Granted> =>
  (await readUrl(token, id).expect(200)).body as Granted;

const readsOf = async (id: string) =>
  (
    await harness.db.query<{ actor_user_id: string; metadata: Record<string, unknown> }>(
      `SELECT actor_user_id::text, metadata FROM audit_log
       WHERE target_id = $1 AND action = 'document.read.granted' ORDER BY chain_position`,
      [id],
    )
  ).rows;

const errorCode = (response: { body: unknown }): string | undefined =>
  (response.body as Partial<ApiError>).code;

beforeAll(async () => {
  harness = await startAuthHarness({ FEATURE_DOCUMENTS: 'true' });
  server = harness.app.getHttpServer();
  storage = harness.app.get<DocumentStorage>(DOCUMENT_STORAGE, { strict: false });
}, 240_000);
afterAll(async () => {
  await harness.stop();
});
beforeEach(async () => {
  await harness.setRateLimits(RELAXED_RATE_LIMITS);
});

describe('GET /documents/:id/url', () => {
  it('titulaire : URL de 5 minutes, octets de clean/, type imposé, téléchargement, sans cache', async () => {
    const owner = await account('player');
    const id = await document({ playerId: await player(owner.userId) }, owner.userId);
    const before = Date.now();
    const response = await readUrl(owner.token, id).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.body as Granted;
    expect(Object.keys(body).sort()).toEqual(['expiresAt', 'url']);
    expect(new URL(body.url).pathname).toMatch(new RegExp(`/clean/${id}$`));
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(before + 290_000);
    expect(new Date(body.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + 300_000);

    const file = await fetch(body.url);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('content-disposition')).toBe('attachment');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PNG);
  });

  it('audit : une ligne `document.read.granted` par URL, au nom de l’acteur, sans URL ni clé', async () => {
    const owner = await account('player');
    const id = await document({ playerId: await player(owner.userId) }, owner.userId);
    await granted(owner.token, id);
    await granted(owner.token, id);
    const rows = await readsOf(id);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      actor_user_id: owner.userId,
      metadata: { document_type: 'identity_document' },
    });
    expect(JSON.stringify(rows)).not.toMatch(/clean\/|X-Amz|http/);
  });

  it.each(['pending', 'infected', 'rejected', 'error'] as const)(
    'CP-21 : pièce %s, même 404, ni URL ni audit',
    async (status) => {
      const owner = await account('player');
      const id = await document({ playerId: await player(owner.userId) }, owner.userId, status);
      const refused = await readUrl(owner.token, id).expect(404);
      expect(errorCode(refused)).toBe('NOT_FOUND');
      expect(await readsOf(id)).toEqual([]);
    },
  );

  it('CP-21 : pièce supprimée ou purgée, inconnue ou mal formée : 404', async () => {
    const owner = await account('player');
    const playerId = await player(owner.userId);
    const removed = await document({ playerId }, owner.userId);
    await harness.db.query(`UPDATE documents SET deleted_at = now() WHERE id = $1`, [removed]);
    const purged = await document({ playerId }, owner.userId);
    await harness.db.query(`UPDATE documents SET purged_at = now() WHERE id = $1`, [purged]);
    for (const id of [removed, purged, '0193b0a2-7c1e-7d2a-9b3c-4d5e6f708192', 'pas-un-uuid']) {
      expect(errorCode(await readUrl(owner.token, id).expect(404))).toBe('NOT_FOUND');
    }
    expect([...(await readsOf(removed)), ...(await readsOf(purged))]).toEqual([]);
  });

  it('pièce d’un autre joueur : 404, rien n’est révélé', async () => {
    const owner = await account('player');
    const stranger = await account('player');
    const id = await document({ playerId: await player(owner.userId) }, owner.userId);
    expect(errorCode(await readUrl(stranger.token, id).expect(404))).toBe('NOT_FOUND');
  });

  it('tuteur : pièce de l’enfant mineur, plus après sa majorité', async () => {
    const guardian = await account('guardian');
    const { rows } = await harness.db.query<{ id: string }>(
      `INSERT INTO guardians (user_id, first_name, last_name, relationship, country, verification_status)
       VALUES ($1, 'Tuteur', 'Synthétique', 'mother', 'CM', 'verified') RETURNING id`,
      [guardian.userId],
    );
    const child = await player(null, '2014-05-06');
    const adult = await player(null, '2000-05-06');
    await harness.db.query(`UPDATE players SET guardian_id = $1 WHERE id = ANY($2::uuid[])`, [
      rows[0]?.id,
      [child, adult],
    ]);
    await granted(guardian.token, await document({ playerId: child }, guardian.userId));
    await readUrl(guardian.token, await document({ playerId: adult }, guardian.userId)).expect(404);
  });

  it('académie : joueurs rattachés et son justificatif ; rien d’une autre organisation', async () => {
    const own = await organization('academy');
    const other = await organization('academy');
    const member = await account('academy', own);
    const attached = await player(null);
    const elsewhere = await player(null);
    await harness.db.query(`UPDATE players SET organization_id = $1 WHERE id = $2`, [
      own,
      attached,
    ]);
    await harness.db.query(`UPDATE players SET organization_id = $1 WHERE id = $2`, [
      other,
      elsewhere,
    ]);
    await granted(member.token, await document({ playerId: attached }, member.userId));
    await granted(member.token, await document({ organizationId: own }, member.userId));
    await readUrl(member.token, await document({ playerId: elsewhere }, member.userId)).expect(404);
    await readUrl(member.token, await document({ organizationId: other }, member.userId)).expect(
      404,
    );
  });

  it('recruteur sans KYC 3 : justificatif de son agence seulement', async () => {
    const agency = await organization('agency');
    const recruiter = await account('recruiter', agency);
    await granted(recruiter.token, await document({ organizationId: agency }, recruiter.userId));
    await readUrl(
      recruiter.token,
      await document({ playerId: await player(null) }, recruiter.userId),
    ).expect(404);
  });

  it('administrateur : toute pièce (joueur, organisation), chaque lecture journalisée', async () => {
    const admin = await account('admin');
    const owner = await account('player');
    const own = await document({ playerId: await player(owner.userId) }, owner.userId);
    const registration = await document(
      { organizationId: await organization('club') },
      owner.userId,
    );
    await granted(admin.token, own);
    await granted(admin.token, registration);
    expect((await readsOf(own))[0]?.actor_user_id).toBe(admin.userId);
    expect((await readsOf(registration))[0]?.actor_user_id).toBe(admin.userId);
  });

  it('sans session : 401 ; sans rôle : 403', async () => {
    const owner = await account('player');
    const id = await document({ playerId: await player(owner.userId) }, owner.userId);
    await readUrl(undefined, id).expect(401);
    const nobody = await account();
    expect(errorCode(await readUrl(nobody.token, id).expect(403))).toBe('AUTHZ_FORBIDDEN');
  });

  it('au-delà de la limite par compte : 429 avec Retry-After, sans audit', async () => {
    await harness.setRateLimits({
      ...RELAXED_RATE_LIMITS,
      document_read_account: { limit: 2, windowSeconds: 3600 },
    });
    const owner = await account('player');
    const id = await document({ playerId: await player(owner.userId) }, owner.userId);
    await granted(owner.token, id);
    await granted(owner.token, id);
    const refused = await readUrl(owner.token, id).expect(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
    expect(await readsOf(id)).toHaveLength(2);
  });
});

describe('URL délivrée (CP-22)', () => {
  const issued = async (): Promise<URL> => {
    const owner = await account('player');
    const id = await document({ playerId: await player(owner.userId) }, owner.userId);
    return new URL((await granted(owner.token, id)).url);
  };

  it('sans signature : 403, aucun octet', async () => {
    const url = await issued();
    const response = await fetch(`${url.origin}${url.pathname}`);
    expect(response.status).toBe(403);
    expect(Buffer.from(await response.arrayBuffer()).includes(Buffer.from(PNG))).toBe(false);
  });

  it('signature altérée ou réponse détournée (type, disposition) : 403', async () => {
    const url = await issued();
    const signature = url.searchParams.get('X-Amz-Signature') ?? '';
    for (const [name, value] of [
      ['X-Amz-Signature', `${signature.startsWith('0') ? '1' : '0'}${signature.slice(1)}`],
      ['response-content-type', 'text/html'],
      ['response-content-disposition', 'inline'],
      ['X-Amz-Expires', '604800'],
    ] as const) {
      const altered = new URL(url);
      altered.searchParams.set(name, value);
      expect((await fetch(altered)).status).toBe(403);
    }
  });
});
